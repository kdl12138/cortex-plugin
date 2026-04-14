import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createProgram } from '../../src/cli/program.js';

describe('Phase 2 integration test', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  /** Helper: capture console.log output during an async callback. */
  async function captureLog(fn: () => Promise<void>): Promise<string[]> {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      await fn();
    } finally {
      console.log = originalLog;
    }
    return logs;
  }

  /** Helper: run a cortex command and return captured output. */
  async function run(args: string[]): Promise<string[]> {
    return captureLog(async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'cortex', ...args, '--home', tmpDir]);
    });
  }

  /** Helper: run a cortex command silently (discard output). */
  async function runSilent(args: string[]): Promise<void> {
    await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'cortex', ...args, '--home', tmpDir]);
    });
  }

  it('full memory lifecycle: write → list → recall → gc → archive fallback', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-phase2-'));

    const cortexDir = join(tmpDir, '.cortex');
    const dbPath = join(cortexDir, 'cortex.db');

    // ---------------------------------------------------------------
    // 1. cortex init
    // ---------------------------------------------------------------
    await runSilent(['init']);

    // ---------------------------------------------------------------
    // 2. Write first core memory (sqlite)
    // ---------------------------------------------------------------
    const writeOutput1 = await run([
      'memory', 'write',
      '--scope', 'core',
      '--tags', 'sqlite,fts5',
      '--slug', 'test-sqlite',
      '--content', 'Learned about SQLite FTS5 tokenizers.',
    ]);
    expect(writeOutput1.length).toBe(1);
    const sqliteId = writeOutput1[0];
    expect(sqliteId).toContain('test-sqlite');

    // ---------------------------------------------------------------
    // 3. Write second core memory (react)
    // ---------------------------------------------------------------
    const writeOutput2 = await run([
      'memory', 'write',
      '--scope', 'core',
      '--tags', 'react,hooks',
      '--slug', 'test-react',
      '--content', 'React hooks must follow rules of hooks.',
    ]);
    expect(writeOutput2.length).toBe(1);
    const reactId = writeOutput2[0];
    expect(reactId).toContain('test-react');

    // ---------------------------------------------------------------
    // 4. cortex memory list — verify both memories appear
    // ---------------------------------------------------------------
    const listOutput = await run(['memory', 'list']);
    expect(listOutput.some((line) => line.includes('test-sqlite'))).toBe(true);
    expect(listOutput.some((line) => line.includes('test-react'))).toBe(true);

    // ---------------------------------------------------------------
    // 5. cortex memory recall sqlite — verify relevant memory returned
    // ---------------------------------------------------------------
    const recallSqlite = await run(['memory', 'recall', 'sqlite']);
    expect(recallSqlite.some((line) => line.includes('test-sqlite'))).toBe(true);
    // Should contain the content preview
    expect(recallSqlite.some((line) => line.includes('SQLite FTS5'))).toBe(true);

    // ---------------------------------------------------------------
    // 6. cortex memory recall --cross-project react — verify cross-project
    // ---------------------------------------------------------------
    const recallReact = await run(['memory', 'recall', '--cross-project', 'react']);
    expect(recallReact.some((line) => line.includes('test-react'))).toBe(true);
    expect(recallReact.some((line) => line.includes('hooks'))).toBe(true);

    // ---------------------------------------------------------------
    // 7. Verify recall updated recall_count and last_recalled in DB
    // ---------------------------------------------------------------
    const db = new Database(dbPath);
    try {
      const sqliteRow = db.prepare(
        'SELECT recall_count, last_recalled FROM memory_index WHERE id = ?'
      ).get(sqliteId) as { recall_count: number; last_recalled: string };
      expect(sqliteRow.recall_count).toBeGreaterThanOrEqual(1);
      expect(sqliteRow.last_recalled).toBeTruthy();

      const reactRow = db.prepare(
        'SELECT recall_count, last_recalled FROM memory_index WHERE id = ?'
      ).get(reactId) as { recall_count: number; last_recalled: string };
      expect(reactRow.recall_count).toBeGreaterThanOrEqual(1);
      expect(reactRow.last_recalled).toBeTruthy();
    } finally {
      db.close();
    }

    // ---------------------------------------------------------------
    // 8. cortex memory gc — verify no memories archived (all fresh)
    // ---------------------------------------------------------------
    const gcOutput1 = await run(['memory', 'gc']);
    expect(gcOutput1.some((line) => line.includes('No memories to archive.'))).toBe(true);

    // ---------------------------------------------------------------
    // 9. Manually set one memory's last_recalled to 3 years ago in DB
    //    With k=0.1, freshness after 3 years ~ 0.496, below threshold 0.5
    // ---------------------------------------------------------------
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    const db2 = new Database(dbPath);
    try {
      db2.prepare(
        'UPDATE memory_index SET last_recalled = ? WHERE id = ?'
      ).run(threeYearsAgo.toISOString(), sqliteId);
    } finally {
      db2.close();
    }

    // ---------------------------------------------------------------
    // 10. cortex memory gc --threshold 0.5 — verify one memory archived
    //     Freshness after 3 years is ~0.496, below 0.5
    // ---------------------------------------------------------------
    const gcOutput2 = await run(['memory', 'gc', '--threshold', '0.5']);
    expect(gcOutput2.some((line) => line.includes('Archived 1 memories.'))).toBe(true);

    // ---------------------------------------------------------------
    // 11. cortex memory list --archived — verify archived memory appears
    // ---------------------------------------------------------------
    const listArchived = await run(['memory', 'list', '--archived']);
    expect(listArchived.some((line) => line.includes('test-sqlite'))).toBe(true);

    // ---------------------------------------------------------------
    // 12. cortex memory recall sqlite — verify archive fallback works
    // ---------------------------------------------------------------
    const recallArchived = await run(['memory', 'recall', 'sqlite']);
    expect(recallArchived.some((line) => line.includes('test-sqlite'))).toBe(true);
    expect(recallArchived.some((line) => line.includes('SQLite FTS5'))).toBe(true);
  });
});
