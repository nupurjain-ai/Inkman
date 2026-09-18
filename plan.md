# Plan: Inkman — UPI Expense Tracker & Auto-Save Assistant (v1)

## Problem

Manually logging UPI/GPay spends is tedious enough that most people stop
doing it within a week, which means budgets stay theoretical and savings
goals never get funded. GPay transactions already land as emails in Gmail
— this project's end goal is an agent that reads those emails and turns
them into a self-adjusting budget and auto-savings system, with zero
manual entry.

v1 deliberately does none of that yet. It proves the smallest possible
slice of the pipeline end-to-end — connect to Gmail, have an AI agent
search it, show a result — before building parsing, budgeting, or savings
logic on top of an unproven connection.

## MVP Scope (v1)

**Connect Gmail → agent searches for "UPI" in the subject line → show the
count.** That's the whole app.

- Single-page web app: a **Connect Gmail** button, a **Search** button,
  and a result area.
- Gmail OAuth (`gmail.readonly` scope only — no write/modify access, no
  full-mailbox scope) via a Node/Express backend.
- An AI agent (Gemini API, via function calling) searches the connected
  inbox for emails with "UPI" in the subject, default range last 30 days
  (range is a parameter, not hardcoded, so it's easy to widen later).
- The agent's system prompt lives in `agent.json` at the project root —
  not editable from the UI. The backend reads it at request time, so
  editing the file and restarting the server changes the agent's behavior
  with no code change.
- Clear empty state when no matches are found (not just "0").
- Expired/revoked Gmail tokens show a "reconnect" prompt instead of
  crashing.
- Secrets (Gemini API key, Google OAuth client ID/secret) live in `.env`,
  never hardcoded; `.env` and any credential/token files are gitignored.

**Out of scope for v1:** parsing transaction details (amount, payee, UPI
ID, transaction ID), deduplication, structured storage, budget math,
savings goals, categorization, charts/reports, multi-account support.

## Final Goals (the original idea — future work, not v1)

- **Automatic transaction logging**: parse each matching email for
  amount, payee/payer, UPI ID, date/time, transaction ID, debit/credit;
  dedupe repeat notifications; store in a structured log.
- **Spending reports**: category-wise breakdown (auto-categorized by
  merchant), daily/weekly/monthly trend charts, budget-vs-actual,
  selectable custom time ranges.
- **Dynamic daily budget alerts**: user sets a budget for a period (e.g.
  ₹15,000/month); each day, `remaining budget ÷ days left` becomes
  today's safe-to-spend amount, sent as a notification; each day logged
  as over- or under-budget.
- **Goal-based auto-savings**: user states a savings goal (e.g. "Save
  ₹20,000 for a trip by December"); underspend from the daily budget
  check sweeps into that goal's bucket; overspend is tracked separately
  and never silently drains savings; progress bar + projected completion
  date; alert when the goal is reached.

## AI-Involvement Level

**Target: Level 3 — AI drafts most of the implementation; I review, steer
design decisions, and own the domain judgment calls.**

Why: OAuth plumbing, Express routing, and the Gemini function-calling
wiring are mechanical enough that AI can draft them quickly. My own
value-add is in the parts that need judgment: which Gmail scope is
actually the most restrictive one that still works (`gmail.readonly` vs.
the narrower `gmail.metadata`), how the agent's system prompt should be
worded so it stays a real instruction rather than decoration, and
verifying the OAuth/reconnect flow actually behaves correctly against my
own Google account rather than trusting that it compiles. I review every
diff before accepting it, particularly anywhere secrets or tokens are
handled.
