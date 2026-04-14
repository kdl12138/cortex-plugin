import type { Command } from 'commander';
import os from 'os';
import { getCortexPaths } from '../utils/paths.js';
import { getDatabase } from '../db/database.js';
import {
  writeMemory,
  recallMemories,
  listMemories,
  gcMemories,
} from '../core/memory.js';

/**
 * Register the `cortex memory` command with subcommands:
 * write, recall, list, gc.
 */
export function registerMemoryCommand(program: Command): void {
  const memory = program
    .command('memory')
    .description('Manage memories');

  memory
    .command('write')
    .description('Create a new memory')
    .requiredOption('--scope <scope>', 'Memory scope (core or project)', undefined)
    .requiredOption('--tags <tags>', 'Comma-separated tags')
    .requiredOption('--slug <slug>', 'Memory slug identifier')
    .option('--content <content>', 'Memory content')
    .option('--project <name>', 'Project name (required when scope=project)')
    .option('--project-dir <dir>', 'Project directory (required when scope=project)')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((opts: {
      scope: string;
      tags: string;
      slug: string;
      content?: string;
      project?: string;
      projectDir?: string;
      home?: string;
    }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        const tags = opts.tags.split(',').map((t) => t.trim()).filter(Boolean);
        const id = writeMemory(db, base, {
          content: opts.content ?? '',
          scope: opts.scope as 'core' | 'project',
          tags,
          slug: opts.slug,
          project: opts.project,
          projectDir: opts.projectDir,
        });
        console.log(id);
      } finally {
        db.close();
      }
    });

  memory
    .command('recall')
    .description('Search memories by query')
    .argument('<query>', 'Search query')
    .option('--cross-project', 'Search across all projects', false)
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((query: string, opts: { crossProject?: boolean; home?: string }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        const results = recallMemories(db, base, query, {
          crossProject: opts.crossProject,
        });
        if (results.length === 0) {
          console.log('No memories found.');
        } else {
          for (const mem of results) {
            const freshnessPct = `${Math.round(mem.freshness * 100)}%`;
            const tagsStr = mem.tags.join(', ');
            const preview = mem.content.replace(/---[\s\S]*?---\s*/, '').trim().slice(0, 200);
            console.log(`${mem.id}  freshness=${freshnessPct}  tags=[${tagsStr}]`);
            console.log(`  ${preview}`);
          }
        }
      } finally {
        db.close();
      }
    });

  memory
    .command('list')
    .description('List all memories')
    .option('--scope <scope>', 'Filter by scope (core or project)')
    .option('--archived', 'Include archived memories', false)
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((opts: { scope?: string; archived?: boolean; home?: string }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        const items = listMemories(db, {
          scope: opts.scope as 'core' | 'project' | undefined,
          archived: opts.archived,
        });
        if (items.length === 0) {
          console.log('No memories found.');
        } else {
          for (const item of items) {
            const freshnessPct = `${Math.round(item.freshness * 100)}%`;
            const tagsStr = item.tags.join(', ');
            console.log(`${item.id}  scope=${item.scope}  tags=[${tagsStr}]  freshness=${freshnessPct}`);
          }
        }
      } finally {
        db.close();
      }
    });

  memory
    .command('gc')
    .description('Garbage-collect stale memories')
    .option('--threshold <number>', 'Freshness threshold for archiving', '0.1')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((opts: { threshold?: string; home?: string }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        const threshold = parseFloat(opts.threshold ?? '0.1');
        const count = gcMemories(db, base, { threshold });
        if (count > 0) {
          console.log(`Archived ${count} memories.`);
        } else {
          console.log('No memories to archive.');
        }
      } finally {
        db.close();
      }
    });
}
