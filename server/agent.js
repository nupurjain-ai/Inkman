const fs = require('fs');
const path = require('path');
const { GoogleGenAI, Type } = require('@google/genai');
const { searchGmailBySubject } = require('./gmailSearch');

const AGENT_CONFIG_PATH = path.join(__dirname, '..', 'agent.json');
const MODEL = 'gemini-3.6-flash';

let genAI = null;
function client() {
  if (!genAI) genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return genAI;
}

/**
 * Read fresh on every call (not cached) so editing agent.json takes
 * effect immediately — a restart isn't required, though it still works
 * if you do restart since there's nothing else to reload.
 */
function loadSystemPrompt() {
  const raw = fs.readFileSync(AGENT_CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.system_prompt || typeof parsed.system_prompt !== 'string') {
    throw new Error('agent.json must contain a non-empty "system_prompt" string');
  }
  return parsed.system_prompt;
}

function isTransientError_(err) {
  const code = err.status || err.code || (err.response && err.response.status);
  return code === 503 || code === 429 || /UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(err.message || '');
}

async function generateWithRetry_(ai, params, retries) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      if (attempt >= retries || !isTransientError_(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
}

const SEARCH_TOOL = {
  name: 'search_gmail',
  description: "Searches the connected Gmail inbox for messages with a given keyword in the subject line, within the last N days, and returns how many matched.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      keyword: { type: Type.STRING, description: 'Subject-line keyword to search for, e.g. "UPI".' },
      days: { type: Type.NUMBER, description: 'How many days back to search.' }
    },
    required: ['keyword', 'days']
  }
};

/**
 * Runs the agent: Gemini decides to call search_gmail (guided by
 * agent.json's system prompt), we execute the real Gmail search, and
 * Gemini's reply becomes the human-readable summary. The count shown to
 * the user always comes from our own tool execution, never from the
 * model restating a number, so a hallucinated figure can't reach the UI.
 */
async function runAgentSearch(oauth2Client, days) {
  const systemPrompt = loadSystemPrompt();
  const ai = client();

  const contents = [
    {
      role: 'user',
      parts: [{ text: `Search for UPI-related emails from the last ${days} days and tell me how many you found.` }]
    }
  ];

  const config = {
    systemInstruction: systemPrompt,
    tools: [{ functionDeclarations: [SEARCH_TOOL] }]
  };

  let result = await generateWithRetry_(ai, { model: MODEL, contents, config }, 2);
  let toolResult = null;

  // Single round-trip is enough for this one-tool agent; loop defensively
  // in case the model calls it more than once before answering.
  for (let i = 0; i < 3 && result.functionCalls && result.functionCalls.length > 0; i++) {
    // Pull the raw Part (not just the bare FunctionCall) so any
    // thoughtSignature Gemini 3 attaches gets carried back into history
    // verbatim — replaying a reconstructed functionCall without it is
    // rejected with INVALID_ARGUMENT.
    const responseParts = (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts) || [];
    const callPart = responseParts.find((p) => p.functionCall) || { functionCall: result.functionCalls[0] };
    const call = callPart.functionCall;
    const args = call.args || {};
    toolResult = await searchGmailBySubject(oauth2Client, {
      keyword: args.keyword || 'UPI',
      days: args.days || days
    });

    contents.push({ role: 'model', parts: [callPart] });
    contents.push({
      role: 'user',
      parts: [{ functionResponse: { name: call.name, response: toolResult } }]
    });

    result = await generateWithRetry_(ai, { model: MODEL, contents, config }, 2);
  }

  if (!toolResult) {
    // Model answered without calling the tool — don't trust a guessed
    // count; run the deterministic search ourselves as a fallback.
    toolResult = await searchGmailBySubject(oauth2Client, { keyword: 'UPI', days });
  }

  return {
    count: toolResult.count,
    query: toolResult.query,
    message: (result.text || '').trim()
  };
}

module.exports = { runAgentSearch, loadSystemPrompt };
