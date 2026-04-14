import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initCortexDir } from '../../src/core/init.js';
import { showSoul, editSoul } from '../../src/core/soul.js';
import { DEFAULT_SOUL_YAML } from '../../src/core/defaults.js';

describe('showSoul', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-soul-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns the content of soul.yaml', () => {
    initCortexDir(tmpDir);
    const content = showSoul(tmpDir);
    expect(content).toBe(DEFAULT_SOUL_YAML);
  });

  it('throws if not initialized (soul.yaml does not exist)', () => {
    expect(() => showSoul(tmpDir)).toThrow();
  });
});

describe('editSoul', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-soul-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('overwrites soul.yaml with new content', () => {
    initCortexDir(tmpDir);
    const newContent = 'name: "updated"\nidentity: "new identity"\n';
    editSoul(tmpDir, newContent);

    const soulFile = join(tmpDir, '.cortex', 'soul.yaml');
    expect(readFileSync(soulFile, 'utf-8')).toBe(newContent);
  });

  it('returns the written content', () => {
    initCortexDir(tmpDir);
    const newContent = 'name: "updated"\n';
    const result = editSoul(tmpDir, newContent);
    expect(result).toBe(newContent);
  });

  it('throws if not initialized (.cortex directory does not exist)', () => {
    expect(() => editSoul(tmpDir, 'anything')).toThrow();
  });
});
