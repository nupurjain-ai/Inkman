# Inkman — UPI Expense Tracker & Auto-Save Assistant

**v1 scope:** connect Gmail (OAuth, read-only), an AI agent (Gemini API,
via function calling) searches the inbox for "UPI" in the subject line,
and the app shows the count. No parsing, storage, budgeting, or savings
logic yet — see `plan.md` for the full staged plan.

- `plan.md` — problem statement, v1 scope, stretch goals, AI-involvement
  level.
- `SETUP.md` — how to configure Google/Gemini credentials and run it.
- `agent.json` — the agent's system prompt (not editable from the UI;
  edit the file directly).
- `server/` — Express backend (OAuth, Gmail search, Gemini agent).
- `public/` — the single-page frontend.
