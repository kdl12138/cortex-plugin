import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createProgram } from '../../src/cli/program.js';

describe('Phase 4 integration test', () => {
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

  it('full growth lifecycle: log → report → multi-day report', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-phase4-'));

    // ---------------------------------------------------------------
    // 1. cortex init
    // ---------------------------------------------------------------
    await runSilent(['init']);

    // ---------------------------------------------------------------
    // 2. Log first reflection
    // ---------------------------------------------------------------
    const logOutput1 = await run([
      'growth', 'log',
      '--content', 'First reflection: learned about FTS5 tokenizers',
    ]);
    const dateStr = new Date().toISOString().slice(0, 10);
    expect(logOutput1.some((line) => line.includes(dateStr))).toBe(true);

    // ---------------------------------------------------------------
    // 3. Log second reflection same day
    // ---------------------------------------------------------------
    const logOutput2 = await run([
      'growth', 'log',
      '--content', 'Second reflection: team size matters for architecture',
    ]);
    expect(logOutput2.some((line) => line.includes(dateStr))).toBe(true);

    // ---------------------------------------------------------------
    // 4. Verify daily log file exists with both entries
    // ---------------------------------------------------------------
    const growthDir = join(tmpDir, '.cortex', 'growth');
    const files = readdirSync(growthDir);
    expect(files).toContain(`${dateStr}.log`);

    const { readFileSync } = await import('fs');
    const logContent = readFileSync(join(growthDir, `${dateStr}.log`), 'utf-8');
    expect(logContent).toContain('First reflection: learned about FTS5 tokenizers');
    expect(logContent).toContain('Second reflection: team size matters for architecture');

    // ---------------------------------------------------------------
    // 5. cortex growth report --days 7 — verify both entries appear
    // ---------------------------------------------------------------
    const report7Output = await run(['growth', 'report', '--days', '7']);
    const report7 = report7Output.join('\n');
    expect(report7).toContain('First reflection: learned about FTS5 tokenizers');
    expect(report7).toContain('Second reflection: team size matters for architecture');

    // ---------------------------------------------------------------
    // 6. Create a log file for 2 days ago manually
    // ---------------------------------------------------------------
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = twoDaysAgo.toISOString().slice(0, 10);

    mkdirSync(growthDir, { recursive: true });
    const pastLogFile = join(growthDir, `${twoDaysAgoStr}.log`);
    writeFileSync(
      pastLogFile,
      `\n[${twoDaysAgo.toISOString()}]\nPast reflection: distributed systems tradeoffs\n`,
      'utf-8',
    );

    // ---------------------------------------------------------------
    // 7. cortex growth report --days 7 — verify both days appear
    // ---------------------------------------------------------------
    const report7WithPastOutput = await run(['growth', 'report', '--days', '7']);
    const report7WithPast = report7WithPastOutput.join('\n');
    expect(report7WithPast).toContain(dateStr);
    expect(report7WithPast).toContain(twoDaysAgoStr);
    expect(report7WithPast).toContain('First reflection: learned about FTS5 tokenizers');
    expect(report7WithPast).toContain('Past reflection: distributed systems tradeoffs');

    // ---------------------------------------------------------------
    // 8. cortex growth report --days 1 — verify only today's log appears
    // ---------------------------------------------------------------
    const report1Output = await run(['growth', 'report', '--days', '1']);
    const report1 = report1Output.join('\n');
    expect(report1).toContain(dateStr);
    expect(report1).toContain('First reflection: learned about FTS5 tokenizers');
    expect(report1).not.toContain(twoDaysAgoStr);
    expect(report1).not.toContain('Past reflection: distributed systems tradeoffs');
  });
});
