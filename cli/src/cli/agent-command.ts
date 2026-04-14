import type { Command } from 'commander';
import os from 'os';
import { getCortexPaths } from '../utils/paths.js';
import { getDatabase } from '../db/database.js';
import {
  generateExecutionPlan,
  listPlaybooks,
  updatePlaybook,
} from '../core/agent.js';

/**
 * Register the `cortex agent` command with subcommands:
 * run, update, list.
 */
export function registerAgentCommand(program: Command): void {
  const agent = program
    .command('agent')
    .description('Manage agent playbooks and execution');

  agent
    .command('run')
    .description('Generate an execution plan from a playbook')
    .argument('<playbook>', 'Playbook name')
    .requiredOption('--task <desc>', 'Task description')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((playbook: string, opts: { task: string; home?: string }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        const plan = generateExecutionPlan(db, base, playbook, opts.task);
        console.log(JSON.stringify(plan, null, 2));
      } finally {
        db.close();
      }
    });

  agent
    .command('list')
    .description('List all playbooks')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((opts: { home?: string }) => {
      const base = opts.home ?? os.homedir();
      const playbooks = listPlaybooks(base);
      if (playbooks.length === 0) {
        console.log('No playbooks found.');
      } else {
        for (const pb of playbooks) {
          const type = pb.flow ? 'structured' : pb.strategy ? 'open-ended' : 'unknown';
          console.log(`${pb.name}  ${pb.description}  [${type}]`);
        }
      }
    });

  agent
    .command('update')
    .description('Update a playbook')
    .argument('<playbook>', 'Playbook name')
    .requiredOption('--content <content>', 'New playbook content')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((playbook: string, opts: { content: string; home?: string }) => {
      const base = opts.home ?? os.homedir();
      updatePlaybook(base, playbook, opts.content);
      console.log(`Playbook updated: ${playbook}`);
    });
}
