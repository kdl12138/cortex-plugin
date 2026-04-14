import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createProgram } from '../../src/cli/program.js';

describe('cortex init command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-init-cmd-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .cortex directory and database file', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cortex', 'init', '--home', tmpDir]);

    const cortexDir = join(tmpDir, '.cortex');
    expect(existsSync(cortexDir)).toBe(true);
    expect(existsSync(join(cortexDir, 'cortex.db'))).toBe(true);
  });

  it('creates seed files via initCortexDir', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cortex', 'init', '--home', tmpDir]);

    const cortexDir = join(tmpDir, '.cortex');
    expect(existsSync(join(cortexDir, 'soul.yaml'))).toBe(true);
    expect(existsSync(join(cortexDir, 'memory'))).toBe(true);
    expect(existsSync(join(cortexDir, 'skills'))).toBe(true);
  });

  it('installs bootstrap skill file to ~/.claude/skills/cortex.md', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cortex', 'init', '--home', tmpDir]);

    const skillFile = join(tmpDir, '.claude', 'skills', 'cortex.md');
    expect(existsSync(skillFile)).toBe(true);
  });

  it('is idempotent — running init twice does not throw', async () => {
    const program1 = createProgram();
    await program1.parseAsync(['node', 'cortex', 'init', '--home', tmpDir]);

    const program2 = createProgram();
    await program2.parseAsync(['node', 'cortex', 'init', '--home', tmpDir]);

    expect(existsSync(join(tmpDir, '.cortex', 'cortex.db'))).toBe(true);
  });
});
