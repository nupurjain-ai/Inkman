const express = require('express');
const {
  computeMonthNet,
  computeGoalProgress,
  getBankBalance,
  setBankBalance,
  createGoal,
  deleteGoal,
  listGoals
} = require('./models/savingsJar');
const { getExceptionsForMonth } = require('./models/transactions');

const router = express.Router();

router.get('/api/jar', (req, res) => {
  // Total Amount is scoped to whichever month the caller asks about
  // (e.g. whatever month is currently shown on the calendar) — defaults
  // to the real current month if not specified. Goal progress is
  // unaffected by this — it's always cumulative through today,
  // independent of which month you're looking at.
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || now.getMonth() + 1;
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: 'invalid_year_or_month' });
  }

  const totalAmount = computeMonthNet(year, month);
  const goals = listGoals().map((g) => {
    const rawProgress = computeGoalProgress(g.created_at);
    return {
      id: g.id,
      name: g.name,
      targetAmount: g.target_amount,
      // Shared-pool model: every goal tracks the same cumulative total,
      // not a split/reserved amount — see plan.md's finalized decision.
      // computeGoalProgress already floors each month individually, so
      // rawProgress is never negative — this only clamps to the target
      // for the progress-bar's width.
      progress: Math.min(Math.max(0, rawProgress), g.target_amount),
      completed: rawProgress >= g.target_amount
    };
  });

  res.json({ totalAmount, year, month, bankBalance: getBankBalance(), goals });
});

router.post('/api/jar/bank-balance', (req, res) => {
  const amount = req.body && req.body.amount;
  if (amount !== null && (typeof amount !== 'number' || amount < 0)) {
    return res.status(400).json({ error: 'invalid_amount' });
  }
  setBankBalance(amount);
  res.json({ ok: true });
});

router.post('/api/jar/goals', (req, res) => {
  const { name, targetAmount } = req.body || {};
  if (!name || !targetAmount || Number(targetAmount) <= 0) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  createGoal(String(name).slice(0, 100), Number(targetAmount));
  res.json({ ok: true });
});

router.delete('/api/jar/goals/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid_id' });
  deleteGoal(id);
  res.json({ ok: true });
});

router.get('/api/exceptions', (req, res) => {
  const month = req.query.month; // 'YYYY-MM'
  if (!/^\d{4}-\d{2}$/.test(month || '')) {
    return res.status(400).json({ error: 'invalid_month' });
  }
  const lastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const exceptions = getExceptionsForMonth(`${month}-01`, `${month}-${String(lastDay).padStart(2, '0')}`);
  res.json({ month, exceptions });
});

module.exports = router;
