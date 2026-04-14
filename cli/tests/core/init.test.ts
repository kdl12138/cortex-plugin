import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { initCortexDir } from '../../src/core/init.js';
import { DEFAULT_SOUL_YAML, DEFAULT_MEMORY_STRATEGY, DEFAULT_SKILL_STRATEGY, DEFAULT_PLAYBOOK_STRATEGY } from '../../src/core/defaults.js';

describe('initCortexDir', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-test-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates the .cortex directory structure', () => {
    initCortexDir(tmpDir);

    const cortexDir = join(tmpDir, '.cortex');
    expect(existsSync(cortexDir)).toBe(true);
    expect(existsSync(join(cortexDir, 'memory'))).toBe(true);
    expect(existsSync(join(cortexDir, 'memory', 'core'))).toBe(true);
    expect(existsSync(join(cortexDir, 'memory', 'archive'))).toBe(true);
    expect(existsSync(join(cortexDir, 'skills'))).toBe(true);
    expect(existsSync(join(cortexDir, 'skills', 'hard'))).toBe(true);
    expect(existsSync(join(cortexDir, 'skills', 'soft'))).toBe(true);
    expect(existsSync(join(cortexDir, 'growth'))).toBe(true);
    expect(existsSync(join(cortexDir, 'playbooks'))).toBe(true);
  });

  it('writes soul.yaml with default content', () => {
    initCortexDir(tmpDir);

    const soulFile = join(tmpDir, '.cortex', 'soul.yaml');
    expect(existsSync(soulFile)).toBe(true);
    expect(readFileSync(soulFile, 'utf-8')).toBe(DEFAULT_SOUL_YAML);
  });

  it('writes memory-strategy.md with default content', () => {
    initCortexDir(tmpDir);

    const strategyFile = join(tmpDir, '.cortex', 'memory', 'memory-strategy.md');
    expect(existsSync(strategyFile)).toBe(true);
    expect(readFileSync(strategyFile, 'utf-8')).toBe(DEFAULT_MEMORY_STRATEGY);
  });

  it('writes skill-strategy.md with default content', () => {
    initCortexDir(tmpDir);

    const strategyFile = join(tmpDir, '.cortex', 'skills', 'skill-strategy.md');
    expect(existsSync(strategyFile)).toBe(true);
    expect(readFileSync(strategyFile, 'utf-8')).toBe(DEFAULT_SKILL_STRATEGY);
  });

  it('writes playbook-strategy.md with default content', () => {
    initCortexDir(tmpDir);

    const strategyFile = join(tmpDir, '.cortex', 'playbooks', 'playbook-strategy.md');
    expect(existsSync(strategyFile)).toBe(true);
    expect(readFileSync(strategyFile, 'utf-8')).toBe(DEFAULT_PLAYBOOK_STRATEGY);
  });

  it('is idempotent — calling twice does not overwrite existing files', () => {
    initCortexDir(tmpDir);

    // Modify soul.yaml after first init
    const soulFile = join(tmpDir, '.cortex', 'soul.yaml');
    const customContent = 'name: "custom"\n';
    writeFileSync(soulFile, customContent, 'utf-8');

    // Call init again
    initCortexDir(tmpDir);

    // The custom content should be preserved, not overwritten
    expect(readFileSync(soulFile, 'utf-8')).toBe(customContent);
  });

  it('is idempotent — strategy files are not overwritten on second call', () => {
    initCortexDir(tmpDir);

    const memoryStrategy = join(tmpDir, '.cortex', 'memory', 'memory-strategy.md');
    const customContent = '# Custom strategy\n';
    writeFileSync(memoryStrategy, customContent, 'utf-8');

    initCortexDir(tmpDir);

    expect(readFileSync(memoryStrategy, 'utf-8')).toBe(customContent);
  });
});
