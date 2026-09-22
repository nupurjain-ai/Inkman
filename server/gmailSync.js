const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { isQuotaError_ } = require('./auth');
const { extractTransactions, generateText } = require('./llmProviders');
const {
  insertTransaction,
  transactionExists,
  upsertMerchantCategory,
  getAllMerchantCategories
} = require('./models/transactions');

const AGENT_CONFIG_PATH = path.join(__dirname, '..', 'agent.json');
// UPI transaction alerts come from whichever bank/app the user has —
// filtering by subject rather than a specific sender (e.g. GPay's own
// address) is what actually matches real inboxes, since alerts often
// come from the bank (e.g. "alerts@hdfcbank.bank.in") rather than GPay.
const SEARCH_QUERY = 'subject:UPI';
const SYNC_WINDOW = 'newer_than:60d';
const BATCH_SIZE = 20;
// A single sync call only processes this many NEW messages. A large
// first-time backfill (hundreds of messages) will exceed Gmail's
// per-minute-per-user quota if attempted in one shot regardless of
// backoff — capping keeps each call fast and comfortably under quota,
// and repeated Sync clicks work through the rest incrementally (already
// stored messages are always skipped, so nothing is reprocessed).
const MAX_NEW_MESSAGES_PER_SYNC = 40;

// Read fresh each sync (not cached) so editing agent.json takes effect
// without a restart.
function loadSystemPrompt() {
  const raw = fs.readFileSync(AGENT_CONFIG_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.system_prompt || typeof parsed.system_prompt !== 'string') {
    throw new Error('agent.json must contain a non-empty "system_prompt" string');
  }
  return parsed.system_prompt;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function decodeBase64Url(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
}

function htmlToText(html) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|table|li)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

// Many transaction-alert emails (bank InstaAlerts in particular) are
// HTML-only, with no text/plain part at all — falling back to
// text/html and stripping tags is required, not optional, or the
// extraction gets an empty body and correctly refuses to invent numbers
// it can't see.
function extractPlainText(message) {
  const payload = message.payload;
  if (!payload) return '';
  if (!payload.parts && payload.body && payload.body.data) {
    return decodeBase64Url(payload.body.data);
  }

  const plainChunks = [];
  const htmlChunks = [];
  (function walk(part) {
    if (!part) return;
    if (part.mimeType === 'text/plain' && part.body && part.body.data) {
      plainChunks.push(decodeBase64Url(part.body.data));
    } else if (part.mimeType === 'text/html' && part.body && part.body.data) {
      htmlChunks.push(decodeBase64Url(part.body.data));
    } else if (part.parts) {
      part.parts.forEach(walk);
    }
  })(payload);

  if (plainChunks.length > 0) return plainChunks.join('\n');
  if (htmlChunks.length > 0) return htmlToText(htmlChunks.join('\n'));
  return '';
}

function getHeader(message, name) {
  const headers = (message.payload && message.payload.headers) || [];
  const found = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return found ? found.value : '';
}

const FETCH_CONCURRENCY = 2;

// Runs `fn` over `items` with at most `limit` in flight at once — plain
// sequential fetching of a couple hundred messages is both slow and more
// likely to trip Gmail's per-minute-per-user quota than a small concurrent
// pool.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// Gmail quota errors are real and expected on a large first-time backfill
// — retry with backoff instead of letting one throttled request fail the
// whole sync (and, before the isAuthError_ fix, wrongly clear the token).
async function withQuotaRetry_(fn, retries) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= retries || !isQuotaError_(err)) throw err;
      // A per-*minute* quota needs a real wait, not a quick backoff —
      // 10s/20s rather than the sub-second-to-few-second scale that's
      // right for Gemini's per-request transient errors elsewhere in
      // this file.
      await new Promise((resolve) => setTimeout(resolve, 10000 * Math.pow(2, attempt)));
    }
  }
}

// Any error thrown here is necessarily from the Gmail API, so it's tagged
// as such — the caller must NOT treat an unrelated Gemini-side error the
// same way (e.g. clearing Gmail credentials because Gemini returned a
// 403), which is exactly the bug this tag exists to prevent.
async function fetchNewGpayEmails(oauth2Client) {
  try {
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const query = `${SEARCH_QUERY} ${SYNC_WINDOW}`;

    let refs = [];
    let pageToken;
    do {
      const res = await withQuotaRetry_(
        () => gmail.users.messages.list({ userId: 'me', q: query, pageToken, maxResults: 100 }),
        3
      );
      refs = refs.concat(res.data.messages || []);
      pageToken = res.data.nextPageToken;
    } while (pageToken);

    const allNewRefs = refs.filter((r) => !transactionExists(r.id));
    const newRefs = allNewRefs.slice(0, MAX_NEW_MESSAGES_PER_SYNC);
    const hasMore = allNewRefs.length > newRefs.length;

    const emails = await mapWithConcurrency(newRefs, FETCH_CONCURRENCY, async (ref) => {
      const full = await withQuotaRetry_(
        () => gmail.users.messages.get({ userId: 'me', id: ref.id, format: 'full' }),
        2
      );
      return {
        id: ref.id,
        subject: getHeader(full.data, 'Subject'),
        body: extractPlainText(full.data).slice(0, 3000)
      };
    });

    return { emails, hasMore };
  } catch (err) {
    err.isGmailError = true;
    throw err;
  }
}

/**
 * Fetches new GPay emails, has the configured LLM provider extract +
 * categorize each one (grounded in the actual email text, not recalled
 * from memory), and deterministically stores the result. Per-day/month
 * totals are plain SQL sums over the stored amounts — arithmetic never
 * goes through the model.
 */
async function runGmailSync(oauth2Client) {
  const systemPrompt = loadSystemPrompt();

  const { emails, hasMore } = await fetchNewGpayEmails(oauth2Client);
  if (emails.length === 0) return { newCount: 0, skippedCount: 0, hasMore: false };

  let stored = 0;
  let skipped = 0;

  for (const batch of chunk(emails, BATCH_SIZE)) {
    const knownMerchants = getAllMerchantCategories();
    const extracted = await extractTransactions(systemPrompt, batch, knownMerchants);

    for (const txn of extracted) {
      if (txn.type !== 'debit') { skipped++; continue; }
      if (!txn.amount || !txn.date || transactionExists(txn.gmail_message_id)) { skipped++; continue; }

      insertTransaction({
        gmailMessageId: txn.gmail_message_id,
        source: 'gmail',
        date: txn.date,
        amount: txn.amount,
        party: txn.party,
        category: txn.category
      });
      upsertMerchantCategory(txn.party, txn.category);
      stored++;
    }
  }

  return { newCount: stored, skippedCount: skipped, hasMore };
}

/**
 * Natural-language recap of a single day's spending, generated from
 * already-computed totals/categories — the model is only phrasing known
 * facts here, not extracting or computing anything, so there's nothing
 * for it to get numerically wrong.
 */
async function summarizeDay(date, spent, budget, transactions) {
  if (transactions.length === 0) {
    return `No spending recorded for ${date}.`;
  }

  const systemPrompt = loadSystemPrompt();

  const lines = transactions.map((t) =>
    `${t.source === 'cash' ? 'Cash' : 'UPI'} ₹${t.amount} to ${t.party || 'unknown'} (${t.category || 'Uncategorized'})${t.is_exception ? ' [exception: ' + t.exception_name + ']' : ''}`
  );

  const userPrompt =
    `Summarize this day's spending in 1-2 short sentences, friendly and plain, no markdown.\n` +
    `Date: ${date}\nBudget: ₹${budget}\nTotal spent (excluding exceptions): ₹${spent}\n` +
    `Transactions:\n${lines.join('\n')}`;

  const text = await generateText(systemPrompt, userPrompt);
  return text || `You spent ₹${spent} on ${date}.`;
}

module.exports = { runGmailSync, loadSystemPrompt, summarizeDay };
