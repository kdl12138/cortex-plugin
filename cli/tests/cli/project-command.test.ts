import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createProgram } from '../../src/cli/program.js';

describe('cortex project command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-project-cmd-'));
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

  it('registers "project" as a subcommand', () => {
    const program = createProgram();
    const projectCmd = program.commands.find((c) => c.name() === 'project');
    expect(projectCmd).toBeDefined();
  });

  it('registers all five subcommands under "project"', () => {
    const program = createProgram();
    const projectCmd = program.commands.find((c) => c.name() === 'project');
    expect(projectCmd).toBeDefined();
    const subNames = projectCmd!.commands.map((c) => c.name()).sort();
    expect(subNames).toEqual(['create', 'current', 'link', 'list', 'switch']);
  });

  describe('project create', () => {
    it('creates a project by name', async () => {
      await initCortex();

      const logs = await captureLog(async () => {
        const program = createProgram();
        await program.parseAsync([
          'node', 'cortex', 'project', 'create', 'my-project', '--home', tmpDir,
        ]);
      });

      expect(logs.some((line) => line.includes('my-project'))).toBe(true);
    });

    it('creates a project with a description', async () => {
      await initCortex();

      const logs = await captureLog(async () => {
        const program = createProgram();
        await program.parseAsync([
          'node', 'cortex', 'project', 'create', 'described-proj',
          '--desc', 'A cool project',
          '--home', tmpDir,
        ]);
      });

      expect(logs.some((line) => line.includes('described-proj'))).toBe(true);
    });
  });

  describe('project list', () => {
    it('prints "No projects" when none exist', async () => {
      await initCortex();

      const logs = await captureLog(async () => {
        const program = createProgram();
        await program.parseAsync([
          'node', 'cortex', 'project', 'list', '--home', tmpDir,
        ]);
      });

      expect(logs.some((line) => /no projects/i.test(line))).toBe(true);
    });

    it('lists created projects', async () => {
      await initCortex();

      // Create two projects
      const p1 = createProgram();
      await p1.parseAsync(['node', 'cortex', 'project', 'create', 'alpha', '--home', tmpDir]);
      const p2 = createProgram();
      await p2.parseAsync(['node', 'cortex', 'project', 'create', 'beta', '--home', tmpDir]);

      const logs = await captureLog(async () => {
        const program = createProgram();
        await program.parseAsync([
          'node', 'cortex', 'project', 'list', '--home', tmpDir,
        ]);
      });

      const output = logs.join('\n');
      expect(output).toContain('alpha');
      expect(output).toContain('beta');
    });
  });

  describe('project switch', () => {
    it('switches to an existing project', async () => {
      await initCortex();

      const p1 = createProgram();
      await p1.parseAsync(['node', 'cortex', 'project', 'create', 'target', '--home', tmpDir]);

      const logs = await captureLog(async () => {
        const program = createProgram();
        await program.parseAsync([
          'node', 'cortex', 'project', 'switch', 'target', '--home', tmpDir,
        ]);
      });

      expect(logs.some((line) => line.includes('target'))).toBe(true);
    });
  });

  describe('project current', () => {
    it('prints "No active project" when none is set', async () => {
      await initCortex();

      const logs = await captureLog(async () => {
        const program = createProgram();
        await program.parseAsync([
          'node', 'cortex', 'project', 'current', '--home', tmpDir,
        ]);
      });

      expect(logs.some((line) => /no active project/i.test(line))).toBe(true);
    });

    it('prints the current project after switch', async () => {
      await initCortex();

      const p1 = createProgram();
      await p1.parseAsync(['node', 'cortex', 'project', 'create', 'cur-proj', '--home', tmpDir]);
      const p2 = createProgram();
      await p2.parseAsync(['node', 'cortex', 'project', 'switch', 'cur-proj', '--home', tmpDir]);

      const logs = await captureLog(async () => {
        const program = createProgram();
        await program.parseAsync([
          'node', 'cortex', 'project', 'current', '--home', tmpDir,
        ]);
      });

      expect(logs.some((line) => line.includes('cur-proj'))).toBe(true);
    });
  });

  describe('project link', () => {
    it('links a directory to a project', async () => {
      await initCortex();

      const p1 = createProgram();
      await p1.parseAsync(['node', 'cortex', 'project', 'create', 'linked', '--home', tmpDir]);

      const logs = await captureLog(async () => {
        const program = createProgram();
        await program.parseAsync([
          'node', 'cortex', 'project', 'link', '/some/dir', 'linked', '--home', tmpDir,
        ]);
      });

      expect(logs.some((line) => line.includes('linked'))).toBe(true);
      expect(logs.some((line) => line.includes('/some/dir'))).toBe(true);
    });
  });
});
