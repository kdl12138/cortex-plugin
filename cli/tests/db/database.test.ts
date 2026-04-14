import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initDatabase, getDatabase } from '../../src/db/database.js';

describe('initDatabase', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-db-test-'));
    dbPath = join(tmpDir, 'cortex.db');
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the database file', () => {
    initDatabase(dbPath);
    expect(existsSync(dbPath)).toBe(true);
  });

  it('creates the projects table', () => {
    const db = initDatabase(dbPath);
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
    ).get() as { name: string } | undefined;
    expect(row?.name).toBe('projects');
    db.close();
  });

  it('creates the project_dirs table', () => {
    const db = initDatabase(dbPath);
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='project_dirs'"
    ).get() as { name: string } | undefined;
    expect(row?.name).toBe('project_dirs');
    db.close();
  });

  it('creates the memory_index table', () => {
    const db = initDatabase(dbPath);
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_index'"
    ).get() as { name: string } | undefined;
    expect(row?.name).toBe('memory_index');
    db.close();
  });

  it('creates the memory_fts virtual table', () => {
    const db = initDatabase(dbPath);
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_fts'"
    ).get() as { name: string } | undefined;
    expect(row?.name).toBe('memory_fts');
    db.close();
  });

  it('creates the skill_index table', () => {
    const db = initDatabase(dbPath);
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='skill_index'"
    ).get() as { name: string } | undefined;
    expect(row?.name).toBe('skill_index');
    db.close();
  });

  it('creates the skill_fts virtual table', () => {
    const db = initDatabase(dbPath);
    const row = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='skill_fts'"
    ).get() as { name: string } | undefined;
    expect(row?.name).toBe('skill_fts');
    db.close();
  });

  it('is idempotent — calling twice does not error', () => {
    const db1 = initDatabase(dbPath);
    db1.close();

    const db2 = initDatabase(dbPath);
    const tables = db2.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    expect(tableNames).toContain('projects');
    expect(tableNames).toContain('project_dirs');
    expect(tableNames).toContain('memory_index');
    expect(tableNames).toContain('memory_fts');
    expect(tableNames).toContain('skill_index');
    expect(tableNames).toContain('skill_fts');
    db2.close();
  });

  it('enables WAL journal mode', () => {
    const db = initDatabase(dbPath);
    const row = db.prepare('PRAGMA journal_mode').get() as { journal_mode: string };
    expect(row.journal_mode).toBe('wal');
    db.close();
  });

  it('enables foreign key enforcement', () => {
    const db = initDatabase(dbPath);
    const row = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
    db.close();
  });

  it('enforces foreign key constraint on project_dirs', () => {
    const db = initDatabase(dbPath);

    // Inserting a project_dirs row referencing a non-existent project should fail
    expect(() => {
      db.prepare(
        "INSERT INTO project_dirs (dir_path, project_name) VALUES (?, ?)"
      ).run('/some/path', 'nonexistent-project');
    }).toThrow();

    db.close();
  });

  it('allows valid foreign key references on project_dirs', () => {
    const db = initDatabase(dbPath);

    // Insert a valid project first
    db.prepare(
      "INSERT INTO projects (name, description, created_at, last_active) VALUES (?, ?, datetime('now'), datetime('now'))"
    ).run('test-project', 'A test project');

    // Now inserting a project_dirs row referencing it should succeed
    expect(() => {
      db.prepare(
        "INSERT INTO project_dirs (dir_path, project_name) VALUES (?, ?)"
      ).run('/some/path', 'test-project');
    }).not.toThrow();

    db.close();
  });
});

describe('getDatabase', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-db-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('throws if the database file does not exist', () => {
    const missingPath = join(tmpDir, 'nonexistent.db');
    expect(() => getDatabase(missingPath)).toThrow();
  });

  it('opens an existing database file', () => {
    const dbPath = join(tmpDir, 'cortex.db');
    const db1 = initDatabase(dbPath);
    db1.close();

    const db2 = getDatabase(dbPath);
    const row = db2.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='projects'"
    ).get() as { name: string } | undefined;
    expect(row?.name).toBe('projects');
    db2.close();
  });

  it('enables foreign keys on the opened database', () => {
    const dbPath = join(tmpDir, 'cortex.db');
    const db1 = initDatabase(dbPath);
    db1.close();

    const db2 = getDatabase(dbPath);
    const row = db2.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
    expect(row.foreign_keys).toBe(1);
    db2.close();
  });
});
