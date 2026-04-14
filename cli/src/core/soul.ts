import { existsSync, readFileSync, writeFileSync } from 'fs';
import { getCortexPaths } from '../utils/paths.js';

/**
 * Read the soul.yaml file and return its content as a string.
 * Throws if soul.yaml does not exist (not initialized).
 */
export function showSoul(base: string): string {
  const { soulFile } = getCortexPaths(base);

  if (!existsSync(soulFile)) {
    throw new Error(
      `Soul file not found at ${soulFile}. Run "cortex init" first.`,
    );
  }

  return readFileSync(soulFile, 'utf-8');
}

/**
 * Overwrite soul.yaml with the given content.
 * Throws if the .cortex directory does not exist (not initialized).
 */
export function editSoul(base: string, content: string): string {
  const { cortexDir, soulFile } = getCortexPaths(base);

  if (!existsSync(cortexDir)) {
    throw new Error(
      `Cortex directory not found at ${cortexDir}. Run "cortex init" first.`,
    );
  }

  writeFileSync(soulFile, content, 'utf-8');
  return content;
}
