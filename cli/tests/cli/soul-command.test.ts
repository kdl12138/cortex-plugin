import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createProgram } from '../../src/cli/program.js';
import { DEFAULT_SOUL_YAML } from '../../src/core/defaults.js';

describe('cortex soul command', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-soul-cmd-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('registers "soul" as a subcommand', () => {
    const program = createProgram();
    const soulCmd = program.commands.find((c) => c.name() === 'soul');
    expect(soulCmd).toBeDefined();
  });

  it('registers "show" subcommand under "soul"', () => {
    const program = createProgram();
    const soulCmd = program.commands.find((c) => c.name() === 'soul');
    expect(soulCmd).toBeDefined();
    const showCmd = soulCmd!.commands.find((c) => c.name() === 'show');
    expect(showCmd).toBeDefined();
  });

  it('registers "edit" subcommand under "soul"', () => {
    const program = createProgram();
    const soulCmd = program.commands.find((c) => c.name() === 'soul');
    expect(soulCmd).toBeDefined();
    const editCmd = soulCmd!.commands.find((c) => c.name() === 'edit');
    expect(editCmd).toBeDefined();
  });

  it('soul show prints soul.yaml content to stdout', async () => {
    // First, initialize cortex
    const initProgram = createProgram();
    await initProgram.parseAsync(['node', 'cortex', 'init', '--home', tmpDir]);

    // Capture stdout
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      const program = createProgram();
      await program.parseAsync([
        'node',
        'cortex',
        'soul',
        'show',
        '--home',
        tmpDir,
      ]);

      expect(logs.some((line) => line.includes('identity'))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });

  it('soul edit writes content to soul.yaml', async () => {
    // First, initialize cortex
    const initProgram = createProgram();
    await initProgram.parseAsync(['node', 'cortex', 'init', '--home', tmpDir]);

    const newContent = 'name: "edited-via-cli"\n';

    const program = createProgram();
    await program.parseAsync([
      'node',
      'cortex',
      'soul',
      'edit',
      '--home',
      tmpDir,
      '--content',
      newContent,
    ]);

    const soulFile = join(tmpDir, '.cortex', 'soul.yaml');
    expect(readFileSync(soulFile, 'utf-8')).toBe(newContent);
  });
});
