const db = require('../db');

const VALID_PROVIDERS = ['gemini', 'openai', 'anthropic', 'groq'];

const getStmt = db.prepare('SELECT provider, api_key, model FROM llm_settings WHERE id = 1');
function getLlmSettings() {
  const row = getStmt.get();
  return { provider: row.provider, apiKey: row.api_key, model: row.model };
}

const setStmt = db.prepare('UPDATE llm_settings SET provider = ?, api_key = ?, model = ? WHERE id = 1');
function setLlmSettings(provider, apiKey, model) {
  setStmt.run(provider, apiKey, model || null);
}

function maskKey(key) {
  if (!key) return null;
  return key.length <= 4 ? '****' : `${'*'.repeat(Math.max(4, key.length - 4))}${key.slice(-4)}`;
}

module.exports = { getLlmSettings, setLlmSettings, maskKey, VALID_PROVIDERS };
