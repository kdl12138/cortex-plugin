import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname } from 'path';
import Database from 'better-sqlite3';
import { getCortexPaths } from '../utils/paths.js';

/**
 * Create a new project.
 * Inserts a row into the projects table with current timestamps.
 * Throws if a project with the same name already exists.
 */
export function createProject(db: Database.Database, name: string, description?: string): void {
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO projects (name, description, created_at, last_active) VALUES (?, ?, ?, ?)'
  ).run(name, description ?? null, now, now);
}

/**
 * List all projects, ordered by last_active descending.
 */
export function listProjects(
  db: Database.Database
): Array<{ name: string; description: string | null; created_at: string; last_active: string }> {
  return db
    .prepare('SELECT name, description, created_at, last_active FROM projects ORDER BY last_active DESC')
    .all() as Array<{ name: string; description: string | null; created_at: string; last_active: string }>;
}

/**
 * Switch the active project.
 * Verifies the project exists, writes its name to the active_project file,
 * and updates the last_active timestamp.
 */
export function switchProject(db: Database.Database, base: string, name: string): void {
  const row = db.prepare('SELECT name FROM projects WHERE name = ?').get(name);
  if (!row) {
    throw new Error(`Project not found: ${name}`);
  }

  const paths = getCortexPaths(base);
  writeFileSync(paths.activeProjectFile, name, 'utf-8');

  const now = new Date().toISOString();
  db.prepare('UPDATE projects SET last_active = ? WHERE name = ?').run(now, name);
}

/**
 * Link a directory to a project.
 * Verifies the project exists, then inserts or replaces the directory mapping.
 */
export function linkProject(db: Database.Database, dir: string, projectName: string): void {
  const row = db.prepare('SELECT name FROM projects WHERE name = ?').get(projectName);
  if (!row) {
    throw new Error(`Project not found: ${projectName}`);
  }

  db.prepare('INSERT OR REPLACE INTO project_dirs (dir_path, project_name) VALUES (?, ?)').run(
    dir,
    projectName
  );
}

/**
 * Get the current project.
 * Priority:
 *   1. Read active_project file (if it exists)
 *   2. If cwd provided, walk ancestor directories checking project_dirs table
 *   3. Return null if nothing found
 */
export function currentProject(
  db: Database.Database,
  base: string,
  cwd?: string
): string | null {
  // Priority 1: active_project file
  const paths = getCortexPaths(base);
  if (existsSync(paths.activeProjectFile)) {
    const name = readFileSync(paths.activeProjectFile, 'utf-8').trim();
    if (name) {
      return name;
    }
  }

  // Priority 2: walk ancestor directories
  if (cwd) {
    let dir = cwd;
    while (true) {
      const row = db
        .prepare('SELECT project_name FROM project_dirs WHERE dir_path = ?')
        .get(dir) as { project_name: string } | undefined;
      if (row) {
        return row.project_name;
      }

      const parent = dirname(dir);
      if (parent === dir) {
        // Reached filesystem root
        break;
      }
      dir = parent;
    }
  }

  // Priority 3: nothing found
  return null;
}
