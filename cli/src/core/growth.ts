import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getCortexPaths } from '../utils/paths.js';

/**
 * Append a timestamped growth reflection to today's log file.
 * Creates the file and directory if they don't exist.
 */
export function appendGrowthLog(base: string, content: string): void {
  const { growthDir } = getCortexPaths(base);
  mkdirSync(growthDir, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const logFile = join(growthDir, `${dateStr}.log`);

  const entry = `\n[${now.toISOString()}]\n${content}\n`;
  appendFileSync(logFile, entry, 'utf-8');
}

/**
 * Return a concatenated report of growth log entries from the last N days.
 * Each day's section is prefixed with a markdown date header and sections are
 * separated by `\n---\n\n`. Returns '' when no matching files exist.
 */
export function getGrowthReport(base: string, days: number): string {
  const { growthDir } = getCortexPaths(base);

  if (!existsSync(growthDir)) {
    return '';
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  // Normalise to midnight so the comparison is date-only.
  cutoff.setHours(0, 0, 0, 0);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const files = readdirSync(growthDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.log$/.test(f))
    .map((f) => f.slice(0, 10)) // extract YYYY-MM-DD
    .filter((dateStr) => dateStr >= cutoffStr)
    .sort(); // lexicographic == chronological for ISO dates

  if (files.length === 0) {
    return '';
  }

  const sections = files.map((dateStr) => {
    const content = readFileSync(join(growthDir, `${dateStr}.log`), 'utf-8');
    return `## ${dateStr}\n${content}`;
  });

  return sections.join('\n---\n\n');
}
