import type { Command } from 'commander';
import os from 'os';
import { appendGrowthLog, getGrowthReport } from '../core/growth.js';

/**
 * Register the `cortex growth` command with subcommands:
 * log, report.
 */
export function registerGrowthCommand(program: Command): void {
  const growth = program
    .command('growth')
    .description('Manage growth logs');

  growth
    .command('log')
    .description('Append a growth reflection to today\'s log')
    .requiredOption('--content <content>', 'Growth reflection content')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((opts: { content: string; home?: string }) => {
      const base = opts.home ?? os.homedir();
      appendGrowthLog(base, opts.content);
      const dateStr = new Date().toISOString().slice(0, 10);
      console.log(`Growth logged for ${dateStr}.`);
    });

  growth
    .command('report')
    .description('Print a report of recent growth logs')
    .option('--days <n>', 'Number of days to include', '7')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((opts: { days?: string; home?: string }) => {
      const base = opts.home ?? os.homedir();
      const days = parseInt(opts.days ?? '7', 10);
      const report = getGrowthReport(base, days);
      if (report === '') {
        console.log(`No growth logs found for the last ${days} days.`);
      } else {
        console.log(report);
      }
    });
}
