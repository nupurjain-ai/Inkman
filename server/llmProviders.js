const { GoogleGenAI, Type } = require('@google/genai');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const { getLlmSettings } = require('./models/llmSettings');

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

// One reasonable default model per provider. Not user-configurable yet —
// only the provider + key are exposed in Settings for now.
const DEFAULT_MODELS = {
  gemini: 'gemini-3.6-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-5',
  groq: 'openai/gpt-oss-120b'
};

/**
 * Which provider/key to actually use: a user-saved key from the Settings
 * modal takes priority; otherwise fall back to GEMINI_API_KEY from .env
 * so existing local/deployed setups keep working unchanged.
 */
function resolveProvider() {
  const saved = getLlmSettings();
  if (saved.provider && saved.apiKey) {
    return { provider: saved.provider, apiKey: saved.apiKey };
  }
  if (process.env.GEMINI_API_KEY) {
    return { provider: 'gemini', apiKey: process.env.GEMINI_API_KEY };
  }
  const err = new Error('No LLM API key configured. Set one via the Settings (⚙) modal, or set GEMINI_API_KEY in .env.');
  err.noApiKey = true;
  throw err;
}

function isRetryableStatus(err) {
  const status = err.status || (err.response && err.response.status);
  return status === 429 || status === 503;
}

async function withRetry(fn, retries = 2, baseDelayMs = 1000) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isRetryableStatus(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, baseDelayMs * Math.pow(2, attempt)));
    }
  }
}

function buildExtractionPrompt(knownMerchants, emails) {
  const emailBlock = emails
    .map((e) => `--- Email gmail_message_id: ${e.id} ---\nSubject: ${e.subject}\nBody:\n${e.body}`)
    .join('\n\n');
  return (
    `Known merchant categories (reuse exactly, case-insensitive match on merchant): ${JSON.stringify(knownMerchants)}\n\n` +
    `Extract one transaction per email below, keyed by its gmail_message_id.\n\n${emailBlock}`
  );
}

// ---------- Gemini ----------
// Structured output via responseSchema — verified working this session.
// Note: no `date` field is requested from any provider below. Gmail's own
// message timestamp is the actual transaction date and is captured
// deterministically in gmailSync.js — asking the model to also extract a
// date from free-text email body led it to hallucinate wildly wrong years
// on one real batch (2017–2022 instead of 2026). The date it might still
// mention in its reasoning is simply ignored.

const GEMINI_EXTRACTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    transactions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          gmail_message_id: { type: Type.STRING },
          type: { type: Type.STRING, description: '"debit" or "credit"' },
          amount: { type: Type.NUMBER },
          party: { type: Type.STRING, description: 'The payee or payer name.' },
          category: { type: Type.STRING }
        },
        required: ['gmail_message_id', 'type', 'amount', 'party', 'category']
      }
    }
  },
  required: ['transactions']
};

async function geminiExtract(apiKey, systemPrompt, promptText) {
  const ai = new GoogleGenAI({ apiKey });
  const result = await withRetry(() => ai.models.generateContent({
    model: DEFAULT_MODELS.gemini,
    contents: [{ role: 'user', parts: [{ text: promptText }] }],
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_EXTRACTION_SCHEMA
    }
  }));
  const parsed = JSON.parse(result.text);
  return parsed.transactions || [];
}

async function geminiGenerateText(apiKey, systemPrompt, userPrompt) {
  const ai = new GoogleGenAI({ apiKey });
  const result = await withRetry(() => ai.models.generateContent({
    model: DEFAULT_MODELS.gemini,
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    config: { systemInstruction: systemPrompt }
  }));
  return (result.text || '').trim();
}

// ---------- OpenAI / Groq (Groq is OpenAI-API-compatible) ----------
// Using the broadly-supported "JSON mode" (response_format: json_object)
// plus an explicit shape description in the prompt, rather than OpenAI's
// newer strict Structured Outputs — that needs specific model support
// that Groq's hosted models don't uniformly have, so this is the option
// that works consistently across both.

const JSON_SHAPE_INSTRUCTIONS =
  'Respond with ONLY a JSON object of this exact shape, no other text, no markdown fences: ' +
  '{"transactions": [{"gmail_message_id": "string", "type": "debit or credit", ' +
  '"amount": number, "party": "string", "category": "string"}]}';

async function openAiCompatibleExtract(apiKey, baseURL, model, systemPrompt, promptText) {
  const client = new OpenAI({ apiKey, baseURL });
  const completion = await withRetry(() => client.chat.completions.create({
    model,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${promptText}\n\n${JSON_SHAPE_INSTRUCTIONS}` }
    ]
  }));
  const parsed = JSON.parse(completion.choices[0].message.content);
  return parsed.transactions || [];
}

async function openAiCompatibleGenerateText(apiKey, baseURL, model, systemPrompt, userPrompt) {
  const client = new OpenAI({ apiKey, baseURL });
  const completion = await withRetry(() => client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  }));
  return (completion.choices[0].message.content || '').trim();
}

// ---------- Anthropic ----------
// No native JSON-schema response mode — structured output is done via a
// forced tool call, then reading the tool's parsed input back out.

const ANTHROPIC_EXTRACTION_TOOL = {
  name: 'record_transactions',
  description: 'Records the transactions extracted from the given emails.',
  input_schema: {
    type: 'object',
    properties: {
      transactions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            gmail_message_id: { type: 'string' },
            type: { type: 'string', description: '"debit" or "credit"' },
            amount: { type: 'number' },
            party: { type: 'string' },
            category: { type: 'string' }
          },
          required: ['gmail_message_id', 'type', 'amount', 'party', 'category']
        }
      }
    },
    required: ['transactions']
  }
};

async function anthropicExtract(apiKey, systemPrompt, promptText) {
  const client = new Anthropic({ apiKey });
  const response = await withRetry(() => client.messages.create({
    model: DEFAULT_MODELS.anthropic,
    max_tokens: 4096,
    system: systemPrompt,
    tools: [ANTHROPIC_EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'record_transactions' },
    messages: [{ role: 'user', content: promptText }]
  }));
  const toolUse = response.content.find((block) => block.type === 'tool_use');
  return (toolUse && toolUse.input && toolUse.input.transactions) || [];
}

async function anthropicGenerateText(apiKey, systemPrompt, userPrompt) {
  const client = new Anthropic({ apiKey });
  const response = await withRetry(() => client.messages.create({
    model: DEFAULT_MODELS.anthropic,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  }));
  const textBlock = response.content.find((block) => block.type === 'text');
  return (textBlock && textBlock.text || '').trim();
}

// ---------- Public dispatch ----------

/**
 * Has the configured provider extract + categorize transactions from raw
 * email content, grounded in the actual text (not recalled from memory).
 */
async function extractTransactions(systemPrompt, emails, knownMerchants) {
  const { provider, apiKey } = resolveProvider();
  const promptText = buildExtractionPrompt(knownMerchants, emails);

  switch (provider) {
    case 'gemini':
      return geminiExtract(apiKey, systemPrompt, promptText);
    case 'openai':
      return openAiCompatibleExtract(apiKey, undefined, DEFAULT_MODELS.openai, systemPrompt, promptText);
    case 'groq':
      return openAiCompatibleExtract(apiKey, GROQ_BASE_URL, DEFAULT_MODELS.groq, systemPrompt, promptText);
    case 'anthropic':
      return anthropicExtract(apiKey, systemPrompt, promptText);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

/** Plain natural-language generation (used for day summaries). */
async function generateText(systemPrompt, userPrompt) {
  const { provider, apiKey } = resolveProvider();

  switch (provider) {
    case 'gemini':
      return geminiGenerateText(apiKey, systemPrompt, userPrompt);
    case 'openai':
      return openAiCompatibleGenerateText(apiKey, undefined, DEFAULT_MODELS.openai, systemPrompt, userPrompt);
    case 'groq':
      return openAiCompatibleGenerateText(apiKey, GROQ_BASE_URL, DEFAULT_MODELS.groq, systemPrompt, userPrompt);
    case 'anthropic':
      return anthropicGenerateText(apiKey, systemPrompt, userPrompt);
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

module.exports = { extractTransactions, generateText, resolveProvider };
