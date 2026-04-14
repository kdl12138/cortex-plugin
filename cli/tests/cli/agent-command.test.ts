import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createProgram } from '../../src/cli/program.js';
import { initCortexDir } from '../../src/core/init.js';
import { initDatabase } from '../../src/db/database.js';
import { createPlaybook } from '../../src/core/agent.js';

const STRUCTURED_PLAYBOOK = `
name: code-review
description: A code review playbook
roles:
  reviewer:
    perspective: Review the code for quality.
flow:
  - role: reviewer
    task: "Review the PR"
    output: "Review comments"
`.trimStart();

const OPEN_ENDED_PLAYBOOK = `
name: debug
description: A debugging playbook
roles:
  investigator:
    perspective: Find the root cause.
strategy: |
  Explore freely, form hypotheses.
`.trimStart();

describe('agent command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-agent-cmd-'));
    initCortexDir(tmpDir);
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

  it('registers agent as a subcommand with run, update, list', () => {
    const program = createProgram();
    const agentCmd = program.commands.find((c) => c.name() === 'agent');
    expect(agentCmd).toBeDefined();
    const subNames = agentCmd!.commands.map((c) => c.name()).sort();
    expect(subNames).toEqual(['list', 'run', 'update']);
  });

  it('agent list shows playbooks', async () => {
    createPlaybook(tmpDir, 'code-review', STRUCTURED_PLAYBOOK);
    createPlaybook(tmpDir, 'debug', OPEN_ENDED_PLAYBOOK);

    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'agent', 'list',
        '--home', tmpDir,
      ]);
    });

    const output = logs.join('\n');
    expect(output).toContain('code-review');
    expect(output).toContain('A code review playbook');
    expect(output).toContain('[structured]');
    expect(output).toContain('debug');
    expect(output).toContain('A debugging playbook');
    expect(output).toContain('[open-ended]');
  });

  it('agent run outputs JSON execution plan', async () => {
    await initCortex();
    createPlaybook(tmpDir, 'code-review', STRUCTURED_PLAYBOOK);

    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'agent', 'run', 'code-review',
        '--task', 'Review PR #42',
        '--home', tmpDir,
      ]);
    });

    const output = logs.join('\n');
    const plan = JSON.parse(output);
    expect(plan.playbook).toBe('code-review');
    expect(plan.task).toBe('Review PR #42');
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0].role).toBe('reviewer');
  });

  it('agent update replaces playbook content', async () => {
    createPlaybook(tmpDir, 'code-review', STRUCTURED_PLAYBOOK);

    const updatedContent = `
name: code-review
description: Updated review playbook
roles:
  reviewer:
    perspective: Thoroughly review code.
`.trimStart();

    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'agent', 'update', 'code-review',
        '--content', updatedContent,
        '--home', tmpDir,
      ]);
    });

    const output = logs.join('\n');
    expect(output).toContain('Playbook updated: code-review');

    // Verify file content changed
    const filePath = join(tmpDir, '.cortex', 'playbooks', 'code-review.yaml');
    const diskContent = readFileSync(filePath, 'utf-8');
    expect(diskContent).toBe(updatedContent);
  });

  it('agent list shows empty message when no playbooks', async () => {
    const logs = await captureLog(async () => {
      const program = createProgram();
      await program.parseAsync([
        'node', 'cortex', 'agent', 'list',
        '--home', tmpDir,
      ]);
    });

    expect(logs.some((line) => /No playbooks found/i.test(line))).toBe(true);
  });
});
