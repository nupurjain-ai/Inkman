const express = require('express');
const { getDailyTotals, getTrueSpentInRange } = require('./models/transactions');
const { getBudgetForDate } = require('./models/dailyBudgets');

const router = express.Router();

function pad2(n) {
  return String(n).padStart(2, '0');
}

router.get('/api/calendar/:year/:month', (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month); // 1-12

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'invalid_year_or_month' });
  }

  const lastDay = new Date(year, month, 0).getDate();
  const startDate = `${year}-${pad2(month)}-01`;
  const endDate = `${year}-${pad2(month)}-${pad2(lastDay)}`;

  const totalsByDate = {};
  getDailyTotals(startDate, endDate).forEach((row) => {
    totalsByDate[row.date] = row.total;
  });

  const days = [];
  // Deliberately NOT the same figure as the per-day budget totals below —
  // this is "how much did I actually spend," which must not shrink just
  // because a transaction was marked an exception.
  const monthTotal = getTrueSpentInRange(startDate, endDate);

  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${year}-${pad2(month)}-${pad2(d)}`;
    const spent = totalsByDate[dateStr] || 0;
    const budget = getBudgetForDate(dateStr);

    days.push({
      date: dateStr,
      day: d,
      spent,
      budget,
      status: budget == null ? 'unbudgeted' : spent > budget ? 'red' : 'green'
    });
  }

  res.json({ year, month, firstWeekday: new Date(year, month - 1, 1).getDay(), days, monthTotal });
});

module.exports = router;
