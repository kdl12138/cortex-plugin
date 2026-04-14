import type { Command } from 'commander';
import os from 'os';
import { initCortexDir } from '../core/init.js';
import { installBootstrapSkill } from '../core/bootstrap.js';
import { initDatabase } from '../db/database.js';
import { getCortexPaths } from '../utils/paths.js';

/**
 * Register the `cortex init` subcommand.
 *
 * Creates the .cortex directory structure, seed files, and SQLite database.
 * Accepts an optional `--home` flag to override the base directory
 * (defaults to os.homedir()).
 */
export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize the .cortex directory and database')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((opts: { home?: string }) => {
      const base = opts.home ?? os.homedir();

      initCortexDir(base);
      installBootstrapSkill(base);

      const paths = getCortexPaths(base);
      const db = initDatabase(paths.dbFile);
      db.close();

      console.log(`Cortex initialized at ${paths.cortexDir}`);
    });
}
