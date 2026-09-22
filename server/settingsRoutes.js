const express = require('express');
const { getLlmSettings, setLlmSettings, maskKey, VALID_PROVIDERS } = require('./models/llmSettings');

const router = express.Router();

router.get('/api/settings/llm', (req, res) => {
  const { provider, apiKey } = getLlmSettings();
  res.json({ provider, hasKey: !!apiKey, maskedKey: maskKey(apiKey) });
});

router.post('/api/settings/llm', (req, res) => {
  const { provider, apiKey } = req.body || {};
  if (!VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: 'invalid_provider' });
  }
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
    return res.status(400).json({ error: 'invalid_api_key' });
  }
  setLlmSettings(provider, apiKey.trim());
  res.json({ ok: true });
});

module.exports = router;
