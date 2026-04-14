import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createProgram } from '../../src/cli/program.js';

describe('Phase 3 integration test', () => {
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

  it('full skill lifecycle: create → list → match → update → verify', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-phase3-'));

    // ---------------------------------------------------------------
    // 1. cortex init
    // ---------------------------------------------------------------
    await runSilent(['init']);

    // ---------------------------------------------------------------
    // 2. Create a hard skill (run-tests)
    // ---------------------------------------------------------------
    const createHardOutput = await run([
      'skill', 'create',
      '--type', 'hard',
      '--id', 'run-tests',
      '--triggers', 'test,CI',
      '--content', '---\ntype: hard\ntriggers: ["run tests", "CI"]\n---\n\n## Run Tests\n\nRun pnpm test:unit for unit tests.',
    ]);
    expect(createHardOutput.some((line) => line.includes('run-tests'))).toBe(true);

    // ---------------------------------------------------------------
    // 3. Create a soft skill (code-review)
    // ---------------------------------------------------------------
    const createSoftOutput = await run([
      'skill', 'create',
      '--type', 'soft',
      '--id', 'code-review',
      '--domain', 'review,quality',
      '--abstraction', 'high',
      '--content', '---\ntype: soft\ndomain: [review, quality]\nabstraction: high\n---\n\n## Code Review\n\nLook for clarity, correctness, and maintainability.',
    ]);
    expect(createSoftOutput.some((line) => line.includes('code-review'))).toBe(true);

    // ---------------------------------------------------------------
    // 4. cortex skill list — verify both skills appear
    //    (bootstrap skill "cortex" may also appear)
    // ---------------------------------------------------------------
    const listAllOutput = await run(['skill', 'list']);
    expect(listAllOutput.some((line) => line.includes('run-tests'))).toBe(true);
    expect(listAllOutput.some((line) => line.includes('code-review'))).toBe(true);

    // ---------------------------------------------------------------
    // 5. cortex skill list --type hard — verify only hard skill
    // ---------------------------------------------------------------
    const listHardOutput = await run(['skill', 'list', '--type', 'hard']);
    expect(listHardOutput.some((line) => line.includes('run-tests'))).toBe(true);
    expect(listHardOutput.some((line) => line.includes('code-review'))).toBe(false);

    // ---------------------------------------------------------------
    // 6. cortex skill match --situation "run tests" — verify hard skill matched
    // ---------------------------------------------------------------
    const matchHardOutput = await run(['skill', 'match', '--situation', 'run tests']);
    expect(matchHardOutput.some((line) => line.includes('run-tests'))).toBe(true);

    // ---------------------------------------------------------------
    // 7. cortex skill match --situation "code review quality" — verify soft skill matched
    // ---------------------------------------------------------------
    const matchSoftOutput = await run(['skill', 'match', '--situation', 'code review quality']);
    expect(matchSoftOutput.some((line) => line.includes('code-review'))).toBe(true);

    // ---------------------------------------------------------------
    // 8. cortex skill update run-tests — update hard skill content
    // ---------------------------------------------------------------
    const updateOutput = await run([
      'skill', 'update', 'run-tests',
      '--content', 'Updated: Run pnpm test:unit then test:e2e.',
    ]);
    expect(updateOutput.some((line) => line.includes('run-tests'))).toBe(true);

    // ---------------------------------------------------------------
    // 9. Verify updated content on disk (read the file directly)
    // ---------------------------------------------------------------
    const skillFilePath = join(tmpDir, '.cortex', 'skills', 'hard', 'run-tests.md');
    const updatedContent = readFileSync(skillFilePath, 'utf-8');
    expect(updatedContent).toBe('Updated: Run pnpm test:unit then test:e2e.');

    // ---------------------------------------------------------------
    // 10. cortex skill list — verify updated_at changed
    //     (run-tests should appear first since it was most recently updated)
    // ---------------------------------------------------------------
    const listAfterUpdate = await run(['skill', 'list']);
    // Find the line containing run-tests — it should come before code-review
    // since listSkills sorts by updated_at DESC
    const runTestsIdx = listAfterUpdate.findIndex((line) => line.includes('run-tests'));
    const codeReviewIdx = listAfterUpdate.findIndex((line) => line.includes('code-review'));
    expect(runTestsIdx).toBeGreaterThanOrEqual(0);
    expect(codeReviewIdx).toBeGreaterThanOrEqual(0);
    expect(runTestsIdx).toBeLessThan(codeReviewIdx);
  });
});
