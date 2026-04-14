import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { initDatabase } from '../../src/db/database.js';
import { initCortexDir } from '../../src/core/init.js';
import { writeMemory, recallMemories, listMemories, gcMemories } from '../../src/core/memory.js';

describe('writeMemory', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-memory-'));
    initCortexDir(tmpDir);
    db = initDatabase(join(tmpDir, '.cortex', 'cortex.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes a core memory file and indexes it', () => {
    const id = writeMemory(db, tmpDir, {
      content: 'FTS5 needs a unicode61 tokenizer for CJK support.',
      scope: 'core',
      tags: ['sqlite', 'fts5', 'cjk'],
      slug: 'fts5-tokenizer-lesson',
    });

    // Verify file exists at memory/core/<id>.md
    const filePath = join(tmpDir, '.cortex', 'memory', 'core', `${id}.md`);
    expect(existsSync(filePath)).toBe(true);

    // Verify file has frontmatter with created date and tags
    const fileContent = readFileSync(filePath, 'utf-8');
    expect(fileContent).toContain('---');
    expect(fileContent).toContain('tags: [sqlite, fts5, cjk]');
    expect(fileContent).toMatch(/created: \d{4}-\d{2}-\d{2}/);

    // Verify file body matches content
    expect(fileContent).toContain('FTS5 needs a unicode61 tokenizer for CJK support.');

    // Verify memory_index row
    const row = db.prepare('SELECT * FROM memory_index WHERE id = ?').get(id) as any;
    expect(row).toBeDefined();
    expect(row.scope).toBe('core');
    expect(row.project).toBeNull();
    expect(row.freshness).toBeCloseTo(1.0);
    expect(row.recall_count).toBe(0);
    expect(row.file_path).toBe(filePath);
    expect(row.tags).toBe('["sqlite","fts5","cjk"]');

    // Verify memory_fts row
    const ftsRow = db.prepare('SELECT * FROM memory_fts WHERE id = ?').get(id) as any;
    expect(ftsRow).toBeDefined();
    expect(ftsRow.content).toBe('FTS5 needs a unicode61 tokenizer for CJK support.');
    expect(ftsRow.tags).toBe('sqlite fts5 cjk');
  });

  it('writes a project memory file', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'cortex-proj-'));

    try {
      const id = writeMemory(db, tmpDir, {
        content: 'Project-specific memory content.',
        scope: 'project',
        tags: ['project', 'test'],
        slug: 'project-memory',
        project: 'my-project',
        projectDir,
      });

      // Verify file at <projectDir>/.cortex/memory/<id>.md
      const filePath = join(projectDir, '.cortex', 'memory', `${id}.md`);
      expect(existsSync(filePath)).toBe(true);

      // Verify memory_index row
      const row = db.prepare('SELECT * FROM memory_index WHERE id = ?').get(id) as any;
      expect(row).toBeDefined();
      expect(row.scope).toBe('project');
      expect(row.project).toBe('my-project');
      expect(row.file_path).toBe(filePath);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('generates a timestamped id with slug', () => {
    const id = writeMemory(db, tmpDir, {
      content: 'Some content.',
      scope: 'core',
      tags: ['test'],
      slug: 'fts5-tokenizer-lesson',
    });

    expect(id).toMatch(/^\d+-fts5-tokenizer-lesson$/);
  });

  it('creates parent directories if they do not exist', () => {
    // Use a fresh tmpDir without initCortexDir to test recursive mkdir
    const freshDir = mkdtempSync(join(tmpdir(), 'cortex-fresh-'));

    try {
      const freshDb = initDatabase(join(freshDir, 'test.db'));
      try {
        const id = writeMemory(freshDb, freshDir, {
          content: 'Content in new dir.',
          scope: 'core',
          tags: [],
          slug: 'new-dir-test',
        });

        const filePath = join(freshDir, '.cortex', 'memory', 'core', `${id}.md`);
        expect(existsSync(filePath)).toBe(true);
      } finally {
        freshDb.close();
      }
    } finally {
      rmSync(freshDir, { recursive: true, force: true });
    }
  });

  it('stores created_at and last_recalled as ISO strings', () => {
    const before = new Date().toISOString();
    const id = writeMemory(db, tmpDir, {
      content: 'Timestamp check.',
      scope: 'core',
      tags: [],
      slug: 'timestamp-check',
    });
    const after = new Date().toISOString();

    const row = db.prepare('SELECT * FROM memory_index WHERE id = ?').get(id) as any;
    expect(row.created_at >= before).toBe(true);
    expect(row.created_at <= after).toBe(true);
    expect(row.last_recalled).toBe(row.created_at);
  });
});

describe('recallMemories', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-recall-'));
    initCortexDir(tmpDir);
    db = initDatabase(join(tmpDir, '.cortex', 'cortex.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('finds memories by FTS query', () => {
    writeMemory(db, tmpDir, {
      content: 'Kubernetes pods need resource limits configured.',
      scope: 'core',
      tags: ['kubernetes', 'devops'],
      slug: 'k8s-limits',
    });
    writeMemory(db, tmpDir, {
      content: 'React hooks must follow the rules of hooks.',
      scope: 'core',
      tags: ['react', 'frontend'],
      slug: 'react-hooks',
    });

    const results = recallMemories(db, tmpDir, 'kubernetes');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].content).toContain('Kubernetes');
    expect(results[0].tags).toContain('kubernetes');
    expect(results[0].id).toContain('k8s-limits');
  });

  it('sorts by freshness-weighted relevance', () => {
    const id1 = writeMemory(db, tmpDir, {
      content: 'Database indexing improves query performance.',
      scope: 'core',
      tags: ['database'],
      slug: 'db-indexing',
    });
    const id2 = writeMemory(db, tmpDir, {
      content: 'Database normalization reduces redundancy.',
      scope: 'core',
      tags: ['database'],
      slug: 'db-normalization',
    });

    // Set id1's last_recalled to 6 months ago so computeFreshness returns a low value
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE memory_index SET last_recalled = ? WHERE id = ?').run(sixMonthsAgo, id1);

    const results = recallMemories(db, tmpDir, 'database');
    expect(results.length).toBe(2);
    // id2 has recent last_recalled (high freshness), id1 has old last_recalled (low freshness)
    // With similar FTS rank, id2 should score higher due to freshness
    expect(results[0].id).toBe(id2);
    expect(results[1].id).toBe(id1);
  });

  it('updates recall metadata on returned memories', () => {
    const id = writeMemory(db, tmpDir, {
      content: 'Always validate user input on the server side.',
      scope: 'core',
      tags: ['security'],
      slug: 'input-validation',
    });

    // Verify initial state
    const before = db.prepare('SELECT * FROM memory_index WHERE id = ?').get(id) as any;
    expect(before.recall_count).toBe(0);

    const beforeRecall = new Date().toISOString();
    recallMemories(db, tmpDir, 'validate input');
    const afterRecall = new Date().toISOString();

    const after = db.prepare('SELECT * FROM memory_index WHERE id = ?').get(id) as any;
    expect(after.recall_count).toBe(1);
    expect(after.last_recalled >= beforeRecall).toBe(true);
    expect(after.last_recalled <= afterRecall).toBe(true);
    expect(after.freshness).toBeCloseTo(1.0);
  });

  it('scopes to core and current project by default', () => {
    writeMemory(db, tmpDir, {
      content: 'Core memory about coding standards.',
      scope: 'core',
      tags: ['standards'],
      slug: 'core-standards',
    });
    writeMemory(db, tmpDir, {
      content: 'Project alpha uses coding standards too.',
      scope: 'project',
      tags: ['standards'],
      slug: 'alpha-standards',
      project: 'alpha',
      projectDir: tmpDir,
    });
    writeMemory(db, tmpDir, {
      content: 'Project beta coding standards differ.',
      scope: 'project',
      tags: ['standards'],
      slug: 'beta-standards',
      project: 'beta',
      projectDir: tmpDir,
    });

    const results = recallMemories(db, tmpDir, 'standards', {
      currentProject: 'alpha',
    });

    const ids = results.map((r) => r.id);
    // Should include core and alpha, but not beta
    expect(ids.some((id) => id.includes('core-standards'))).toBe(true);
    expect(ids.some((id) => id.includes('alpha-standards'))).toBe(true);
    expect(ids.some((id) => id.includes('beta-standards'))).toBe(false);
  });

  it('returns all scopes with crossProject option', () => {
    writeMemory(db, tmpDir, {
      content: 'Core memory about testing patterns.',
      scope: 'core',
      tags: ['testing'],
      slug: 'core-testing',
    });
    writeMemory(db, tmpDir, {
      content: 'Project alpha testing patterns.',
      scope: 'project',
      tags: ['testing'],
      slug: 'alpha-testing',
      project: 'alpha',
      projectDir: tmpDir,
    });
    writeMemory(db, tmpDir, {
      content: 'Project beta testing patterns.',
      scope: 'project',
      tags: ['testing'],
      slug: 'beta-testing',
      project: 'beta',
      projectDir: tmpDir,
    });

    const results = recallMemories(db, tmpDir, 'testing', {
      crossProject: true,
      currentProject: 'alpha',
    });

    expect(results.length).toBe(3);
    const ids = results.map((r) => r.id);
    expect(ids.some((id) => id.includes('core-testing'))).toBe(true);
    expect(ids.some((id) => id.includes('alpha-testing'))).toBe(true);
    expect(ids.some((id) => id.includes('beta-testing'))).toBe(true);
  });

  it('returns empty array when no matches', () => {
    writeMemory(db, tmpDir, {
      content: 'Some content about databases.',
      scope: 'core',
      tags: ['database'],
      slug: 'db-content',
    });

    const results = recallMemories(db, tmpDir, 'zyxwvutsrqponm');
    expect(results).toEqual([]);
  });

  it('falls back to archive when few results', () => {
    // Write a memory, then manually archive it
    const id = writeMemory(db, tmpDir, {
      content: 'Archived lesson about caching strategies.',
      scope: 'core',
      tags: ['caching', 'performance'],
      slug: 'caching-strategies',
    });

    // Get the current file path
    const row = db.prepare('SELECT file_path FROM memory_index WHERE id = ?').get(id) as any;
    const oldPath = row.file_path;

    // Move file to archive directory
    const archiveDir = join(dirname(oldPath), '..', 'archive');
    mkdirSync(archiveDir, { recursive: true });
    const newPath = join(archiveDir, `${id}.md`);
    renameSync(oldPath, newPath);

    // Update file_path in memory_index
    db.prepare('UPDATE memory_index SET file_path = ? WHERE id = ?').run(newPath, id);

    // Remove from memory_fts (simulating gc)
    db.prepare('DELETE FROM memory_fts WHERE id = ?').run(id);

    // Recall — should find it through archive fallback since no FTS results
    const results = recallMemories(db, tmpDir, 'caching');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const archivedResult = results.find((r) => r.id === id);
    expect(archivedResult).toBeDefined();
    expect(archivedResult!.content).toContain('caching strategies');
  });
});

describe('listMemories', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-list-'));
    initCortexDir(tmpDir);
    db = initDatabase(join(tmpDir, '.cortex', 'cortex.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists all non-archived memories sorted by created_at DESC', () => {
    const id1 = writeMemory(db, tmpDir, {
      content: 'First memory.',
      scope: 'core',
      tags: ['alpha'],
      slug: 'first',
    });
    // Small delay so timestamps differ
    db.prepare('UPDATE memory_index SET created_at = ? WHERE id = ?').run(
      new Date(Date.now() - 2000).toISOString(),
      id1,
    );

    const id2 = writeMemory(db, tmpDir, {
      content: 'Second memory.',
      scope: 'core',
      tags: ['beta'],
      slug: 'second',
    });

    const results = listMemories(db);
    expect(results.length).toBe(2);
    // id2 has a later created_at, so it should come first
    expect(results[0].id).toBe(id2);
    expect(results[1].id).toBe(id1);
  });

  it('filters by scope', () => {
    writeMemory(db, tmpDir, {
      content: 'Core memory.',
      scope: 'core',
      tags: ['core'],
      slug: 'core-mem',
    });
    writeMemory(db, tmpDir, {
      content: 'Project memory.',
      scope: 'project',
      tags: ['proj'],
      slug: 'proj-mem',
      project: 'myproject',
      projectDir: tmpDir,
    });

    const coreOnly = listMemories(db, { scope: 'core' });
    expect(coreOnly.length).toBe(1);
    expect(coreOnly[0].scope).toBe('core');

    const projOnly = listMemories(db, { scope: 'project' });
    expect(projOnly.length).toBe(1);
    expect(projOnly[0].scope).toBe('project');
  });

  it('excludes archived by default', () => {
    const id = writeMemory(db, tmpDir, {
      content: 'Will be archived.',
      scope: 'core',
      tags: ['archive-me'],
      slug: 'archive-me',
    });

    // Move the file_path to an archive path in the DB
    const archivePath = join(tmpDir, '.cortex', 'memory', 'archive', `${id}.md`);
    db.prepare('UPDATE memory_index SET file_path = ? WHERE id = ?').run(archivePath, id);

    // Write another non-archived memory
    writeMemory(db, tmpDir, {
      content: 'Active memory.',
      scope: 'core',
      tags: ['active'],
      slug: 'active-mem',
    });

    const results = listMemories(db);
    expect(results.length).toBe(1);
    expect(results[0].id).not.toBe(id);
  });

  it('includes archived when option set', () => {
    const id = writeMemory(db, tmpDir, {
      content: 'Archived memory.',
      scope: 'core',
      tags: ['old'],
      slug: 'archived-mem',
    });

    const archivePath = join(tmpDir, '.cortex', 'memory', 'archive', `${id}.md`);
    db.prepare('UPDATE memory_index SET file_path = ? WHERE id = ?').run(archivePath, id);

    writeMemory(db, tmpDir, {
      content: 'Active memory.',
      scope: 'core',
      tags: ['active'],
      slug: 'active-mem',
    });

    const results = listMemories(db, { archived: true });
    expect(results.length).toBe(2);
    const ids = results.map((r) => r.id);
    expect(ids).toContain(id);
  });

  it('returns empty array when no memories', () => {
    const results = listMemories(db);
    expect(results).toEqual([]);
  });

  it('filters by project', () => {
    writeMemory(db, tmpDir, {
      content: 'Alpha project memory.',
      scope: 'project',
      tags: ['alpha'],
      slug: 'alpha-mem',
      project: 'alpha',
      projectDir: tmpDir,
    });
    writeMemory(db, tmpDir, {
      content: 'Beta project memory.',
      scope: 'project',
      tags: ['beta'],
      slug: 'beta-mem',
      project: 'beta',
      projectDir: tmpDir,
    });

    const alphaResults = listMemories(db, { project: 'alpha' });
    expect(alphaResults.length).toBe(1);
    expect(alphaResults[0].project).toBe('alpha');
  });

  it('returns freshness computed live for each row', () => {
    const id = writeMemory(db, tmpDir, {
      content: 'Freshness check memory.',
      scope: 'core',
      tags: ['freshness'],
      slug: 'freshness-check',
    });

    // Set last_recalled to 100 hours ago to get a decayed freshness
    const oldDate = new Date(Date.now() - 100 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE memory_index SET last_recalled = ? WHERE id = ?').run(oldDate, id);

    const results = listMemories(db);
    expect(results.length).toBe(1);
    // freshness should be decayed below 1.0
    expect(results[0].freshness).toBeLessThan(1.0);
    expect(results[0].freshness).toBeGreaterThan(0);
  });

  it('parses tags from JSON string', () => {
    writeMemory(db, tmpDir, {
      content: 'Tagged memory.',
      scope: 'core',
      tags: ['tag1', 'tag2', 'tag3'],
      slug: 'tagged-mem',
    });

    const results = listMemories(db);
    expect(results.length).toBe(1);
    expect(results[0].tags).toEqual(['tag1', 'tag2', 'tag3']);
  });
});

describe('gcMemories', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-gc-'));
    initCortexDir(tmpDir);
    db = initDatabase(join(tmpDir, '.cortex', 'cortex.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('archives memories below freshness threshold', () => {
    const id = writeMemory(db, tmpDir, {
      content: 'Stale memory to be archived.',
      scope: 'core',
      tags: ['stale'],
      slug: 'stale-mem',
    });

    // Set last_recalled to 2 years ago (freshness ~0.506 with k=0.1)
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE memory_index SET last_recalled = ? WHERE id = ?').run(twoYearsAgo, id);

    // Use threshold=0.6 so the memory (freshness ~0.506) gets archived
    const count = gcMemories(db, tmpDir, { threshold: 0.6 });

    // Verify file moved to archive/
    const archivePath = join(tmpDir, '.cortex', 'memory', 'archive', `${id}.md`);
    expect(existsSync(archivePath)).toBe(true);

    // Verify original path no longer exists
    const originalPath = join(tmpDir, '.cortex', 'memory', 'core', `${id}.md`);
    expect(existsSync(originalPath)).toBe(false);

    // Verify memory_index file_path updated
    const row = db.prepare('SELECT file_path FROM memory_index WHERE id = ?').get(id) as any;
    expect(row.file_path).toBe(archivePath);

    // Verify memory_fts row removed
    const ftsRow = db.prepare('SELECT * FROM memory_fts WHERE id = ?').get(id);
    expect(ftsRow).toBeUndefined();

    expect(count).toBe(1);
  });

  it('preserves fresh memories', () => {
    const id = writeMemory(db, tmpDir, {
      content: 'Fresh memory that should stay.',
      scope: 'core',
      tags: ['fresh'],
      slug: 'fresh-mem',
    });

    const count = gcMemories(db, tmpDir);
    expect(count).toBe(0);

    // File should still be at original location
    const originalPath = join(tmpDir, '.cortex', 'memory', 'core', `${id}.md`);
    expect(existsSync(originalPath)).toBe(true);

    // FTS row should still exist
    const ftsRow = db.prepare('SELECT * FROM memory_fts WHERE id = ?').get(id);
    expect(ftsRow).toBeDefined();
  });

  it('returns count of archived memories', () => {
    // Create 3 memories, make 2 stale
    const id1 = writeMemory(db, tmpDir, {
      content: 'Stale memory one.',
      scope: 'core',
      tags: ['stale'],
      slug: 'stale-one',
    });
    const id2 = writeMemory(db, tmpDir, {
      content: 'Stale memory two.',
      scope: 'core',
      tags: ['stale'],
      slug: 'stale-two',
    });
    writeMemory(db, tmpDir, {
      content: 'Fresh memory three.',
      scope: 'core',
      tags: ['fresh'],
      slug: 'fresh-three',
    });

    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE memory_index SET last_recalled = ? WHERE id = ?').run(twoYearsAgo, id1);
    db.prepare('UPDATE memory_index SET last_recalled = ? WHERE id = ?').run(twoYearsAgo, id2);

    // Use threshold=0.6 so stale memories (freshness ~0.506) get archived
    const count = gcMemories(db, tmpDir, { threshold: 0.6 });
    expect(count).toBe(2);
  });

  it('does not touch already-archived memories', () => {
    const id = writeMemory(db, tmpDir, {
      content: 'Already archived memory.',
      scope: 'core',
      tags: ['archived'],
      slug: 'already-archived',
    });

    // Manually archive this memory
    const row = db.prepare('SELECT file_path FROM memory_index WHERE id = ?').get(id) as any;
    const oldPath = row.file_path;
    const archiveDir = join(tmpDir, '.cortex', 'memory', 'archive');
    mkdirSync(archiveDir, { recursive: true });
    const archivePath = join(archiveDir, `${id}.md`);
    renameSync(oldPath, archivePath);
    db.prepare('UPDATE memory_index SET file_path = ? WHERE id = ?').run(archivePath, id);
    db.prepare('DELETE FROM memory_fts WHERE id = ?').run(id);

    // Set last_recalled to very old date
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE memory_index SET last_recalled = ? WHERE id = ?').run(twoYearsAgo, id);

    const count = gcMemories(db, tmpDir, { threshold: 0.6 });
    expect(count).toBe(0);

    // File should still be at archive path
    expect(existsSync(archivePath)).toBe(true);
  });

  it('respects custom threshold', () => {
    const id = writeMemory(db, tmpDir, {
      content: 'Memory with custom threshold check.',
      scope: 'core',
      tags: ['threshold'],
      slug: 'threshold-mem',
    });

    // Set last_recalled to 2 years ago (freshness ~0.506 with k=0.1)
    const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('UPDATE memory_index SET last_recalled = ? WHERE id = ?').run(twoYearsAgo, id);

    // With threshold=0.4, freshness ~0.506 is above threshold, so NOT archived
    const count1 = gcMemories(db, tmpDir, { threshold: 0.4 });
    expect(count1).toBe(0);

    // With threshold=0.6, freshness ~0.506 is below threshold, so SHOULD be archived
    const count2 = gcMemories(db, tmpDir, { threshold: 0.6 });
    expect(count2).toBe(1);

    const archivePath = join(tmpDir, '.cortex', 'memory', 'archive', `${id}.md`);
    expect(existsSync(archivePath)).toBe(true);
  });

  it('archives project-scoped memories to project archive dir', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'cortex-proj-gc-'));

    try {
      const id = writeMemory(db, tmpDir, {
        content: 'Project memory to be archived.',
        scope: 'project',
        tags: ['project', 'stale'],
        slug: 'proj-stale',
        project: 'my-project',
        projectDir,
      });

      // Set last_recalled to 2 years ago (freshness ~0.506)
      const twoYearsAgo = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare('UPDATE memory_index SET last_recalled = ? WHERE id = ?').run(twoYearsAgo, id);

      // Use threshold=0.6 so the stale memory gets archived
      const count = gcMemories(db, tmpDir, { threshold: 0.6 });
      expect(count).toBe(1);

      // Verify file moved to <projectDir>/.cortex/memory/archive/<id>.md
      const archivePath = join(projectDir, '.cortex', 'memory', 'archive', `${id}.md`);
      expect(existsSync(archivePath)).toBe(true);

      // Verify original path no longer exists
      const originalPath = join(projectDir, '.cortex', 'memory', `${id}.md`);
      expect(existsSync(originalPath)).toBe(false);

      // Verify memory_index file_path updated
      const row = db.prepare('SELECT file_path FROM memory_index WHERE id = ?').get(id) as any;
      expect(row.file_path).toBe(archivePath);

      // Verify memory_fts row removed
      const ftsRow = db.prepare('SELECT * FROM memory_fts WHERE id = ?').get(id);
      expect(ftsRow).toBeUndefined();
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });
});
