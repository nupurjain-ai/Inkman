const express = require('express');
const {
  getTransactionsForDate,
  getSpentOnDate,
  markException,
  unmarkException,
  insertCashEntry
} = require('./models/transactions');
const { getBudgetForDate, setBudgetFrom } = require('./models/dailyBudgets');
const { summarizeDay } = require('./gmailSync');

const router = express.Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/api/day/:date', async (req, res) => {
  const { date } = req.params;
  if (!DATE_RE.test(date)) return res.status(400).json({ error: 'invalid_date' });

  const transactions = getTransactionsForDate(date);
  const spent = getSpentOnDate(date);
  const budget = getBudgetForDate(date);

  let summary = '';
  try {
    summary = await summarizeDay(date, spent, budget, transactions);
  } catch (err) {
    console.error('Day summary failed:', err.message);
    summary = `You spent ₹${spent} on ${date}.`;
  }

  res.json({ date, budget, spent, transactions, summary });
});

router.post('/api/day/:date/budget', (req, res) => {
  const { date } = req.params;
  const amount = Number(req.body && req.body.amount);
  if (!DATE_RE.test(date) || !amount || amount < 0) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  setBudgetFrom(date, amount);
  res.json({ ok: true });
});

router.post('/api/day/:date/cash', (req, res) => {
  const { date } = req.params;
  const { amount, party, category } = req.body || {};
  if (!DATE_RE.test(date) || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'invalid_input' });
  }
  insertCashEntry({ date, amount: Number(amount), party: party || 'Cash spend', category });
  res.json({ ok: true });
});

router.post('/api/transactions/:id/exception', (req, res) => {
  const id = Number(req.params.id);
  const name = (req.body && req.body.name) || 'Exception';
  if (!id) return res.status(400).json({ error: 'invalid_id' });
  markException(id, name);
  res.json({ ok: true });
});

router.delete('/api/transactions/:id/exception', (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'invalid_id' });
  unmarkException(id);
  res.json({ ok: true });
});

module.exports = router;
