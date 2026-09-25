UPI Monthly Budget Tracker — Full Spec (v2)
Core Concept

A calendar-based budget tracker that auto-logs UPI spending from Gmail, visually shows daily over/underspending, and redirects underspend into savings goals — with support for manual cash entries and spending exceptions.

Main Screen
Calendar view, scrollable horizontally (swipe/scroll left-right to move between months, not just a static current-month view)
Each date shown as a colored circle:
🔴 Red — spent more than that day's budget
🟢 Green — spent less than or equal to that day's budget
Viewing a past month shows total spent that month at the top
Savings Jar icon in the corner, always visible
Day Detail View (on clicking a date)

Kept deliberately simple:

Today's limit (that day's budget amount)
Amount spent so far that day
"Make an exception" button (to exclude a transaction from the budget count)
Savings Jar icon in the corner (same as main screen — quick access without leaving the view)
Add cash spend option (manually log an offline transaction for that day)

(Full transaction list still shown here too — the "simple" request applies to the top summary, not hiding the transaction data itself. Worth confirming with you once it's built.)

Editable Daily Budget
The budget amount (e.g., ₹150) is editable from within a day's view
Changing it applies from that date forward until changed again
Previous days keep whatever budget was active on that day (historical record, not retroactively changed)
Example: Budget is ₹150 all month. On the 10th, user changes it to ₹200. Days 1–9 stay evaluated against ₹150; day 10 onward uses ₹200 until changed again.
Exceptions
Per-transaction, named by the user (e.g., "Hospital visit")
Once marked, excluded from that day's budget calculation entirely
Logged separately, viewable later from the Savings Jar
Savings Jar

Three sections:

Total Amount
Total saved so far (sum of daily underspend)
Bank balance — manually entered, optional
Purchase Goals
User adds goals manually: name + target cost (e.g., "Top — ₹2,000," "Chocolate — ₹100")
Every day's underspend amount is applied to all active goals simultaneously — e.g., ₹50 saved one day adds ₹50 of progress to every active goal's bar, not split between them

 Worth confirming: this means the same ₹50 "counts" toward multiple goals at once rather than being divided — so goal progress bars track cumulative eligible savings, not separately reserved money. If two goals both hit 100%, you likely can't buy both with the same underspend pool. Let me know if that's the intended behavior or if you'd rather split contributions across active goals instead.

When a goal's bar fills completely → a notification badge appears on that goal
Each goal has a delete option (remove it whether abandoned or already purchased)
Exceptions
List of all exception-marked transactions
Filterable by month
Shows: name, amount, date
Budget Logic (recap)
Daily spend = Gmail UPI transactions + manually added cash entries, excluding anything marked as an exception
Spend < that day's budget → underspend goes toward savings jar + all active purchase goals
Spend > that day's budget → red day, no penalty to savings (overspend doesn't drain the jar)
Exceptions tracked and shown separately, never affect the daily budget or savings math
Data Sources
Automatic: Gmail UPI alerts (OAuth + Gemini parsing — already built)
Manual: Cash spend entries, bank balance, purchase goals, exceptions
Still Open
The goal-overlap question above (shared pool vs. split contributions)
Can exceptions be edited/undone after marking?
Should there be any monthly summary/history view beyond "total spent that month" at the top of the calendar?

Want to settle the goal-overlap question now, or add more first before we turn this into build instructions for Claude Code?

yes exceptions can be undone, yes a monthly summary history

Got it, updating those two:

Exceptions can be undone — user can un-mark a transaction, and it goes back to counting against that day's budget
Monthly summary/history view — beyond just the running total at the top, a dedicated view to look back at past months (spend totals, red/green day counts, etc.)

That leaves one open item from before — the goal-overlap question:

When you underspend ₹50 in a day, should that:

(A) Apply to every active goal at once (so a ₹2,000 "Top" goal and a ₹100 "Chocolate" goal both get +₹50 progress from the same ₹50) — but then hitting 100% on multiple goals doesn't mean you actually have enough money to buy all of them
(B) Split across active goals (e.g., ₹50 divides between 2 goals — ₹25 each, or by some priority order) — so each goal's progress reflects money that's actually "reserved" for it
(C) Something else — e.g., you manually assign each day's underspend to one specific goal at a time

This matters a lot for how "done" actually behaves (whether hitting 100% means real money is sitting there ready to spend, or just a motivational marker), so worth locking down before this gets built.

Good, that's the simpler mental model — goals are motivational trackers, not literal reserved-money buckets. Here's the complete spec, finalized:

UPI Monthly Budget Tracker — Full Spec (Final)
Core Concept

A calendar-based budget tracker that auto-logs UPI spending from Gmail, visually shows daily over/underspending, and motivates savings toward goals — with support for manual cash entries, spending exceptions, and monthly history.

Main Screen
Calendar view, horizontally scrollable (swipe/scroll between months)
Each date shown as a colored circle:
🔴 Red — spent more than that day's budget
🟢 Green — spent less than or equal to that day's budget
Viewing a month shows total spent that month at the top
Savings Jar icon always visible in a corner
Day Detail View

Simple summary at top:

Today's limit (that day's active budget)
Amount spent so far
Make an exception button
Savings Jar icon (corner, quick access)
Add cash spend option (manual offline transaction entry)
Full transaction list below the summary
Editable Daily Budget
Editable from any day's view
Change applies from that date forward, until changed again
Past days retain whatever budget was active on that day (historical, not retroactive)
Exceptions
Per-transaction, user-named (e.g., "Hospital visit")
Excluded entirely from that day's budget math once marked
Can be undone — reverts to counting normally against the day's budget
Logged separately, viewable and filterable by month from the Savings Jar
Savings Jar

Three sections:

Total Amount
A LIVE, running number, recalculated fresh every time it's viewed —
never a stored/accumulated figure. Only ever reflects the CURRENT
calendar month: starts at ₹0 on the 1st, then equals (sum of that
month's underspend so far) minus (sum of that month's overspend so
far), TODAY included (not deferred to tomorrow — updates live as
today's spend comes in). Underspend on a day = budget − spent (if
spent < budget); overspend = spent − budget (if spent > budget); a
₹200 budget with ₹300 spent is a ₹100 overspend that day. Resets to
₹0 on the 1st simply because it never looks at any date before the 1st
of the current month — nothing is being "reset," the range itself moves.
Bank balance — manually entered, optional

Purchase Goals — do NOT reset monthly, persist until deleted
User manually adds goals: name + target cost (e.g., "Top — ₹2,000")
Each goal has its OWN cumulative progress, entirely separate from Total
Amount, built from Total Amount MONTH BY MONTH (not a daily sum):
  - For every month that has fully ended (from whichever is later — the
    goal's creation month, or the month data starts — through last
    month): take that month's final Total Amount. Positive → add it.
    Zero or negative → add ₹0 for that month (never subtracts).
  - For the current, still-ongoing month: add its Total Amount so far,
    but only if currently positive; if negative right now, add ₹0 (does
    not subtract from progress already earned in prior months).
  - Sum of all of the above = the goal's progress. Because every month's
    contribution is floored at ₹0 individually before summing (not
    summed raw and floored once at the end), progress can only hold
    steady or grow, never drop — a bad month simply contributes nothing.
  - This progress persists forever and does NOT reset when a new month
    starts, unlike Total Amount.
  - Applies the same way to every active goal at once — each goal gets
    the full monthly amount, not split between simultaneous goals.
Progress never displays below ₹0 (automatic here, since every monthly
contribution is already >= 0).
Filled goal (progress ≥ target) → notification badge appears
Each goal has a delete option (abandoned or already purchased)

Exceptions
List of all exception-marked transactions, filterable by month
Shows: name, amount, date
Can be un-marked (undo) from here
Monthly Summary / History
Dedicated view to look back at past months
Shows: total spent, count of red/green days, total saved that month (at minimum)
Budget Logic (recap)
Daily spend = Gmail UPI transactions + manual cash entries, excluding exceptions
Spend < that day's budget → underspend adds to this month's Total Amount
+ to every active goal's cumulative progress, live, same day
Spend > that day's budget → red day, AND the overspend amount subtracts
from this month's Total Amount + from every active goal's cumulative
progress, live, same day
Exceptions never affect daily budget or savings math while marked

Implementation note: Total Amount and goal progress are both computed
live from the transactions + daily_budgets tables (not persisted,
incrementally-updated numbers) — every request recalculates from source
data, so there's no "update"/"rollover" step that can get missed or run
late, and the numbers are always correct regardless of when the app is
opened.
Data Sources
Automatic: Gmail UPI alerts (OAuth + Gemini parsing — already built)
Manual: cash entries, bank balance, purchase goals, exceptions, daily budget edits