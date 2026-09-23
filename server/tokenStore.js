/**
 * Single-user token persistence. This app runs one Gmail connection at a
 * time (personal use, not multi-tenant), so a flat gitignored JSON file
 * is enough — no session store/DB needed for v1.
 *
 * Lives inside data/ specifically so that a single mounted volume (at
 * data/) covers both this and the SQLite database on a deployed
 * environment like Railway — storing it at the project root instead
 * meant a volume mounted only at data/ would save the database but
 * still lose the Gmail connection on every redeploy.
 */

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const DATA_DIR = path.join(__dirname, '..', 'data');
const TOKEN_PATH = path.join(DATA_DIR, 'gmail-token.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  } catch (err) {
    return null;
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}

function clearTokens() {
  try {
    fs.unlinkSync(TOKEN_PATH);
  } catch (err) {
    // already gone — fine
  }
}

/**
 * Returns an OAuth2 client. If a stored token exists it's attached, and
 * refreshed tokens are persisted automatically as they're issued.
 */
function getOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const stored = loadTokens();
  if (stored) client.setCredentials(stored);

  client.on('tokens', (tokens) => {
    const merged = Object.assign({}, loadTokens() || {}, tokens);
    saveTokens(merged);
  });

  return client;
}

function isConnected() {
  return loadTokens() !== null;
}

module.exports = { getOAuth2Client, isConnected, saveTokens, clearTokens };
