const db = require('../db');

const insertStmt = db.prepare(`
  INSERT INTO transactions (gmail_message_id, source, date, amount, party, category)
  VALUES (@gmailMessageId, @source, @date, @amount, @party, @category)
`);
function insertTransaction(txn) {
  insertStmt.run({
    gmailMessageId: txn.gmailMessageId || null,
    source: txn.source || 'gmail',
    date: txn.date,
    amount: txn.amount,
    party: txn.party || null,
    category: txn.category || null
  });
}

const existsStmt = db.prepare('SELECT 1 FROM transactions WHERE gmail_message_id = ?');
function transactionExists(gmailMessageId) {
  return !!existsStmt.get(gmailMessageId);
}

// Non-exception spend, grouped by day, for a date range (inclusive).
// This is the BUDGET-relevant figure — feeds day status (red/green) and
// savings math, which exceptions are meant to be excluded from.
const dailyTotalsStmt = db.prepare(`
  SELECT date, SUM(amount) AS total
  FROM transactions
  WHERE date BETWEEN ? AND ? AND is_exception = 0
  GROUP BY date
`);
function getDailyTotals(startDate, endDate) {
  return dailyTotalsStmt.all(startDate, endDate);
}

// TRUE total spend for a range, exceptions included — this is a factual
// "how much did I actually spend" figure, not a budget-math figure, so it
// must not shrink just because something was marked an exception.
const trueTotalStmt = db.prepare(`
  SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE date BETWEEN ? AND ?
`);
function getTrueSpentInRange(startDate, endDate) {
  return trueTotalStmt.get(startDate, endDate).total;
}

const getMerchantCategoryStmt = db.prepare('SELECT category FROM merchant_categories WHERE merchant = ?');
function getMerchantCategory(merchant) {
  const row = getMerchantCategoryStmt.get(merchant);
  return row ? row.category : null;
}

const upsertMerchantCategoryStmt = db.prepare(`
  INSERT INTO merchant_categories (merchant, category, updated_at)
  VALUES (?, ?, datetime('now'))
  ON CONFLICT(merchant) DO UPDATE SET category = excluded.category, updated_at = excluded.updated_at
`);
function upsertMerchantCategory(merchant, category) {
  if (!merchant || !category) return;
  upsertMerchantCategoryStmt.run(merchant, category);
}

function getAllMerchantCategories() {
  const rows = db.prepare('SELECT merchant, category FROM merchant_categories').all();
  const map = {};
  rows.forEach((r) => { map[r.merchant] = r.category; });
  return map;
}

const getForDateStmt = db.prepare('SELECT * FROM transactions WHERE date = ? ORDER BY id');
function getTransactionsForDate(date) {
  return getForDateStmt.all(date);
}

const spentOnDateStmt = db.prepare(`
  SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE date = ? AND is_exception = 0
`);
function getSpentOnDate(date) {
  return spentOnDateStmt.get(date).total;
}

const markExceptionStmt = db.prepare('UPDATE transactions SET is_exception = 1, exception_name = ? WHERE id = ?');
function markException(id, name) {
  markExceptionStmt.run(name || null, id);
}

const unmarkExceptionStmt = db.prepare('UPDATE transactions SET is_exception = 0, exception_name = NULL WHERE id = ?');
function unmarkException(id) {
  unmarkExceptionStmt.run(id);
}

function insertCashEntry({ date, amount, party, category }) {
  insertTransaction({ source: 'cash', date, amount, party, category: category || 'Other' });
}

const exceptionsForMonthStmt = db.prepare(`
  SELECT id, date, amount, party, exception_name
  FROM transactions
  WHERE is_exception = 1 AND date BETWEEN ? AND ?
  ORDER BY date DESC
`);
function getExceptionsForMonth(startDate, endDate) {
  return exceptionsForMonthStmt.all(startDate, endDate);
}

const earliestDateStmt = db.prepare('SELECT MIN(date) AS d FROM transactions');
function getEarliestTransactionDate() {
  return earliestDateStmt.get().d;
}

module.exports = {
  insertTransaction,
  transactionExists,
  getDailyTotals,
  getTrueSpentInRange,
  getMerchantCategory,
  upsertMerchantCategory,
  getAllMerchantCategories,
  getTransactionsForDate,
  getSpentOnDate,
  markException,
  unmarkException,
  insertCashEntry,
  getExceptionsForMonth,
  getEarliestTransactionDate
};
