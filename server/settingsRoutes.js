const express = require('express');
const { getLlmSettings, setLlmSettings, maskKey, VALID_PROVIDERS } = require('./models/llmSettings');
const { DEFAULT_MODELS } = require('./llmProviders');

const router = express.Router();

router.get('/api/settings/llm', (req, res) => {
  const { provider, apiKey, model } = getLlmSettings();
  res.json({
    provider,
    hasKey: !!apiKey,
    maskedKey: maskKey(apiKey),
    model,
    defaultModels: DEFAULT_MODELS
  });
});

router.post('/api/settings/llm', (req, res) => {
  const { provider, apiKey, model } = req.body || {};
  if (!VALID_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: 'invalid_provider' });
  }

  // The key field can be left blank to keep whatever's already saved for
  // this same provider — lets the model be changed on its own without
  // re-pasting a key into a password field that's never shown back.
  const existing = getLlmSettings();
  const trimmedKey = typeof apiKey === 'string' ? apiKey.trim() : '';
  let finalKey;
  if (trimmedKey) {
    if (trimmedKey.length < 8) return res.status(400).json({ error: 'invalid_api_key' });
    finalKey = trimmedKey;
  } else if (existing.provider === provider && existing.apiKey) {
    finalKey = existing.apiKey;
  } else {
    return res.status(400).json({ error: 'invalid_api_key' });
  }

  const trimmedModel = typeof model === 'string' && model.trim() ? model.trim() : null;
  setLlmSettings(provider, finalKey, trimmedModel);
  res.json({ ok: true });
});

module.exports = router;
