import type { Command } from 'commander';
import os from 'os';
import { getCortexPaths } from '../utils/paths.js';
import { getDatabase } from '../db/database.js';
import {
  createSkill,
  matchSkills,
  updateSkill,
  listSkills,
} from '../core/skill.js';

/**
 * Register the `cortex skill` command with subcommands:
 * create, match, list, update.
 */
export function registerSkillCommand(program: Command): void {
  const skill = program
    .command('skill')
    .description('Manage skills');

  skill
    .command('create')
    .description('Create a new skill')
    .requiredOption('--type <type>', 'Skill type (hard or soft)')
    .requiredOption('--id <id>', 'Skill identifier')
    .requiredOption('--content <content>', 'Skill content')
    .option('--triggers <triggers>', 'Comma-separated triggers (for hard skills)')
    .option('--domain <domains>', 'Comma-separated domains (for soft skills)')
    .option('--abstraction <level>', 'Abstraction level (high, medium, low)')
    .option('--scope <scope>', 'Skill scope (core or project)', 'core')
    .option('--project <name>', 'Project name (required when scope=project)')
    .option('--project-dir <dir>', 'Project directory (required when scope=project)')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((opts: {
      type: string;
      id: string;
      content: string;
      triggers?: string;
      domain?: string;
      abstraction?: string;
      scope: string;
      project?: string;
      projectDir?: string;
      home?: string;
    }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        const triggers = opts.triggers
          ? opts.triggers.split(',').map((t) => t.trim()).filter(Boolean)
          : undefined;
        const domain = opts.domain
          ? opts.domain.split(',').map((d) => d.trim()).filter(Boolean)
          : undefined;

        createSkill(db, base, {
          id: opts.id,
          content: opts.content,
          type: opts.type as 'hard' | 'soft',
          scope: opts.scope as 'core' | 'project',
          triggers,
          domain,
          abstraction: opts.abstraction,
          project: opts.project,
          projectDir: opts.projectDir,
        });
        console.log(`Skill created: ${opts.id}`);
      } finally {
        db.close();
      }
    });

  skill
    .command('match')
    .description('Match skills to a situation')
    .requiredOption('--situation <desc>', 'Situation description')
    .option('--cross-project', 'Search across all projects', false)
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((opts: {
      situation: string;
      crossProject?: boolean;
      home?: string;
    }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        const results = matchSkills(db, base, opts.situation, {
          crossProject: opts.crossProject,
        });
        if (results.length === 0) {
          console.log('No matching skills found.');
        } else {
          for (const s of results) {
            const triggersStr = s.triggers.length > 0
              ? `triggers=[${s.triggers.join(', ')}]`
              : '';
            const domainStr = s.domain.length > 0
              ? `domain=[${s.domain.join(', ')}]`
              : '';
            const meta = [triggersStr, domainStr].filter(Boolean).join('  ');
            const snippet = s.content.replace(/---[\s\S]*?---\s*/, '').trim().slice(0, 200);
            console.log(`${s.type}  ${s.id}  ${meta}`);
            console.log(`  ${snippet}`);
          }
        }
      } finally {
        db.close();
      }
    });

  skill
    .command('list')
    .description('List all skills')
    .option('--type <type>', 'Filter by type (hard or soft)')
    .option('--scope <scope>', 'Filter by scope (core or project)')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((opts: {
      type?: string;
      scope?: string;
      home?: string;
    }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        const items = listSkills(db, {
          type: opts.type as 'hard' | 'soft' | undefined,
          scope: opts.scope as 'core' | 'project' | undefined,
        });
        if (items.length === 0) {
          console.log('No skills found.');
        } else {
          for (const item of items) {
            const triggersStr = item.triggers.length > 0
              ? `triggers=[${item.triggers.join(', ')}]`
              : '';
            const domainStr = item.domain.length > 0
              ? `domain=[${item.domain.join(', ')}]`
              : '';
            const meta = [triggersStr, domainStr].filter(Boolean).join('  ');
            console.log(`${item.id}  type=${item.type}  scope=${item.scope}  ${meta}`);
          }
        }
      } finally {
        db.close();
      }
    });

  skill
    .command('update')
    .description('Update an existing skill')
    .argument('<skill-id>', 'Skill identifier')
    .requiredOption('--content <content>', 'New skill content')
    .option('--triggers <triggers>', 'Comma-separated triggers')
    .option('--domain <domains>', 'Comma-separated domains')
    .option('--abstraction <level>', 'Abstraction level (high, medium, low)')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((skillId: string, opts: {
      content: string;
      triggers?: string;
      domain?: string;
      abstraction?: string;
      home?: string;
    }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        const triggers = opts.triggers
          ? opts.triggers.split(',').map((t) => t.trim()).filter(Boolean)
          : undefined;
        const domain = opts.domain
          ? opts.domain.split(',').map((d) => d.trim()).filter(Boolean)
          : undefined;

        updateSkill(db, base, skillId, {
          content: opts.content,
          triggers,
          domain,
          abstraction: opts.abstraction,
        });
        console.log(`Skill updated: ${skillId}`);
      } finally {
        db.close();
      }
    });
}
