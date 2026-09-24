# Retro: Building Inkman (v1 → calendar/Jar rebuild → multi-provider keys)

**Status:** Ongoing project; this retro covers everything from the first Gmail
connection through the bring-your-own-LLM-key feature.
**Period covered:** 2026-09-17 through 2026-09-22.
**Related commits:** `8b266df`, `fdaec6f`, `81acba1`, `1360856`, `3ccca14`
(plus earlier work folded into `8b266df`, since most of the
calendar/Day-View/Savings-Jar build wasn't split into granular commits as
it happened).

---

## Summary

Three different classes of problem kept recurring, and each one cost real
time before the actual pattern was named:

1. **Errors from one API got misattributed to a different, unrelated system**
   — most damagingly, Gmail quota errors and Gemini errors both got treated
   as "your Gmail credentials are bad," which silently deleted a working
   OAuth token twice.
2. **Assumptions about third-party services went stale or were wrong from
   the start** — an assumed Gmail sender address, a deprecated Gemini model,
   an outdated SDK missing a new required field, a Groq model that no longer
   exists. Every one of these was only resolved by checking the live service
   directly instead of trusting memory.
3. **Requirements for the Savings Jar's money math changed several times**
   in the same session, each change reasonable on its own, but the total
   churn was expensive — the same formula was implemented, reverted, and
   re-implemented across four separate exchanges.

None of these were visible from the first symptom. "Please reconnect Gmail"
was the on-screen message for at least three unrelated root causes.

---

## Timeline (condensed)

| When | What |
|---|---|
| Sep 17 | v1 built: Gmail OAuth (`gmail.readonly`) + a Gemini agent that counts "UPI"-subject emails. Multiple real OAuth setup failures worked through live (redirect URI mismatch, a deleted OAuth client, another redirect URI mismatch, a 403 access_denied). |
| Sep 18–20 | `gemini-2.5-flash` found deprecated mid-session → switched to `gemini-3.6-flash`. Hit a `503` (added retry) and then a `400` (`missing thought_signature`) — traced to an outdated `@google/genai` SDK (0.3.1 vs latest 2.23.0); upgraded and fixed the function-call replay to preserve `thoughtSignature`. |
| Sep 20–22 | Full rebuild: calendar UI, SQLite storage, real Gmail→transaction parsing via an LLM agent, Day Detail view, Savings Jar, goals, exceptions. Found the Gmail sender assumption was wrong (real alerts come from the bank, not GPay) — switched to `subject:UPI` search. Found and fixed a Gmail-quota-vs-Gmail-auth-error misattribution bug that had deleted a valid token. Found and fixed empty email bodies (HTML-only alert emails, no `text/plain` part). Found and fixed a CSS bug that kept both modals permanently visible after every page load. |
| Sep 22 (afternoon) | Savings Jar "Total Amount" / goal-progress formula revised four times in direct succession (see **Requirements churn** below). Diagnosed a stale-browser-cache issue (renamed API field, old `app.js` still cached) by comparing the server-served file against what the browser was actually running. |
| Sep 22 (evening) | Deployed to Railway; walked through the redirect-URI reconfiguration needed for a real public URL, and flagged the ephemeral-filesystem risk to the DB/token. Added bring-your-own-key support for OpenAI/Anthropic/Groq/Gemini via a Settings modal (commit `fdaec6f`). Groq's documented default model (`llama-3.3-70b-versatile`) turned out not to exist any more — queried Groq's live `/models` endpoint with the user's real key, found `openai/gpt-oss-120b`, verified it live (`81acba1`). Then hit Groq's 8000 token/minute free-tier cap with a 20-email extraction batch (~8450 tokens) — shrank the batch size to 5 (`1360856`). |
| Sep 22 (late evening) | User noticed monthly totals looked inconsistent and a transaction appeared dated days in the future. Traced to the LLM being asked to extract the transaction date from free-text email body — one real batch hallucinated dates from 2017 through 2022 for emails Gmail's own metadata dated correctly to 2026-08-17. Fixed by capturing Gmail's real message timestamp deterministically and dropping `date` from every provider's extraction schema entirely; deleted the 24 already-corrupted rows and confirmed via spot-check that no other stored dates were affected (`3ccca14`). |

---

## Root causes

### 1. Error misattribution across API boundaries (the costliest bug, twice)

`/api/sync` calls both the Gmail API and an LLM API in the same function.
The error handler asked one question — "is this a 401/403?" — and answered
it the same way regardless of *which* API actually threw. Twice, this
caused a **valid Gmail OAuth token to be silently deleted**:

- First: a Gemini-side error surfaced as `code: 403`-shaped and got treated
  as a Gmail credential failure.
- Second, after fixing that: a genuine **Gmail quota error** (`403 Quota
  exceeded ... Units per minute per user`) was *also* misclassified — Google
  uses 403 for both "bad credentials" and "you're asking too fast," and the
  code didn't distinguish them.

**Why it was hard to see:** both failures presented identically to the user
— "Your Gmail connection expired or was revoked. Please reconnect." — which
reads as a real, external event, not an app-side bug. There was no logging
on the code path that cleared the token, so the first occurrence left no
evidence at all.

**Fix:** tagged errors by actual origin (`err.isGmailError`, set only inside
the Gmail-calling function) so a non-Gmail error can never trigger a Gmail
token wipe; separated `isQuotaError_` from `isAuthError_` so a rate-limit
403 is retried, not treated as invalid credentials; added logging on every
branch that clears a token, so a third occurrence would be diagnosable in
seconds instead of requiring a live investigation.

### 2. Stale or wrong assumptions about third-party services

Four separate instances, all resolved the same way — stop guessing, query
the live service:

- Assumed GPay sends its own transaction-alert emails (`googlepay-noreply@
  google.com`). Real alerts came from the user's bank (`alerts@hdfcbank.
  bank.in`); switched to a `subject:UPI` search, matching v1's original
  (correct) approach.
- `gemini-2.5-flash` had been deprecated between when it was chosen and when
  it was actually run — the API's own error message named the replacement.
- `@google/genai` was pinned at a version (0.3.1) that predated Gemini 3's
  `thoughtSignature` requirement for function-calling — the fix wasn't a
  workaround, it was upgrading to the current SDK (2.23.0).
- Groq's assumed default model (`llama-3.3-70b-versatile`) returned `404
  does not exist` — its model lineup had moved on. Fixed by calling Groq's
  own `/models` endpoint with the real key and live-testing a candidate
  before committing to it as the new default.

**Why it was hard to see:** each of these looks, from the error message
alone, like a config mistake ("wrong model name," "wrong sender") rather
than "the world changed since this was written." Only checking the live
API surface (not memory, not documentation snapshots) resolved any of them
correctly.

### 3. Asking an LLM to extract data that was already available as reliable structured metadata

The extraction schema asked the model for a transaction `date`, parsed from
the free-text email body — even though Gmail's own message metadata
(`internalDate` / the `Date` header) already gives the true date with 100%
reliability, and that metadata was already being fetched for every email
anyway. On one real sync batch, whichever model was active hallucinated
dates ranging from **2017 to 2022** for emails Gmail's own timestamp dated
correctly to 2026-08-17 — right amount, right merchant, right category,
catastrophically wrong year. This silently corrupted downstream
aggregates: the Savings Jar's goal-progress calculation iterates every
month since the *earliest* transaction date, so it started iterating from
2017 instead of 2026-07, and monthly totals shifted depending on which
(mis-)year a given transaction had been filed under.

**Why it was hard to see:** the amount, merchant, and category were all
correct, so the data looked trustworthy at a glance — only cross-checking
a specific transaction's stored date against Gmail's own header revealed
the mismatch. Nothing threw an error; a wrong-but-valid-shaped date is
indistinguishable from a right one until compared against ground truth.

**Fix:** stopped asking any provider for `date` at all — it's captured
deterministically from Gmail's `internalDate` in code, per email, and the
LLM's job is now only amount/type/party/category (things that genuinely
aren't available as structured metadata). Cleaned up the 24 already-
corrupted rows and confirmed via a random spot-check against live Gmail
data that no other stored dates were affected.

**General lesson:** if a reliable, structured source for a field already
exists, don't also ask an LLM to re-derive it from unstructured text "for
completeness" — that only introduces a new way for it to be wrong.

### 4. HTML-only email bodies

The Gmail body parser only read `text/plain` parts. Real bank alert emails
are `multipart/alternative` with **only** a `text/html` part — no
`text/plain` at all — so the extraction agent was receiving an empty body
every time and correctly refusing to invent numbers it couldn't see (count
came back 0 stored, 0 skipped, no error).

**Why it was hard to see:** the failure was silent and looked like a data
problem ("no transactions found") rather than a parsing bug — nothing
threw, nothing logged an error, because nothing was actually wrong from the
code's point of view.

**Fix:** added an HTML→plain-text fallback (tag stripping + entity
decoding) used only when no `text/plain` part exists.

### 5. `[hidden]` silently overridden by CSS

The Day Detail and Savings Jar modals used the HTML `hidden` attribute to
stay invisible until opened, but `.modal-backdrop { display: flex; ... }`
had no `[hidden]` exception. Author CSS always beats the browser's default
`[hidden] → display:none` rule when both apply, so both modals — with their
static "Loading…" placeholder text — were visible on **every page load**,
regardless of the attribute.

**Fix:** added `.modal-backdrop[hidden] { display: none; }`.

### 6. Requirements churn: Savings Jar money math

The "Total Amount" / goal-progress formula changed four times in direct
succession within the same afternoon:

1. Lifetime sum of underspend only, overspend penalty-free (original design).
2. Net (underspend − overspend), still lifetime-cumulative.
3. Reset monthly, but back to underspend-only (a direct revert of #2).
4. Reset monthly AND net again — sent as a byte-for-byte repeat of the
   request from step 2, which needed an explicit confirmation round-trip
   before re-applying it, since blindly re-flipping a just-reverted change
   without checking would have been worse than asking.
5. A final correction: goal progress changed from a continuous daily sum
   since the goal's creation date to a **month-by-month sum, floored at ₹0
   per month** before adding — meaning a bad month can never drag down
   progress already earned, only ever contribute nothing.

Separately, two rounds of user confusion turned out to be real, valid
questions about behavior that wasn't yet built as expected: the Jar's Total
Amount wasn't scoped to whichever month was on screen (always showed the
real current month, regardless of calendar navigation), and goal progress
being ₹0 despite a positive Total Amount was surprising until the two
numbers' independent date ranges were spelled out explicitly.

**Why this cost real time:** every revision meant re-deriving the exact
day-by-day (later month-by-month) aggregation logic, restarting the server,
and re-verifying against live data. None of these were bugs in the
conventional sense — each was a direct, explicit instruction — but the
back-and-forth is exactly the kind of churn that's cheaper to avoid by
nailing the full spec (including edge cases like "does progress reset
monthly too?" and "which month does the Jar icon reflect?") before writing
the aggregation code the first time.

### 7. Deployment: hardcoded-by-default redirect URI

Moving to Railway surfaced that `GOOGLE_REDIRECT_URI` has to be set
correctly in **three places that all have to agree**: Railway's own
environment variables (Railway never reads the local `.env`), Google Cloud
Console's Authorized Redirect URIs list, and a redeploy to pick up the
change. The code itself had no hardcoded `localhost` in any real code path
— only a cosmetic startup log line — so this was purely a deployment
configuration gap, not a code bug.

**Also flagged, not yet fixed:** Railway's default filesystem is ephemeral.
Both the Gmail token file and the entire SQLite database live on local
disk, so a redeploy or restart without an attached persistent volume would
silently wipe all synced transaction history and force a Gmail reconnect.

### 8. A mismatched "fix" that almost got applied blindly

Partway through debugging the reconnect issue, a document was pasted in
described as "a friend's doc that fixed the same problem." Reading it
before acting on it showed it was a postmortem for a **completely
different, unrelated app** (Python/Flask, `oauthlib`, deployed on Railway,
an app called "Wiglet," PKCE and OAuth-scope-superset bugs that don't exist
in this codebase's Node/`googleapis` stack at all). None of its concrete
fixes were applicable; applying them (e.g. relaxing `oauthlib` scope
validation, adding PKCE handling this app doesn't use) would have been
actively wrong. One general lesson from it *was* worth keeping — verify the
deployed/running artifact actually matches the code being read before
debugging further — which was already a live concern this session (see
below).

### 9. Orphaned background processes

Multiple `node server/index.js` restarts, done by killing "the process
listening on port 3000," repeatedly left earlier instances running (npm's
wrapper process doesn't always die with its child, and vice versa),
eventually triggering the OS's low-memory process reclamation. This was
diagnosed by checking `Win32_Process` command lines directly rather than
trusting that "restarted" meant "only one instance running."

---

## What went well

- **Verifying against the live system instead of trusting assumptions.**
  Every "stale assumption" bug (§2) was root-caused in one step once the
  actual live API was queried directly — Gmail's real sender header, the
  Gemini API's own deprecation message, Groq's actual `/models` list. No
  guessing was needed once the right endpoint was hit.
- **Adding logging at the exact moment a destructive action happens**, not
  just on generic failure. The second quota-misattribution bug (§1) was
  root-caused from a single log line within one exchange, versus the first
  occurrence, which took several rounds of speculation because nothing had
  been logged.
- **Testing via direct API calls (curl / small Node scripts) before
  touching the UI**, every time — this caught the true-vs-budget spend
  distinction, the net-vs-underspend jar formula, and the batch-size-vs-TPM
  Groq limit with concrete before/after numbers instead of guesses.
- **Refusing to blindly apply an unrelated "fix"** (§8) — reading the
  pasted document before acting on it, rather than pattern-matching on "a
  doc that supposedly fixed the same error."

## What went wrong in diagnosis

- **The first token-deletion bug had no logging**, so it looked like an
  unexplained, possibly-external event rather than a reproducible app bug
  — it took clearing/reconnecting and re-triggering with logging in place
  to actually name the cause.
- **A duplicate message got sent and initially treated at face value.**
  When the exact same "net underspend/overspend" instruction arrived twice
  in a row — the second time after it had already been implemented *and
  explicitly reverted* — proceeding to silently re-flip the behavior a
  third time would have been worse than pausing to confirm it was
  intentional and not a re-paste.
- **Frontend/backend field-name drift plus browser caching produced a
  confusing false signal.** After renaming an API field (`totalSaved` →
  `totalAmount`), the browser's cached old `app.js` kept reading the
  now-nonexistent old field, silently rendering `₹0` — which looked
  exactly like a server-side calculation bug until the served file and the
  live API response were checked directly against each other.

---

## Action items

| # | Item | Why | Status |
|---|---|---|---|
| 1 | Add a Railway persistent volume for `data/` and the Gmail token file | Default ephemeral filesystem will silently wipe transaction history + force reconnects on every redeploy/restart | **Open** |
| 2 | Move the Google OAuth consent screen out of "Testing" (or otherwise handle it) | While in Testing, Google expires refresh tokens after 7 days regardless of app code — will keep resurfacing as "please reconnect" | **Open** |
| 3 | Test the OpenAI and Anthropic provider paths with real keys | Only Gemini and Groq have been verified against live APIs this session; OpenAI/Anthropic are implemented per each vendor's documented shape but unverified | **Open** |
| 4 | Tag Gmail-vs-LLM errors at every call site that mixes both APIs, not just `/api/sync` | The root pattern behind §1 — worth auditing other routes for the same mixing-two-APIs-in-one-try/catch shape | Open |
| 5 | Fix `isAuthError_`/`isGmailError` tagging for the sync path | Done this session | **Done** |
| 6 | HTML-to-text fallback for email parsing | Done this session | **Done** |
| 7 | `[hidden]` CSS override on modals | Done this session | **Done** |
| 8 | Groq model + batch size fixed against live API | Done this session | **Done** |
| 9 | Stop trusting the LLM for transaction dates; use Gmail's timestamp instead | Done this session — also cleaned up 24 corrupted rows | **Done** |
| 10 | Audit whether any other field asked of the LLM has a more reliable structured source available (e.g. could amount ever be read from a structured part of the email rather than free text?) | Same class of risk as §3, not yet checked | Open |

---

## Prevention

- **Verify third-party assumptions (sender addresses, model names, SDK
  versions) against the live service before relying on them**, especially
  anything that could have changed since it was last checked — a
  deprecation notice, a renamed model, a new required field, are all
  discovered faster by asking the real API than by reasoning from memory.
- **Never apply the same "is this an auth failure" check to errors from
  two different APIs in the same function.** If a function calls more than
  one external service, tag which service actually threw before deciding
  how to react to the error — especially before taking a destructive action
  like clearing stored credentials.
- **Log immediately before any destructive/corrective action** (clearing a
  token, resetting stored state), not just on generic catch-all failure —
  the next occurrence of any bug like this should be diagnosable from one
  log line, not require reproducing it live again.
- **Nail down edge cases in a money-math spec before implementing it once**
  — "does this reset monthly?", "which date range does each number use?",
  "does a new item created mid-period get partial or full credit?" are
  cheap to ask up front and expensive to re-derive after the fact.
- **A CSS rule that sets `display` unconditionally on an element also using
  the `hidden` attribute needs an explicit `[hidden] { display: none }`
  fallback**, or the attribute silently does nothing.
- **Don't ask an LLM to re-derive a field from unstructured text when a
  reliable structured source for it already exists** (Gmail's own message
  timestamp vs. asking the model to read a date out of the email body). A
  wrong-but-plausible-looking value from the model is much harder to catch
  than an outright error, since nothing throws — it just silently corrupts
  whatever depends on it.
- **When renaming an API field, expect the browser to be running stale
  cached JS during testing** — a hard refresh should be the first thing
  tried when a UI value looks frozen or defaulted after a server-side
  change.
