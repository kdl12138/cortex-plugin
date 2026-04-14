import Database from 'better-sqlite3';
import { existsSync } from 'fs';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
  name TEXT PRIMARY KEY,
  description TEXT,
  created_at DATETIME,
  last_active DATETIME
);

CREATE TABLE IF NOT EXISTS project_dirs (
  dir_path TEXT PRIMARY KEY,
  project_name TEXT REFERENCES projects(name)
);

CREATE TABLE IF NOT EXISTS memory_index (
  id TEXT PRIMARY KEY,
  file_path TEXT,
  scope TEXT,
  project TEXT,
  created_at DATETIME,
  last_recalled DATETIME,
  recall_count INTEGER,
  freshness REAL,
  tags TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  id, content, tags, tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS skill_index (
  id TEXT PRIMARY KEY,
  file_path TEXT,
  type TEXT,
  scope TEXT,
  project TEXT,
  triggers TEXT,
  domain TEXT,
  abstraction TEXT,
  created_at DATETIME,
  updated_at DATETIME
);

CREATE VIRTUAL TABLE IF NOT EXISTS skill_fts USING fts5(
  id, content, triggers, domain, tokenize='unicode61'
);
`;

/**
 * Create or open a database at `dbPath`, run the full schema,
 * enable WAL mode and foreign keys. Returns the Database instance.
 */
export function initDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(SCHEMA);

  return db;
}

/**
 * Open an existing database at `dbPath`. Throws if the file does not exist.
 * Enables foreign keys on the returned connection.
 */
export function getDatabase(dbPath: string): Database.Database {
  if (!existsSync(dbPath)) {
    throw new Error(`Database file not found: ${dbPath}`);
  }

  const db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  return db;
}
