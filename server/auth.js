const express = require('express');
const { google } = require('googleapis');
const { getOAuth2Client, isConnected, saveTokens, clearTokens } = require('./tokenStore');

const router = express.Router();

// Most restrictive scope that still lets us search/read subjects: read-only,
// no send/modify/delete, no full-account access beyond mail.
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly'];

router.get('/auth/google', (req, res) => {
  const client = getOAuth2Client();
  const url = client.generateAuthUrl({
    access_type: 'offline', // needed to get a refresh token
    prompt: 'consent', // forces a fresh refresh token even on repeat connects
    scope: SCOPES
  });
  res.redirect(url);
});

router.get('/oauth2callback', async (req, res) => {
  const { code, error } = req.query;
  if (error) {
    return res.redirect('/?auth=denied');
  }
  try {
    const client = getOAuth2Client();
    const { tokens } = await client.getToken(code);
    saveTokens(tokens);
    res.redirect('/?auth=success');
  } catch (err) {
    console.error('OAuth callback failed:', err.message);
    res.redirect('/?auth=error');
  }
});

router.get('/auth/status', async (req, res) => {
  if (!isConnected()) {
    return res.json({ connected: false });
  }

  try {
    const client = getOAuth2Client();
    const gmail = google.gmail({ version: 'v1', auth: client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    res.json({ connected: true, email: profile.data.emailAddress });
  } catch (err) {
    // Expired/revoked token — surface as "not connected" rather than a
    // 500, so the UI can show a reconnect prompt instead of crashing.
    if (isAuthError_(err)) {
      clearTokens();
      return res.json({ connected: false, reason: 'expired' });
    }
    console.error('auth/status check failed:', err.message);
    res.status(500).json({ connected: false, reason: 'error' });
  }
});

router.post('/auth/logout', (req, res) => {
  clearTokens();
  res.json({ ok: true });
});

function isAuthError_(err) {
  const code = err.code || (err.response && err.response.status);
  return code === 401 || code === 403 || /invalid_grant/i.test(err.message || '');
}

module.exports = { router, isAuthError_ };
