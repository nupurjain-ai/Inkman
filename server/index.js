require('dotenv').config();

const path = require('path');
const express = require('express');
const { router: authRouter, isAuthError_ } = require('./auth');
const { getOAuth2Client, isConnected, clearTokens } = require('./tokenStore');
const { runGmailSync, loadSystemPrompt } = require('./gmailSync');
const { seedDefaultIfEmpty } = require('./models/dailyBudgets');
const calendarRoutes = require('./calendarRoutes');
const dayRoutes = require('./dayRoutes');
const jarRoutes = require('./jarRoutes');

const REQUIRED_ENV = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI', 'GEMINI_API_KEY'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error('Missing required environment variables: ' + missing.join(', '));
  console.error('Copy .env.example to .env and fill them in.');
  process.exit(1);
}

// Seeds a starting budget so the calendar has something to compare
// against before the user has set one via the day view.
const DEFAULT_DAILY_BUDGET = 200;
seedDefaultIfEmpty(DEFAULT_DAILY_BUDGET);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(authRouter);
app.use(calendarRoutes);
app.use(dayRoutes);
app.use(jarRoutes);

app.post('/api/sync', async (req, res) => {
  if (!isConnected()) {
    return res.status(401).json({ error: 'not_connected' });
  }

  try {
    const oauth2Client = getOAuth2Client();
    const result = await runGmailSync(oauth2Client);
    res.json(result);
  } catch (err) {
    // Only a Gmail-sourced auth failure should clear Gmail credentials —
    // runGmailSync also calls the Gemini API internally, and a 401/403
    // from THAT is unrelated to whether the Gmail token is still valid.
    if (err.isGmailError && isAuthError_(err)) {
      console.error('api/sync: treating as Gmail auth failure, clearing token. code=' +
        (err.code || (err.response && err.response.status)) + ' message=' + err.message);
      clearTokens();
      return res.status(401).json({ error: 'not_connected', reason: 'expired' });
    }
    console.error('Sync failed:', err);
    res.status(500).json({ error: 'sync_failed', detail: err.message });
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
