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

## Entry 3 — 2026-09-17/18
- **Date:** 2026-09-17 (committed 2026-09-18, `cf82fc1`)
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

## Entry 4 — 2026-09-22 (`8b266df`)
- **Date:** 2026-09-22
- **Time spent:** TODO (fill in your actual time)
- **Tokens used (approx):** TODO (fill in your actual usage)
- **What shipped:** Full rebuild on top of v1: SQLite storage
  (`better-sqlite3`) for transactions and daily budgets, real Gmail →
  transaction parsing via the LLM agent (amount/type/party/category),
  the calendar UI (month grid, red/green day status), the Day Detail
  view (per-day budget editing, transaction list, exception marking,
  manual cash entries), the Savings Jar (Total Amount, bank balance,
  purchase goals with month-by-month floored-at-₹0 progress), and the
  Exceptions list. Along the way, found and fixed: a wrong assumption
  about which address sends UPI alert emails (switched to a `subject:UPI`
  search), a Gmail-quota-vs-Gmail-auth error misattribution that had
  silently deleted a valid OAuth token, HTML-only email bodies with no
  `text/plain` part (added an HTML→text fallback), and a CSS bug where
  `.modal-backdrop { display: flex }` had no `[hidden]` override, so
  both modals stayed visible on every page load regardless of the
  attribute. See `RETRO.md` for the full root-cause writeups.

## Entry 5 — 2026-09-22 (`fdaec6f`, `81acba1`, `1360856`)
- **Date:** 2026-09-22
- **Time spent:** TODO (fill in your actual time)
- **Tokens used (approx):** TODO (fill in your actual usage)
- **What shipped:** Bring-your-own-API-key support: a Settings modal
  where a user can choose a provider (Gemini/OpenAI/Anthropic/Groq) and
  paste their own key, stored server-side (`server/models/llmSettings.js`)
  and consulted before falling back to the server's own `GEMINI_API_KEY`.
  Added a provider-dispatch layer (`server/llmProviders.js`) so extraction
  and day-summary generation both work identically across all four
  providers (Groq via its OpenAI-compatible endpoint). Deployed to Railway
  to test the OAuth-redirect-in-production flow; found Groq's documented
  default model no longer existed, queried Groq's live `/models` endpoint
  with a real key, and switched to a verified-working model. Then hit
  Groq's free-tier 8,000-token/minute cap on a 20-email extraction batch
  (~8,450 tokens) and shrank the batch size to 5 emails per call.

## Entry 6 — 2026-09-22 (`3ccca14`, `bc9034c`)
- **Date:** 2026-09-22
- **Time spent:** TODO (fill in your actual time)
- **Tokens used (approx):** TODO (fill in your actual usage)
- **What shipped:** Found that asking the LLM to extract a transaction's
  `date` from free-text email body had produced dates hallucinated as far
  back as 2017–2022 for emails Gmail's own metadata dated correctly to
  2026 — right amount/merchant/category, catastrophically wrong year,
  which had silently skewed the Savings Jar's month-by-month goal-progress
  calculation. Removed `date` from every provider's extraction schema
  entirely; it's now captured deterministically from Gmail's own
  `internalDate` per email instead. Cleaned up the already-corrupted rows
  and added a startup self-heal pass that catches any transaction dated
  implausibly relative to when it was actually synced.

## Entry 7 — 2026-09-23 (`03473d2`, `830e14a`)
- **Date:** 2026-09-23
- **Time spent:** TODO (fill in your actual time)
- **Tokens used (approx):** TODO (fill in your actual usage)
- **What shipped:** Moved the Gmail token file inside `data/` so a single
  persistent volume covers both it and the SQLite database on a redeploy
  (closing the ephemeral-filesystem gap flagged in Entry 5). Added
  per-provider model selection to Settings — a user can override which
  specific model is used within their chosen provider, not just the
  provider itself.

## Entry 8 — 2026-09-24/25 (`0fa95e4`, `9bb74c7`)
- **Date:** 2026-09-24 to 2026-09-25
- **Time spent:** TODO (fill in your actual time)
- **Tokens used (approx):** TODO (fill in your actual usage)
- **What shipped:** Full front-end redesign, done interactively against a
  set of visual mockups: a cream/serif visual design system (Playfair
  Display + Inter) replacing the original plain UI; the Day Detail view
  turned into a real sub-page reached via hash routing (`#/day/:date`)
  instead of a modal, with a two-column calendar+detail layout, a
  collapsible Exceptions section, and a centered date heading; calendar
  day-circles changed from flat red/green to a relative heat-map (color
  intensity scaled to that day's over/underspend versus the rest of the
  month, with future/no-data days deliberately excluded from skewing the
  scale); a first-run onboarding screen (`#/`, shown on every page
  load); a new Spending & Savings History page (`#/history`, new
  `server/historyRoutes.js` endpoint reusing the existing Savings-Jar
  month-net calculation) with year-to-date stats, month-by-month cards,
  and Under-Budget/All-Months filtering; custom illustration assets (a
  cat mascot and a savings-jar icon) cut out from user-supplied photos
  via a background-removal script (color/luminance-based flood fill,
  since the source images had no alpha channel) and wired in as the
  onboarding art, the topbar logo, and the Savings Jar icon; and a full
  rebrand from "Inkman" to "Broke.AI" (renamed again shortly after to
  "KitKash", its current name) across the UI, `agent.json`,
  `package.json`, and docs. Caught and fixed several bugs surfaced by
  testing along the way: `[hidden]` again being silently overridden by
  CSS on newly-added elements (same class of bug as Entry 4, now on the
  history view and back-link), a scroll-position reset that silently
  shifted the displayed month when the calendar was reparented between
  layouts, future dates incorrectly winning the "best underspend day"
  slot on the heat-map scale, and a "Healthy" status badge on the History
  page that was tautologically always true because it read a
  floored-at-₹0 figure.
