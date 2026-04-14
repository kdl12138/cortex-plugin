import type { Command } from 'commander';
import os from 'os';
import { showSoul, editSoul } from '../core/soul.js';

/**
 * Register the `cortex soul` subcommand with `show` and `edit` sub-subcommands.
 *
 * - `soul show` reads soul.yaml and prints it to stdout.
 * - `soul edit --content <string>` overwrites soul.yaml with the given content.
 *   When used from a real terminal, content can be piped via stdin instead.
 *
 * Both accept an optional `--home` flag to override the base directory
 * (defaults to os.homedir()).
 */
export function registerSoulCommand(program: Command): void {
  const soul = program
    .command('soul')
    .description('View or edit your soul configuration');

  soul
    .command('show')
    .description('Display the current soul.yaml')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((opts: { home?: string }) => {
      const base = opts.home ?? os.homedir();
      const content = showSoul(base);
      console.log(content);
    });

  soul
    .command('edit')
    .description('Overwrite soul.yaml with new content')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .option('--content <content>', 'New content for soul.yaml')
    .action((opts: { home?: string; content?: string }) => {
      const base = opts.home ?? os.homedir();

      if (!opts.content) {
        throw new Error('No content provided. Use --content or pipe via stdin.');
      }

      editSoul(base, opts.content);
    });
}
