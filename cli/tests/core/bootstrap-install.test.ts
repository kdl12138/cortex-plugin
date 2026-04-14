import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { installBootstrapSkill, getBootstrapSkillContent } from '../../src/core/bootstrap.js';

describe('installBootstrapSkill', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-bootstrap-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates ~/.claude/skills/cortex.md', () => {
    installBootstrapSkill(tmpDir);

    const skillFile = join(tmpDir, '.claude', 'skills', 'cortex.md');
    expect(existsSync(skillFile)).toBe(true);
  });

  it('writes the bootstrap skill content', () => {
    installBootstrapSkill(tmpDir);

    const skillFile = join(tmpDir, '.claude', 'skills', 'cortex.md');
    const content = readFileSync(skillFile, 'utf-8');
    expect(content).toBe(getBootstrapSkillContent());
  });

  it('creates the directory structure if it does not exist', () => {
    const skillsDir = join(tmpDir, '.claude', 'skills');
    expect(existsSync(skillsDir)).toBe(false);

    installBootstrapSkill(tmpDir);

    expect(existsSync(skillsDir)).toBe(true);
  });

  it('overwrites the file on repeated calls (always gets latest content)', () => {
    installBootstrapSkill(tmpDir);

    const skillFile = join(tmpDir, '.claude', 'skills', 'cortex.md');
    writeFileSync(skillFile, 'old content', 'utf-8');

    installBootstrapSkill(tmpDir);

    const content = readFileSync(skillFile, 'utf-8');
    expect(content).toBe(getBootstrapSkillContent());
    expect(content).not.toBe('old content');
  });
});
