import type { Command } from 'commander';
import os from 'os';
import { getCortexPaths } from '../utils/paths.js';
import { getDatabase } from '../db/database.js';
import {
  createProject,
  listProjects,
  switchProject,
  linkProject,
  currentProject,
} from '../core/project.js';

/**
 * Register the `cortex project` command with subcommands:
 * create, list, switch, current, link.
 */
export function registerProjectCommand(program: Command): void {
  const project = program
    .command('project')
    .description('Manage projects');

  project
    .command('create')
    .description('Create a new project')
    .argument('<name>', 'Project name')
    .option('--desc <description>', 'Project description')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((name: string, opts: { desc?: string; home?: string }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        createProject(db, name, opts.desc);
        console.log(`Project created: ${name}`);
      } finally {
        db.close();
      }
    });

  project
    .command('list')
    .description('List all projects')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((opts: { home?: string }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        const projects = listProjects(db);
        if (projects.length === 0) {
          console.log('No projects found.');
        } else {
          for (const p of projects) {
            const desc = p.description ? ` - ${p.description}` : '';
            console.log(`${p.name}${desc}`);
          }
        }
      } finally {
        db.close();
      }
    });

  project
    .command('switch')
    .description('Switch the active project')
    .argument('<name>', 'Project name to switch to')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((name: string, opts: { home?: string }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        switchProject(db, base, name);
        console.log(`Switched to project: ${name}`);
      } finally {
        db.close();
      }
    });

  project
    .command('current')
    .description('Show the current active project')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((opts: { home?: string }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        const name = currentProject(db, base);
        if (name) {
          console.log(name);
        } else {
          console.log('No active project.');
        }
      } finally {
        db.close();
      }
    });

  project
    .command('link')
    .description('Link a directory to a project')
    .argument('<dir>', 'Directory path to link')
    .argument('<name>', 'Project name to link to')
    .option('--home <path>', 'Base directory for .cortex (defaults to home directory)')
    .action((dir: string, name: string, opts: { home?: string }) => {
      const base = opts.home ?? os.homedir();
      const paths = getCortexPaths(base);
      const db = getDatabase(paths.dbFile);
      try {
        linkProject(db, dir, name);
        console.log(`Linked ${dir} to project: ${name}`);
      } finally {
        db.close();
      }
    });
}
