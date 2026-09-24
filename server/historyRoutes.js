const express = require('express');
const { getDailyTotals, getTrueSpentInRange, getEarliestTransactionDate } = require('./models/transactions');
const { getBudgetForDate } = require('./models/dailyBudgets');
const { computeMonthNet, addMonthsToKey } = require('./models/savingsJar');

const router = express.Router();

function pad2(n) {
  return String(n).padStart(2, '0');
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// One month's spent/budgeted totals and green/red day tally. Mirrors
// calendarRoutes.js's day-status logic exactly (same green/red/
// unbudgeted rule), and reuses computeMonthNet as the single source of
// truth for "net saved" so this always agrees with the Savings Jar.
function summarizeMonth(year, month) {
  const today = todayStr();
  const monthStartKey = `${year}-${pad2(month)}`;
  if (monthStartKey > today.slice(0, 7)) return null; // future month — nothing to summarize yet

  const lastDay = new Date(year, month, 0).getDate();
  const monthStart = `${year}-${pad2(month)}-01`;
  const monthEndFull = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  // Clamp the in-progress month to today, same as computeMonthNet, so
  // "spent so far" is compared against "budgeted so far" — otherwise a
  // part-way-through month would misleadingly look hugely under budget
  // against a budget total for days that haven't happened yet.
  const monthEnd = monthEndFull < today ? monthEndFull : today;

  const totalsByDate = {};
  getDailyTotals(monthStart, monthEnd).forEach((row) => { totalsByDate[row.date] = row.total; });

  let budgeted = 0;
  let greenDays = 0;
  let redDays = 0;
  let date = monthStart;
  while (date <= monthEnd) {
    const budget = getBudgetForDate(date);
    const spent = totalsByDate[date] || 0;
    if (budget != null) {
      budgeted += budget;
      if (spent > budget) redDays += 1;
      else greenDays += 1;
    }
    date = addDays(date, 1);
  }

  const netSaved = computeMonthNet(year, month);

  return {
    year,
    month,
    spent: getTrueSpentInRange(monthStart, monthEnd),
    budgeted,
    greenDays,
    redDays,
    netSaved,
    status: netSaved >= 0 ? 'under' : 'over'
  };
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

router.get('/api/history', (req, res) => {
  const today = todayStr();
  const currentMonthKey = today.slice(0, 7);

  const earliest = getEarliestTransactionDate();
  const startMonthKey = earliest && earliest.slice(0, 7) < currentMonthKey ? earliest.slice(0, 7) : currentMonthKey;

  const months = [];
  let key = startMonthKey;
  while (key <= currentMonthKey) {
    const [y, m] = key.split('-').map(Number);
    const summary = summarizeMonth(y, m);
    if (summary) months.push(summary);
    key = addMonthsToKey(key, 1);
  }
  months.reverse(); // most recent first

  const years = Array.from(new Set(months.map((m) => m.year))).sort((a, b) => b - a);

  const currentYear = Number(currentMonthKey.slice(0, 4));
  const ytdMonths = months.filter((m) => m.year === currentYear);
  // "Moved to jar" is a literal cumulative figure — it can only grow,
  // so a bad month contributes ₹0 rather than dragging the total down,
  // the same rule computeGoalProgress uses for a goal's own progress.
  const ytdSavings = ytdMonths.reduce((sum, m) => sum + Math.max(0, m.netSaved), 0);
  const ytdGreenDays = ytdMonths.reduce((sum, m) => sum + m.greenDays, 0);
  const ytdRedDays = ytdMonths.reduce((sum, m) => sum + m.redDays, 0);
  const ytdTotalDays = ytdGreenDays + ytdRedDays;
  const greenPct = ytdTotalDays > 0 ? Math.round((ytdGreenDays / ytdTotalDays) * 100) : 0;

  res.json({
    months,
    years: years.length > 0 ? years : [currentYear],
    ytd: {
      year: currentYear,
      startMonth: 1,
      endMonth: Number(currentMonthKey.slice(5, 7)),
      savings: ytdSavings,
      greenDays: ytdGreenDays,
      redDays: ytdRedDays,
      greenPct,
      redPct: ytdTotalDays > 0 ? 100 - greenPct : 0
    }
  });
});

module.exports = router;
