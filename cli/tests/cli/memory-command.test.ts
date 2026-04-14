import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createProgram } from '../../src/cli/program.js';

describe('memory command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-memory-cmd-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Helper: run `cortex init --home <tmpDir>` to bootstrap the database. */
  async function initCortex(): Promise<void> {
    const program = createProgram();
    await program.parseAsync(['node', 'cortex', 'init', '--home', tmpDir]);
  }

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

  it('registers memory as a subcommand with recall, write, list, gc', () => {
    const program = createProgram();
    const memoryCmd = program.commands.find((c) => c.name() === 'memory');
    expect(memoryCmd).toBeDefined();
    const subNames = memoryCmd!.commands.map((c) => c.name()).sort();
    expect(subNames).toEqual(['gc', 'list', 'recall', 'write']);
  });

  it('memory write creates a memory file', async () => {
    await initCortex();

    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'memory', 'write',
        '--scope', 'core',
        '--tags', 'test,demo',
        '--slug', 'hello-world',
        '--content', 'This is a test memory.',
        '--home', tmpDir,
      ]);
    });

    // Should print the generated memory id
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]).toContain('hello-world');
  });

  it('memory recall returns matching memories', async () => {
    await initCortex();

    // First write a memory
    const p1 = createProgram();
    await p1.parseAsync([
      'node', 'cortex', 'memory', 'write',
      '--scope', 'core',
      '--tags', 'search,test',
      '--slug', 'recall-target',
      '--content', 'The quick brown fox jumps over the lazy dog.',
      '--home', tmpDir,
    ]);

    // Then recall it
    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'memory', 'recall', 'fox',
        '--home', tmpDir,
      ]);
    });

    const output = logs.join('\n');
    expect(output).toContain('recall-target');
  });

  it('memory recall prints message when no results', async () => {
    await initCortex();

    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'memory', 'recall', 'nonexistenttermxyz',
        '--home', tmpDir,
      ]);
    });

    expect(logs.some((line) => /no memories found/i.test(line))).toBe(true);
  });

  it('memory list shows memories', async () => {
    await initCortex();

    // Write a memory first
    const p1 = createProgram();
    await p1.parseAsync([
      'node', 'cortex', 'memory', 'write',
      '--scope', 'core',
      '--tags', 'list,test',
      '--slug', 'list-test',
      '--content', 'A memory to list.',
      '--home', tmpDir,
    ]);

    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'memory', 'list',
        '--home', tmpDir,
      ]);
    });

    const output = logs.join('\n');
    expect(output).toContain('list-test');
  });

  it('memory list prints message when empty', async () => {
    await initCortex();

    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'memory', 'list',
        '--home', tmpDir,
      ]);
    });

    expect(logs.some((line) => /no memories found/i.test(line))).toBe(true);
  });

  it('memory gc reports archived count', async () => {
    await initCortex();

    // With no memories, gc should report nothing to archive
    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'memory', 'gc',
        '--home', tmpDir,
      ]);
    });

    expect(logs.some((line) => /no memories to archive/i.test(line))).toBe(true);
  });
});
