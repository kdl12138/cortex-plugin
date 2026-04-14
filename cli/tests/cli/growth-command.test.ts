import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createProgram } from '../../src/cli/program.js';

describe('growth command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-growth-cmd-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
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

  it('registers growth as a subcommand with log and report', () => {
    const program = createProgram();
    const growthCmd = program.commands.find((c) => c.name() === 'growth');
    expect(growthCmd).toBeDefined();
    const subNames = growthCmd!.commands.map((c) => c.name()).sort();
    expect(subNames).toEqual(['log', 'report']);
  });

  it('growth log appends to daily log file', async () => {
    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'growth', 'log',
        '--content', 'Learned about TypeScript generics today.',
        '--home', tmpDir,
      ]);
    });

    const output = logs.join('\n');
    // Should print confirmation with today's date
    const today = new Date().toISOString().slice(0, 10);
    expect(output).toContain(today);
    expect(output).toMatch(/Growth logged/i);
  });

  it('growth report prints recent logs', async () => {
    // First log something
    const p1 = createProgram();
    await p1.parseAsync([
      'node', 'cortex', 'growth', 'log',
      '--content', 'Studied design patterns.',
      '--home', tmpDir,
    ]);

    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'growth', 'report',
        '--days', '7',
        '--home', tmpDir,
      ]);
    });

    const output = logs.join('\n');
    expect(output).toContain('Studied design patterns.');
  });

  it('growth report shows message when empty', async () => {
    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'growth', 'report',
        '--days', '7',
        '--home', tmpDir,
      ]);
    });

    const output = logs.join('\n');
    expect(output).toMatch(/No growth logs found for the last 7 days/i);
  });
});
