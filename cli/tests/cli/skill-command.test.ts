import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createProgram } from '../../src/cli/program.js';

describe('skill command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-skill-cmd-'));
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

  it('registers skill subcommand with match, create, update, list', () => {
    const program = createProgram();
    const skillCmd = program.commands.find((c) => c.name() === 'skill');
    expect(skillCmd).toBeDefined();
    const subNames = skillCmd!.commands.map((c) => c.name()).sort();
    expect(subNames).toEqual(['create', 'list', 'match', 'update']);
  });

  it('skill create creates a hard skill', async () => {
    await initCortex();

    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'skill', 'create',
        '--type', 'hard',
        '--id', 'deploy-check',
        '--triggers', 'deploy,release',
        '--content', 'Always run tests before deploying.',
        '--home', tmpDir,
      ]);
    });

    expect(logs.some((line) => /Skill created: deploy-check/i.test(line))).toBe(true);
  });

  it('skill match returns matching skills', async () => {
    await initCortex();

    // Create a hard skill first
    const p1 = createProgram();
    await p1.parseAsync([
      'node', 'cortex', 'skill', 'create',
      '--type', 'hard',
      '--id', 'test-runner',
      '--triggers', 'test,jest',
      '--content', 'Use jest for running unit tests in this project.',
      '--home', tmpDir,
    ]);

    // Match against a situation containing a trigger
    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'skill', 'match',
        '--situation', 'I need to run a test',
        '--home', tmpDir,
      ]);
    });

    const output = logs.join('\n');
    expect(output).toContain('test-runner');
  });

  it('skill match prints message when no results', async () => {
    await initCortex();

    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'skill', 'match',
        '--situation', 'completely unrelated platypus scenario',
        '--home', tmpDir,
      ]);
    });

    expect(logs.some((line) => /no matching skills found/i.test(line))).toBe(true);
  });

  it('skill list shows skills', async () => {
    await initCortex();

    // Create a skill first
    const p1 = createProgram();
    await p1.parseAsync([
      'node', 'cortex', 'skill', 'create',
      '--type', 'hard',
      '--id', 'list-test-skill',
      '--triggers', 'build',
      '--content', 'A skill for listing tests.',
      '--home', tmpDir,
    ]);

    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'skill', 'list',
        '--home', tmpDir,
      ]);
    });

    const output = logs.join('\n');
    expect(output).toContain('list-test-skill');
  });

  it('skill list prints message when empty', async () => {
    await initCortex();

    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'skill', 'list',
        '--home', tmpDir,
      ]);
    });

    expect(logs.some((line) => /no skills found/i.test(line))).toBe(true);
  });

  it('skill update modifies a skill', async () => {
    await initCortex();

    // Create a skill first
    const p1 = createProgram();
    await p1.parseAsync([
      'node', 'cortex', 'skill', 'create',
      '--type', 'hard',
      '--id', 'update-target',
      '--triggers', 'lint',
      '--content', 'Run linter before committing.',
      '--home', tmpDir,
    ]);

    // Update the skill
    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'skill', 'update', 'update-target',
        '--content', 'Run linter and formatter before committing.',
        '--triggers', 'lint,format',
        '--home', tmpDir,
      ]);
    });

    expect(logs.some((line) => /Skill updated: update-target/i.test(line))).toBe(true);

    // Verify by listing
    const listLogs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'skill', 'list',
        '--home', tmpDir,
      ]);
    });

    const listOutput = listLogs.join('\n');
    expect(listOutput).toContain('update-target');
  });
});
