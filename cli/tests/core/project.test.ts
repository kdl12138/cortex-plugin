import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { initDatabase } from '../../src/db/database.js';
import {
  createProject,
  listProjects,
  switchProject,
  linkProject,
  currentProject,
} from '../../src/core/project.js';

describe('createProject', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-project-'));
    db = initDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts a row into the projects table', () => {
    createProject(db, 'my-project', 'A test project');

    const row = db.prepare('SELECT * FROM projects WHERE name = ?').get('my-project') as any;
    expect(row).toBeDefined();
    expect(row.name).toBe('my-project');
    expect(row.description).toBe('A test project');
  });

  it('sets created_at and last_active timestamps', () => {
    const before = new Date().toISOString();
    createProject(db, 'timed-project');
    const after = new Date().toISOString();

    const row = db.prepare('SELECT * FROM projects WHERE name = ?').get('timed-project') as any;
    expect(row.created_at).toBeDefined();
    expect(row.last_active).toBeDefined();
    expect(row.created_at >= before).toBe(true);
    expect(row.created_at <= after).toBe(true);
    expect(row.last_active).toBe(row.created_at);
  });

  it('allows description to be optional (null)', () => {
    createProject(db, 'no-desc');

    const row = db.prepare('SELECT * FROM projects WHERE name = ?').get('no-desc') as any;
    expect(row.description).toBeNull();
  });

  it('throws on duplicate project name', () => {
    createProject(db, 'dup-project');
    expect(() => createProject(db, 'dup-project')).toThrow();
  });
});

describe('listProjects', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-project-'));
    db = initDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns an empty array when no projects exist', () => {
    const projects = listProjects(db);
    expect(projects).toEqual([]);
  });

  it('returns all projects sorted by last_active descending', () => {
    // Insert projects with staggered timestamps
    db.prepare(
      'INSERT INTO projects (name, description, created_at, last_active) VALUES (?, ?, ?, ?)'
    ).run('old-project', 'Old', '2024-01-01T00:00:00.000Z', '2024-01-01T00:00:00.000Z');
    db.prepare(
      'INSERT INTO projects (name, description, created_at, last_active) VALUES (?, ?, ?, ?)'
    ).run('new-project', 'New', '2024-06-01T00:00:00.000Z', '2024-06-01T00:00:00.000Z');
    db.prepare(
      'INSERT INTO projects (name, description, created_at, last_active) VALUES (?, ?, ?, ?)'
    ).run('mid-project', 'Mid', '2024-03-01T00:00:00.000Z', '2024-03-01T00:00:00.000Z');

    const projects = listProjects(db);
    expect(projects).toHaveLength(3);
    expect(projects[0].name).toBe('new-project');
    expect(projects[1].name).toBe('mid-project');
    expect(projects[2].name).toBe('old-project');
  });

  it('returns correct fields for each project', () => {
    createProject(db, 'full-project', 'Full description');

    const projects = listProjects(db);
    expect(projects).toHaveLength(1);
    expect(projects[0]).toHaveProperty('name', 'full-project');
    expect(projects[0]).toHaveProperty('description', 'Full description');
    expect(projects[0]).toHaveProperty('created_at');
    expect(projects[0]).toHaveProperty('last_active');
  });
});

describe('switchProject', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-project-'));
    mkdirSync(join(tmpDir, '.cortex'), { recursive: true });
    db = initDatabase(join(tmpDir, '.cortex', 'cortex.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes the project name to the active_project file', () => {
    createProject(db, 'switch-target');
    switchProject(db, tmpDir, 'switch-target');

    const activeFile = join(tmpDir, '.cortex', 'active_project');
    expect(existsSync(activeFile)).toBe(true);
    expect(readFileSync(activeFile, 'utf-8')).toBe('switch-target');
  });

  it('updates the last_active timestamp', () => {
    createProject(db, 'switch-time');
    const rowBefore = db.prepare('SELECT last_active FROM projects WHERE name = ?').get('switch-time') as any;

    // Small delay so timestamps differ
    const before = rowBefore.last_active;
    switchProject(db, tmpDir, 'switch-time');

    const rowAfter = db.prepare('SELECT last_active FROM projects WHERE name = ?').get('switch-time') as any;
    expect(rowAfter.last_active >= before).toBe(true);
  });

  it('throws if the project does not exist', () => {
    expect(() => switchProject(db, tmpDir, 'nonexistent')).toThrow();
  });
});

describe('linkProject', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-project-'));
    db = initDatabase(join(tmpDir, 'test.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts a directory-to-project link', () => {
    createProject(db, 'linked-project');
    linkProject(db, '/some/path', 'linked-project');

    const row = db.prepare('SELECT * FROM project_dirs WHERE dir_path = ?').get('/some/path') as any;
    expect(row).toBeDefined();
    expect(row.project_name).toBe('linked-project');
  });

  it('replaces an existing link for the same directory', () => {
    createProject(db, 'project-a');
    createProject(db, 'project-b');
    linkProject(db, '/some/path', 'project-a');
    linkProject(db, '/some/path', 'project-b');

    const row = db.prepare('SELECT * FROM project_dirs WHERE dir_path = ?').get('/some/path') as any;
    expect(row.project_name).toBe('project-b');
  });

  it('throws if the project does not exist', () => {
    expect(() => linkProject(db, '/some/path', 'nonexistent')).toThrow();
  });
});

describe('currentProject', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-project-'));
    mkdirSync(join(tmpDir, '.cortex'), { recursive: true });
    db = initDatabase(join(tmpDir, '.cortex', 'cortex.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no active project file and no cwd', () => {
    const result = currentProject(db, tmpDir);
    expect(result).toBeNull();
  });

  it('reads the project name from active_project file', () => {
    createProject(db, 'active-proj');
    switchProject(db, tmpDir, 'active-proj');

    const result = currentProject(db, tmpDir);
    expect(result).toBe('active-proj');
  });

  it('active_project file takes priority over directory link', () => {
    createProject(db, 'file-proj');
    createProject(db, 'dir-proj');
    switchProject(db, tmpDir, 'file-proj');
    linkProject(db, tmpDir, 'dir-proj');

    const result = currentProject(db, tmpDir, tmpDir);
    expect(result).toBe('file-proj');
  });

  it('falls back to directory link when no active_project file', () => {
    createProject(db, 'dir-proj');
    linkProject(db, tmpDir, 'dir-proj');

    const result = currentProject(db, tmpDir, tmpDir);
    expect(result).toBe('dir-proj');
  });

  it('walks ancestor directories to find a linked project', () => {
    const nested = join(tmpDir, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });

    createProject(db, 'ancestor-proj');
    linkProject(db, join(tmpDir, 'a'), 'ancestor-proj');

    const result = currentProject(db, tmpDir, nested);
    expect(result).toBe('ancestor-proj');
  });

  it('returns the closest ancestor link', () => {
    const nested = join(tmpDir, 'a', 'b', 'c');
    mkdirSync(nested, { recursive: true });

    createProject(db, 'parent-proj');
    createProject(db, 'grandparent-proj');
    linkProject(db, join(tmpDir, 'a', 'b'), 'parent-proj');
    linkProject(db, join(tmpDir, 'a'), 'grandparent-proj');

    const result = currentProject(db, tmpDir, nested);
    expect(result).toBe('parent-proj');
  });

  it('returns null when cwd has no linked ancestors', () => {
    const nested = join(tmpDir, 'x', 'y');
    mkdirSync(nested, { recursive: true });

    const result = currentProject(db, tmpDir, nested);
    expect(result).toBeNull();
  });
});
