# Running Broke.AI v1

A minimal Node/Express app: connect Gmail, an AI agent (Gemini, via
function calling) searches for "UPI" in the subject line, you see a count.

## 1. Google Cloud — OAuth client

1. Create a project at https://console.cloud.google.com.
2. **APIs & Services → Library** → enable **Gmail API**.
3. **APIs & Services → OAuth consent screen**: choose **External**, fill
   in the required fields, and under **Test users** add your own Gmail
   address. Leave publishing status as **Testing** — this avoids Google's
   app-verification process since only you will ever sign in.
4. **APIs & Services → Credentials → Create Credentials → OAuth client
   ID** → Application type **Web application** → add authorized redirect
   URI `http://localhost:3000/oauth2callback` (must match
   `GOOGLE_REDIRECT_URI` exactly, port included). Save the **Client ID**
   and **Client Secret**.

Note: while the consent screen is in "Testing" status, Google expires
issued refresh tokens after 7 days. That's expected — it's a good way to
exercise the reconnect flow below, not a bug.

## 2. Gemini API key

Get a key from https://aistudio.google.com/apikey. This is unrelated to
the OAuth client above — it's just a key for calling the Gemini API.

## 3. Configure the app

```
cp .env.example .env
```

Fill in `.env`:

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GEMINI_API_KEY=...
PORT=3000
```

`.env` is gitignored — it's never committed.

## 4. Install and run

```
npm install
npm start
```

Open http://localhost:3000. The server logs the first line of
`agent.json`'s `system_prompt` on startup, so you can confirm which
prompt is active.

## 5. Test end-to-end

1. Click **Connect Gmail**. Since the app is in Testing mode, Google shows
   an "unverified app" warning — click **Advanced → Go to Broke.AI
   (unsafe)** to proceed, then grant the read-only Gmail permission.
   (This button's label mirrors whatever app name is set on the OAuth
   consent screen in Google Cloud Console — rename it there too if it
   still says otherwise.)
2. You're redirected back and should see "Connected as
   you@gmail.com" plus the search controls.
3. Leave the day range at 30 (or change it) and click **Search**. You'll
   see a loading spinner, then either a count ("N UPI emails found in the
   last 30 days") or the empty state if there are none.
4. **Test the empty state**: temporarily set the range to something
   unlikely to match (e.g. 1 day) if you don't have recent UPI mail.
5. **Test the reconnect flow**: revoke access at
   https://myaccount.google.com/permissions (find "Broke.AI" — or
   whatever name is set on the OAuth consent screen — and remove
   it), then click Search again — you should see the "reconnect" notice
   and a "Reconnect Gmail" button, not a crash or a raw error.
6. **Test that `agent.json` actually takes effect**: edit
   `system_prompt` in `agent.json` (e.g. add a sentence), then either
   just click Search again (it's read fresh per request — no restart
   needed) or stop the server (Ctrl+C) and `npm start` again to confirm
   the new startup log line reflects your edit.

## What's deliberately not here yet

No transaction parsing, no storage of individual emails, no
deduplication logic, no budget or savings features — those are the
"Final Goals" in `plan.md`, to be built on top of this connection once
it's proven solid.
