const db = require('../db');
const { getBudgetForDate } = require('./dailyBudgets');
const { getSpentOnDate, getEarliestTransactionDate } = require('./transactions');

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Sum of (budget - spent) over [startDate, endDate] inclusive —
 * underspend days add, overspend days subtract. Exceptions are already
 * excluded from spend by getSpentOnDate's underlying query.
 */
function sumNetForRange(startDate, endDate) {
  let total = 0;
  let date = startDate;
  while (date <= endDate) {
    const budget = getBudgetForDate(date);
    if (budget != null) {
      total += budget - getSpentOnDate(date);
    }
    date = addDays(date, 1);
  }
  return total;
}

/**
 * "Total Amount" for a given month — live, recalculated fresh every
 * time it's requested, never a stored figure. Scoped to whichever
 * month is asked for (e.g. the month currently shown on the calendar):
 * a past month sums its full range, the current month sums through
 * today only (live, updates as today's spend comes in), and a future
 * month is 0 (nothing's happened yet). It never looks outside the
 * requested month, so it's inherently "reset" at each month's start
 * rather than needing an explicit reset step.
 */
function computeMonthNet(year, month) {
  const pad2 = (n) => String(n).padStart(2, '0');
  const monthStart = `${year}-${pad2(month)}-01`;
  const today = todayStr();
  if (monthStart > today) return 0;

  const lastDay = new Date(year, month, 0).getDate();
  const monthEnd = `${year}-${pad2(month)}-${pad2(lastDay)}`;
  const endDate = monthEnd < today ? monthEnd : today;

  return sumNetForRange(monthStart, endDate);
}

// 'YYYY-MM' + n months, wrapping year correctly.
function addMonthsToKey(key, n) {
  let [y, m] = key.split('-').map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

/**
 * A goal's cumulative progress: built from Total Amount, month by month,
 * from whichever is later — the month the goal was created, or the month
 * our data starts — through the current month. Each month's contribution
 * is that month's Total Amount (computeMonthNet — already handles "full
 * range for a past month, through-today for the current month"), floored
 * at 0 INDIVIDUALLY before adding — a bad month contributes exactly ₹0,
 * it never subtracts from progress already earned in better months. This
 * is why progress only ever holds steady or grows, never drops.
 */
function computeGoalProgress(goalCreatedAt) {
  const earliestData = getEarliestTransactionDate();
  if (!earliestData) return 0;

  const goalMonthKey = String(goalCreatedAt).slice(0, 7);
  const dataStartMonthKey = earliestData.slice(0, 7);
  const currentMonthKey = todayStr().slice(0, 7);

  let monthKey = goalMonthKey > dataStartMonthKey ? goalMonthKey : dataStartMonthKey;
  let total = 0;

  while (monthKey <= currentMonthKey) {
    const [y, m] = monthKey.split('-').map(Number);
    total += Math.max(0, computeMonthNet(y, m));
    monthKey = addMonthsToKey(monthKey, 1);
  }

  return total;
}

const getBankBalanceStmt = db.prepare('SELECT bank_balance FROM jar_settings WHERE id = 1');
function getBankBalance() {
  const row = getBankBalanceStmt.get();
  return row ? row.bank_balance : null;
}

const setBankBalanceStmt = db.prepare('UPDATE jar_settings SET bank_balance = ? WHERE id = 1');
function setBankBalance(amount) {
  setBankBalanceStmt.run(amount);
}

const insertGoalStmt = db.prepare('INSERT INTO goals (name, target_amount) VALUES (?, ?)');
function createGoal(name, targetAmount) {
  insertGoalStmt.run(name, targetAmount);
}

const deleteGoalStmt = db.prepare('DELETE FROM goals WHERE id = ?');
function deleteGoal(id) {
  deleteGoalStmt.run(id);
}

const listGoalsStmt = db.prepare('SELECT * FROM goals ORDER BY created_at');
function listGoals() {
  return listGoalsStmt.all();
}

module.exports = {
  computeMonthNet,
  computeGoalProgress,
  addMonthsToKey,
  getBankBalance,
  setBankBalance,
  createGoal,
  deleteGoal,
  listGoals
};
