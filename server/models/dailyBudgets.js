const db = require('../db');

const getEffectiveStmt = db.prepare(`
  SELECT amount FROM daily_budgets
  WHERE effective_from_date <= ?
  ORDER BY effective_from_date DESC
  LIMIT 1
`);
function getBudgetForDate(dateStr) {
  const row = getEffectiveStmt.get(dateStr);
  return row ? row.amount : null;
}

const setStmt = db.prepare(`
  INSERT INTO daily_budgets (effective_from_date, amount)
  VALUES (?, ?)
  ON CONFLICT(effective_from_date) DO UPDATE SET amount = excluded.amount
`);
function setBudgetFrom(dateStr, amount) {
  setStmt.run(dateStr, amount);
}

const countStmt = db.prepare('SELECT COUNT(*) AS c FROM daily_budgets');

// Phase 1 has no budget-editing UI yet (that's Phase 2), but the calendar
// needs *some* figure to compare against from day one, so seed a single
// default that applies to every date until it's edited.
function seedDefaultIfEmpty(defaultAmount) {
  if (countStmt.get().c === 0) {
    setBudgetFrom('1970-01-01', defaultAmount);
  }
}

module.exports = { getBudgetForDate, setBudgetFrom, seedDefaultIfEmpty };
