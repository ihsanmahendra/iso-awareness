const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'iso-awareness.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','super')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS modules (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id      INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  iso_standard  TEXT NOT NULL DEFAULT '',
  description   TEXT NOT NULL DEFAULT '',
  content       TEXT NOT NULL DEFAULT '',
  access        TEXT NOT NULL DEFAULT 'token' CHECK (access IN ('token','public')),
  pass_score    INTEGER NOT NULL DEFAULT 70,
  show_answers  INTEGER NOT NULL DEFAULT 1,
  shuffle       INTEGER NOT NULL DEFAULT 0,
  published     INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id   INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  option_a    TEXT NOT NULL,
  option_b    TEXT NOT NULL,
  option_c    TEXT NOT NULL,
  option_d    TEXT NOT NULL,
  correct     TEXT NOT NULL CHECK (correct IN ('A','B','C','D')),
  explanation TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tokens (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id        INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  code             TEXT NOT NULL UNIQUE,
  participant_name TEXT NOT NULL DEFAULT '',
  max_attempts     INTEGER NOT NULL DEFAULT 1,
  used_count       INTEGER NOT NULL DEFAULT 0,
  expires_at       TEXT,
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS attempts (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id        INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  token_id         INTEGER REFERENCES tokens(id) ON DELETE SET NULL,
  participant_name TEXT NOT NULL,
  department       TEXT NOT NULL DEFAULT '',
  correct_count    INTEGER NOT NULL,
  total            INTEGER NOT NULL,
  score            INTEGER NOT NULL,
  passed           INTEGER NOT NULL,
  answers          TEXT NOT NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_modules_admin ON modules(admin_id);
CREATE INDEX IF NOT EXISTS idx_questions_module ON questions(module_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_tokens_module ON tokens(module_id);
CREATE INDEX IF NOT EXISTS idx_attempts_module ON attempts(module_id);
`);

// ---------- Migrasi untuk database lama ----------
function addColumn(table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
}
addColumn('modules', 'cert_enabled', 'INTEGER NOT NULL DEFAULT 1');
addColumn('modules', 'cert_org', "TEXT NOT NULL DEFAULT ''");
addColumn('modules', 'cert_signer_name', "TEXT NOT NULL DEFAULT ''");
addColumn('modules', 'cert_signer_title', "TEXT NOT NULL DEFAULT ''");
addColumn('modules', 'cert_city', "TEXT NOT NULL DEFAULT ''");
addColumn('attempts', 'cert_code', 'TEXT');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_attempts_cert ON attempts(cert_code)');

function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

// Nomor sertifikat unik, mis. ISO-2026-K7QM3XRA
const CERT_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function newCertCode() {
  const exists = db.prepare('SELECT 1 FROM attempts WHERE cert_code = ?');
  let code;
  do {
    let s = '';
    for (let i = 0; i < 8; i++) s += CERT_ALPHABET[crypto.randomInt(CERT_ALPHABET.length)];
    code = `ISO-${new Date().getFullYear()}-${s}`;
  } while (exists.get(code));
  return code;
}

// Beri nomor sertifikat untuk kelulusan lama yang belum punya.
for (const a of db.prepare('SELECT id FROM attempts WHERE passed = 1 AND cert_code IS NULL').all()) {
  db.prepare('UPDATE attempts SET cert_code = ? WHERE id = ?').run(newCertCode(), a.id);
}

module.exports = { db, tx, newCertCode };
