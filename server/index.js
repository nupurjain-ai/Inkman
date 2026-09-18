require('dotenv').config();

const path = require('path');
const express = require('express');
const { router: authRouter, isAuthError_ } = require('./auth');
const { getOAuth2Client, isConnected, clearTokens } = require('./tokenStore');
const { runAgentSearch, loadSystemPrompt } = require('./agent');

const REQUIRED_ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GEMINI_API_KEY'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error('Missing required environment variables: ' + missing.join(', '));
  console.error('Copy .env.example to .env and fill them in.');
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(authRouter);

app.post('/api/search', async (req, res) => {
  const days = Number(req.body && req.body.days) || 30;

  if (!isConnected()) {
    return res.status(401).json({ error: 'not_connected' });
  }

  try {
    const oauth2Client = getOAuth2Client();
    const result = await runAgentSearch(oauth2Client, days);
    res.json(result);
  } catch (err) {
    if (isAuthError_(err)) {
      clearTokens();
      return res.status(401).json({ error: 'not_connected', reason: 'expired' });
    }
    console.error('Search failed:', err);
    res.status(500).json({ error: 'search_failed', detail: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  let promptPreview = '(failed to load agent.json)';
  try {
    const prompt = loadSystemPrompt();
    promptPreview = prompt.length > 80 ? prompt.slice(0, 80) + '...' : prompt;
  } catch (err) {
    console.error('agent.json failed to load at startup:', err.message);
  }
  console.log(`Inkman listening on http://localhost:${PORT}`);
  console.log(`Loaded agent.json system_prompt: "${promptPreview}"`);
});
