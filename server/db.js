const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'inkman.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// One-time self-healing cleanup, safe to run on every startup (a no-op
// once clean): a pre-fix bug had the LLM hallucinate transaction dates
// outside any plausible window (seen: 2017–2022, and a few days in the
// future) instead of using Gmail's own message timestamp — see
// RETRO.md §3. Deleting these lets the next sync correctly re-fetch and
// re-date them (Gmail message IDs are only deduped against what's
// currently stored, nothing is lost).
const today = new Date().toISOString().slice(0, 10);
const cleanup = db.prepare(
  "DELETE FROM transactions WHERE date > ? OR date < date(?, '-2 years')"
).run(today, today);
if (cleanup.changes > 0) {
  console.log(`Startup cleanup: removed ${cleanup.changes} transaction(s) with implausible dates.`);
}

module.exports = db;
