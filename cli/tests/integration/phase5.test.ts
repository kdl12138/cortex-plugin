import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createProgram } from '../../src/cli/program.js';

describe('Phase 5 integration test', () => {
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

  it('full agent orchestration lifecycle', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-phase5-'));

    // ---------------------------------------------------------------
    // 1. cortex init
    // ---------------------------------------------------------------
    await runSilent(['init']);

    // ---------------------------------------------------------------
    // 2. Create a structured playbook YAML file
    // ---------------------------------------------------------------
    const structuredYaml = [
      'name: test-feature',
      'description: Test feature development',
      'roles:',
      '  designer:',
      '    perspective: Design the solution.',
      '    skills_hint: []',
      '  coder:',
      '    perspective: Implement the design.',
      '    skills_hint: []',
      'flow:',
      '  - role: designer',
      '    task: "Create design doc"',
      '    output: "Design document"',
      '  - role: coder',
      '    task: "Implement design"',
      '    output: "Working code"',
    ].join('\n') + '\n';

    const playbooksDir = join(tmpDir, '.cortex', 'playbooks');
    mkdirSync(playbooksDir, { recursive: true });
    writeFileSync(join(playbooksDir, 'test-feature.yaml'), structuredYaml, 'utf-8');

    // ---------------------------------------------------------------
    // 3. cortex agent list — verify "test-feature" appears and shows "structured"
    // ---------------------------------------------------------------
    const listOutput = await run(['agent', 'list']);
    const listText = listOutput.join('\n');
    expect(listText).toContain('test-feature');
    expect(listText).toContain('[structured]');

    // ---------------------------------------------------------------
    // 4. cortex agent run test-feature --task "build search feature" — verify JSON
    // ---------------------------------------------------------------
    const runOutput = await run([
      'agent', 'run', 'test-feature',
      '--task', 'build search feature',
    ]);
    const runText = runOutput.join('\n');
    const plan = JSON.parse(runText);

    // ---------------------------------------------------------------
    // 5. Parse the JSON, verify structure
    // ---------------------------------------------------------------
    expect(plan.playbook).toBe('test-feature');
    expect(plan.task).toBe('build search feature');
    expect(Array.isArray(plan.steps)).toBe(true);
    expect(plan.steps).toHaveLength(2);

    for (const step of plan.steps) {
      expect(step).toHaveProperty('role');
      expect(step).toHaveProperty('prompt');
      expect(step).toHaveProperty('context');
      expect(step).toHaveProperty('output_label');
    }

    expect(plan.steps[0].role).toBe('designer');
    expect(plan.steps[0].output_label).toBe('Design document');
    expect(plan.steps[1].role).toBe('coder');
    expect(plan.steps[1].output_label).toBe('Working code');

    // ---------------------------------------------------------------
    // 6. Create an open-ended playbook YAML file
    // ---------------------------------------------------------------
    const openEndedYaml = [
      'name: debug-issue',
      'description: Investigate and fix a bug',
      'roles:',
      '  investigator:',
      '    perspective: Find root cause.',
      '  fixer:',
      '    perspective: Fix the issue.',
      'strategy: |',
      '  Investigate first, then fix.',
    ].join('\n') + '\n';

    writeFileSync(join(playbooksDir, 'debug-issue.yaml'), openEndedYaml, 'utf-8');

    // ---------------------------------------------------------------
    // 7. cortex agent run debug-issue --task "fix memory leak" — verify open-ended JSON
    // ---------------------------------------------------------------
    const openRunOutput = await run([
      'agent', 'run', 'debug-issue',
      '--task', 'fix memory leak',
    ]);
    const openRunText = openRunOutput.join('\n');
    const openPlan = JSON.parse(openRunText);

    expect(openPlan.playbook).toBe('debug-issue');
    expect(openPlan.task).toBe('fix memory leak');
    expect(openPlan).toHaveProperty('strategy');
    expect(openPlan).toHaveProperty('roles');
    expect(openPlan.roles).toHaveProperty('investigator');
    expect(openPlan.roles).toHaveProperty('fixer');

    // ---------------------------------------------------------------
    // 8. cortex agent update test-feature --content "<valid updated YAML>"
    // ---------------------------------------------------------------
    const updatedYaml = [
      'name: test-feature',
      'description: Updated description',
      'roles:',
      '  designer:',
      '    perspective: Updated perspective.',
      'flow:',
      '  - role: designer',
      '    task: "Updated task"',
      '    output: "Updated output"',
    ].join('\n') + '\n';

    const updateOutput = await run([
      'agent', 'update', 'test-feature',
      '--content', updatedYaml,
    ]);
    const updateText = updateOutput.join('\n');
    expect(updateText).toContain('Playbook updated: test-feature');

    // ---------------------------------------------------------------
    // 9. Verify updated content on disk
    // ---------------------------------------------------------------
    const diskContent = readFileSync(
      join(playbooksDir, 'test-feature.yaml'),
      'utf-8',
    );
    expect(diskContent).toBe(updatedYaml);
  });
});
