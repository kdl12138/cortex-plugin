import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { createProgram } from '../../src/cli/program.js';

describe('Phase 1 integration test', () => {
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

  it('full lifecycle: init → soul → project → link', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-integration-'));

    // ---------------------------------------------------------------
    // 1. cortex init
    // ---------------------------------------------------------------
    await runSilent(['init']);

    const cortexDir = join(tmpDir, '.cortex');
    expect(existsSync(cortexDir)).toBe(true);
    expect(existsSync(join(cortexDir, 'cortex.db'))).toBe(true);
    expect(existsSync(join(cortexDir, 'soul.yaml'))).toBe(true);
    expect(existsSync(join(cortexDir, 'memory'))).toBe(true);
    expect(existsSync(join(cortexDir, 'skills'))).toBe(true);

    // ---------------------------------------------------------------
    // 2. Verify all 6 database tables exist (Phase 1, 2, and 3)
    // ---------------------------------------------------------------
    const dbPath = join(cortexDir, 'cortex.db');
    const db = new Database(dbPath);
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map((row: any) => row.name);
    db.close();

    const expectedTables = [
      'memory_fts',
      'memory_index',
      'project_dirs',
      'projects',
      'skill_fts',
      'skill_index',
    ];

    for (const table of expectedTables) {
      expect(tables, `expected table "${table}" to exist`).toContain(table);
    }

    // ---------------------------------------------------------------
    // 3. Verify bootstrap skill installed
    // ---------------------------------------------------------------
    const skillFile = join(tmpDir, '.claude', 'skills', 'cortex.md');
    expect(existsSync(skillFile)).toBe(true);

    const skillContent = readFileSync(skillFile, 'utf-8');
    expect(skillContent).toContain('cortex');

    // ---------------------------------------------------------------
    // 4. cortex soul show
    // ---------------------------------------------------------------
    const soulShowOutput = await run(['soul', 'show']);
    expect(soulShowOutput.some((line) => line.includes('identity'))).toBe(true);

    // ---------------------------------------------------------------
    // 5. cortex soul edit
    // ---------------------------------------------------------------
    const newSoulContent = 'name: "integration-test"\nrole: "tester"\n';
    await runSilent(['soul', 'edit', '--content', newSoulContent]);

    const soulShowAfterEdit = await run(['soul', 'show']);
    expect(
      soulShowAfterEdit.some((line) => line.includes('integration-test')),
    ).toBe(true);

    // Verify on disk
    const soulFile = join(cortexDir, 'soul.yaml');
    expect(readFileSync(soulFile, 'utf-8')).toBe(newSoulContent);

    // ---------------------------------------------------------------
    // 6. cortex project create
    // ---------------------------------------------------------------
    const createOutput = await run(['project', 'create', 'test-project', '--desc', 'Integration test project']);
    expect(createOutput.some((line) => line.includes('test-project'))).toBe(true);

    // ---------------------------------------------------------------
    // 7. cortex project list — should contain the project we created
    // ---------------------------------------------------------------
    const listOutput = await run(['project', 'list']);
    expect(listOutput.some((line) => line.includes('test-project'))).toBe(true);

    // ---------------------------------------------------------------
    // 8. cortex project switch
    // ---------------------------------------------------------------
    const switchOutput = await run(['project', 'switch', 'test-project']);
    expect(switchOutput.some((line) => line.includes('test-project'))).toBe(true);

    // ---------------------------------------------------------------
    // 9. cortex project current — should show the project we switched to
    // ---------------------------------------------------------------
    const currentOutput = await run(['project', 'current']);
    expect(currentOutput.some((line) => line.includes('test-project'))).toBe(true);

    // ---------------------------------------------------------------
    // 10. cortex project link
    // ---------------------------------------------------------------
    const linkDir = join(tmpDir, 'linked-project-dir');
    const linkOutput = await run(['project', 'link', linkDir, 'test-project']);
    expect(linkOutput.some((line) => line.includes('test-project'))).toBe(true);
    expect(linkOutput.some((line) => line.includes(linkDir))).toBe(true);
  });

  it('build produces dist/main.js with shebang', () => {
    const projectRoot = join(dirname(new URL(import.meta.url).pathname), '..', '..');
    const distMain = join(projectRoot, 'dist', 'main.js');
    expect(existsSync(distMain)).toBe(true);

    const firstLine = readFileSync(distMain, 'utf-8').split('\n')[0];
    expect(firstLine).toBe('#!/usr/bin/env node');
  });
});
