CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gmail_message_id TEXT UNIQUE,
  source TEXT NOT NULL DEFAULT 'gmail',      -- 'gmail' | 'cash'
  date TEXT NOT NULL,                        -- 'YYYY-MM-DD'
  amount REAL NOT NULL,
  party TEXT,
  category TEXT,
  is_exception INTEGER NOT NULL DEFAULT 0,
  exception_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);

-- Effective-dated daily budget: the budget for a given date is whichever
-- row has the latest effective_from_date <= that date. Editing "applies
-- from that date forward" falls out of this for free.
CREATE TABLE IF NOT EXISTS daily_budgets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  effective_from_date TEXT NOT NULL UNIQUE,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Merchant -> category cache so Gemini's categorization is consistent
-- across syncs and doesn't need to be re-decided for a merchant it's
-- already seen.
CREATE TABLE IF NOT EXISTS merchant_categories (
  merchant TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Purchase goals. Shared-pool model: a goal's progress is just
-- min(total saved, target_amount) — goals don't reserve or subtract from
-- the jar total, they're motivational trackers over the same pool.
CREATE TABLE IF NOT EXISTS goals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  target_amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Single-row settings the Savings Jar needs (bank balance is manual,
-- optional). Key-value would also work, but the jar only ever needs this
-- one field so far, so a single row is simpler.
CREATE TABLE IF NOT EXISTS jar_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  bank_balance REAL
);
INSERT OR IGNORE INTO jar_settings (id, bank_balance) VALUES (1, NULL);

-- User-supplied LLM key, entered via the Settings modal. When set, this
-- replaces the .env GEMINI_API_KEY / hardcoded provider for all agent
-- calls (sync extraction + day summaries). The key is never sent back to
-- the browser once saved — only provider + a masked hint.
CREATE TABLE IF NOT EXISTS llm_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  provider TEXT,              -- 'gemini' | 'openai' | 'anthropic' | 'groq'
  api_key TEXT
);
INSERT OR IGNORE INTO llm_settings (id, provider, api_key) VALUES (1, NULL, NULL);
