import { mkdirSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { getCortexPaths } from '../utils/paths.js';
import {
  DEFAULT_SOUL_YAML,
  DEFAULT_MEMORY_STRATEGY,
  DEFAULT_SKILL_STRATEGY,
  DEFAULT_PLAYBOOK_STRATEGY,
} from './defaults.js';

/**
 * Write content to a file only if the file does not already exist.
 * Ensures idempotency — existing user modifications are never overwritten.
 */
function writeIfMissing(filePath: string, content: string): void {
  if (!existsSync(filePath)) {
    writeFileSync(filePath, content, 'utf-8');
  }
}

/**
 * Initialize the .cortex directory structure under the given base path.
 * Creates all required directories and seed files.
 * Safe to call multiple times — existing files are never overwritten.
 */
export function initCortexDir(base: string): void {
  const paths = getCortexPaths(base);

  // Create all directories (recursive: true makes this idempotent)
  mkdirSync(paths.cortexDir, { recursive: true });
  mkdirSync(paths.memoryDir, { recursive: true });
  mkdirSync(join(paths.memoryDir, 'core'), { recursive: true });
  mkdirSync(join(paths.memoryDir, 'archive'), { recursive: true });
  mkdirSync(paths.skillsDir, { recursive: true });
  mkdirSync(join(paths.skillsDir, 'hard'), { recursive: true });
  mkdirSync(join(paths.skillsDir, 'soft'), { recursive: true });
  mkdirSync(paths.growthDir, { recursive: true });
  mkdirSync(paths.playbooksDir, { recursive: true });

  // Write seed files (only if they don't already exist)
  writeIfMissing(paths.soulFile, DEFAULT_SOUL_YAML);
  writeIfMissing(join(paths.memoryDir, 'memory-strategy.md'), DEFAULT_MEMORY_STRATEGY);
  writeIfMissing(join(paths.skillsDir, 'skill-strategy.md'), DEFAULT_SKILL_STRATEGY);
  writeIfMissing(join(paths.playbooksDir, 'playbook-strategy.md'), DEFAULT_PLAYBOOK_STRATEGY);
}
