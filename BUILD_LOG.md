# Build Log

One entry per commit, added before that commit is made.

Format:
- **Date:**
- **Time spent:**
- **Tokens used (approx):**
- **What shipped:**

---

## Entry 1 — 2026-09-12
- **Date:** 2026-09-12
- **Time spent:** TODO (fill in your actual time)
- **Tokens used (approx):** TODO (fill in your actual usage)
- **What shipped:** Repo and branch setup (`inkman-B`); added `plan.md` describing the MVP vs. final scope for the AI colour-combination assistant and the AI-Involvement Level; added this `BUILD_LOG.md`.

## Entry 2 — 2026-09-17
- **Date:** 2026-09-17
- **Time spent:** TODO (fill in your actual time)
- **Tokens used (approx):** TODO (fill in your actual usage)
- **What shipped:** Pivoted the project idea and rewrote `plan.md` for the
  UPI Expense Tracker & Auto-Save Assistant (Problem / MVP scope / stretch
  goals / AI-Involvement Level). Built the MVP as a Google Apps Script
  project bound to a Sheet (`src/`): hourly Gmail scan + parse of GPay
  transaction alerts with dedupe-by-transaction-ID, a `Transactions` log
  sheet, a daily job that computes `remaining budget / days left` as
  today's safe-to-spend and emails it, a `Settings` sheet for the budget,
  and a `Savings` sheet that sweeps each day's underspend into a goal
  bucket (overspend tracked separately, never deducted from savings) with
  a one-time goal-reached email alert. Added `SETUP.md` with deployment
  steps and an explicit "verify the parser against your own inbox before
  trusting it" step, since GPay's email wording isn't guaranteed to match
  the regexes on the first try.

## Entry 3 — 2026-09-17
- **Date:** 2026-09-17
- **Time spent:** TODO (fill in your actual time)
- **Tokens used (approx):** TODO (fill in your actual usage)
- **What shipped:** Scrapped the Apps Script build from Entry 2 in favor
  of a much smaller v1: rewrote `plan.md` to scope v1 down to "connect
  Gmail → agent searches for UPI in the subject → show a count," with the
  full budgeting/savings feature set moved to a "Final Goals" section.
  Built a Node/Express + vanilla-JS app: Gmail OAuth (`gmail.readonly`
  only, single-user token persisted to a gitignored `.gmail-token.json`),
  a Gemini agent (`server/agent.js`, `@google/genai`, function calling)
  whose system prompt is read from `agent.json` at the project root per
  request (not editable from the UI — edit the file and it takes effect
  immediately, no restart needed), a `search_gmail` tool the agent calls
  that the backend actually executes so the displayed count always comes
  from the real Gmail API result rather than a model-generated number,
  expired/revoked-token handling that surfaces a reconnect prompt instead
  of a crash, and a single-page UI (Connect Gmail / day-range input /
  Search / loading state / explicit empty state). Verified the server
  boots, serves the page, and produces a correctly-scoped OAuth redirect
  URL; did not yet run a live end-to-end test against a real Gmail/Gemini
  account (needs real credentials in `.env`, which only the account owner
  can provide).
