import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import Database from 'better-sqlite3';
import { getCortexPaths } from '../utils/paths.js';
import { computeFreshness } from './freshness.js';

export interface WriteMemoryOptions {
  content: string;
  scope: 'core' | 'project';
  tags: string[];
  slug: string;
  project?: string;
  projectDir?: string;
}

/**
 * Create a memory markdown file and index it in SQLite.
 * Returns the generated id (`${timestamp}-${slug}`).
 */
export function writeMemory(
  db: Database.Database,
  base: string,
  opts: WriteMemoryOptions
): string {
  // Validate slug
  if (!/^[a-z0-9-]+$/i.test(opts.slug)) {
    throw new Error(`Invalid slug: "${opts.slug}". Only alphanumerics and hyphens are allowed.`);
  }

  // Capture a single timestamp for consistency
  const now = new Date();
  const id = `${now.getTime()}-${opts.slug}`;
  const nowIso = now.toISOString();
  const createdDate = nowIso.slice(0, 10);

  // Determine file path based on scope
  let filePath: string;
  if (opts.scope === 'core') {
    const { memoryDir } = getCortexPaths(base);
    filePath = join(memoryDir, 'core', `${id}.md`);
  } else {
    if (!opts.projectDir) {
      throw new Error('projectDir is required when scope is "project"');
    }
    filePath = join(opts.projectDir, '.cortex', 'memory', `${id}.md`);
  }

  // Build markdown content with frontmatter
  const tagsFormatted = opts.tags.join(', ');
  const markdown = `---
created: ${createdDate}
tags: [${tagsFormatted}]
---

${opts.content}
`;

  // Write file (create parent dir if needed)
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, markdown, 'utf-8');

  // INSERT into memory_index and memory_fts in a transaction
  const insertIndex = db.prepare(
    `INSERT INTO memory_index (id, file_path, scope, project, created_at, last_recalled, recall_count, freshness, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertFts = db.prepare(
    `INSERT INTO memory_fts (id, content, tags) VALUES (?, ?, ?)`
  );

  const runBoth = db.transaction(() => {
    insertIndex.run(
      id,
      filePath,
      opts.scope,
      opts.scope === 'project' ? opts.project ?? null : null,
      nowIso,
      nowIso,
      0,
      1.0,
      JSON.stringify(opts.tags)
    );
    insertFts.run(id, opts.content, opts.tags.join(' '));
  });

  runBoth();

  return id;
}

export interface RecallOptions {
  crossProject?: boolean;
  currentProject?: string | null;
  limit?: number;
}

export interface RecalledMemory {
  id: string;
  content: string;
  tags: string[];
  freshness: number;
  scope: string;
  project: string | null;
  created_at: string;
  score: number;
}

/**
 * Search memories using FTS5 with freshness weighting, scope filtering,
 * and archive fallback when few results are found.
 */
export function recallMemories(
  db: Database.Database,
  base: string,
  query: string,
  opts?: RecallOptions
): RecalledMemory[] {
  const limit = opts?.limit ?? 10;
  const crossProject = opts?.crossProject ?? false;
  const currentProject = opts?.currentProject ?? null;
  const now = new Date();

  // --- Step 1–6: FTS search with scope filtering and freshness weighting ---
  let ftsResults: RecalledMemory[] = [];
  try {
    // Build the SQL query with scope filtering
    let sql = `
      SELECT
        mi.id, mi.file_path, mi.scope, mi.project, mi.created_at,
        mi.last_recalled, mi.recall_count, mi.freshness, mi.tags,
        fts.rank AS fts_rank
      FROM memory_fts fts
      JOIN memory_index mi ON mi.id = fts.id
      WHERE memory_fts MATCH ?
        AND mi.file_path NOT LIKE '%/archive/%'
    `;
    const params: any[] = [query];

    if (!crossProject) {
      if (currentProject) {
        sql += ` AND (mi.scope = 'core' OR mi.project = ?)`;
        params.push(currentProject);
      } else {
        sql += ` AND mi.scope = 'core'`;
      }
    }

    sql += ` ORDER BY fts.rank ASC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as any[];

    // Step 4–6: Compute freshness, score, sort
    ftsResults = rows.map((row) => {
      const lastRecalled = new Date(row.last_recalled);
      const freshness = computeFreshness(lastRecalled, now);
      const score = (-row.fts_rank) * freshness;

      let tags: string[] = [];
      try {
        tags = JSON.parse(row.tags);
      } catch {
        tags = [];
      }

      return {
        id: row.id,
        content: '', // will be filled from disk
        tags,
        freshness,
        scope: row.scope,
        project: row.project ?? null,
        created_at: row.created_at,
        score,
        _file_path: row.file_path,
      };
    });

    // Sort by score descending
    ftsResults.sort((a, b) => b.score - a.score);
  } catch {
    // FTS query errors (invalid syntax, etc.) — return empty
    ftsResults = [];
  }

  // Step 7: Read file content from disk
  for (const mem of ftsResults) {
    const filePath = (mem as any)._file_path;
    try {
      if (existsSync(filePath)) {
        mem.content = readFileSync(filePath, 'utf-8');
      }
    } catch {
      // If file can't be read, leave content empty
    }
  }

  // Step 8 moved after archive fallback so all returned memories get updated

  // Step 9: Archive fallback when few FTS results
  let results: RecalledMemory[] = [...ftsResults];
  if (results.length < 3) {
    const archiveRows = db.prepare(
      `SELECT id, file_path, scope, project, created_at, last_recalled,
              recall_count, freshness, tags
       FROM memory_index
       WHERE file_path LIKE '%/archive/%'`
    ).all() as any[];

    const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const existingIds = new Set(results.map((r) => r.id));

    for (const row of archiveRows) {
      if (existingIds.has(row.id)) continue;

      // Check tag overlap
      let tags: string[] = [];
      try {
        tags = JSON.parse(row.tags);
      } catch {
        tags = [];
      }
      const lowerTags = tags.map((t: string) => t.toLowerCase());
      const tagMatch = queryTerms.some((term) =>
        lowerTags.some((tag) => tag.includes(term))
      );

      // Read file content and check for keyword match
      let content = '';
      let contentMatch = false;
      try {
        if (existsSync(row.file_path)) {
          content = readFileSync(row.file_path, 'utf-8');
          const lowerContent = content.toLowerCase();
          contentMatch = queryTerms.some((term) => lowerContent.includes(term));
        }
      } catch {
        // skip unreadable files
      }

      if (tagMatch || contentMatch) {
        const lastRecalled = new Date(row.last_recalled);
        const freshness = computeFreshness(lastRecalled, now);

        results.push({
          id: row.id,
          content,
          tags,
          freshness,
          scope: row.scope,
          project: row.project ?? null,
          created_at: row.created_at,
          score: 0, // no FTS rank available for archive hits
        });
      }
    }
  }

  // Step 8: Update recall metadata for ALL returned memories (FTS + archive)
  const updateStmt = db.prepare(
    `UPDATE memory_index SET last_recalled = ?, recall_count = recall_count + 1, freshness = 1.0 WHERE id = ?`
  );
  const nowIso = now.toISOString();
  const updateAll = db.transaction(() => {
    for (const mem of results) {
      updateStmt.run(nowIso, mem.id);
    }
  });
  updateAll();

  // Clean up internal _file_path property
  return results.map(({ ...mem }) => {
    delete (mem as any)._file_path;
    return mem;
  });
}

export interface ListMemoriesOptions {
  scope?: 'core' | 'project';
  archived?: boolean;
  project?: string;
}

export interface MemoryListItem {
  id: string;
  scope: string;
  project: string | null;
  tags: string[];
  created_at: string;
  freshness: number;
}

/**
 * List memories from the index, with optional filtering by scope, project,
 * and archive status. Returns results sorted by created_at DESC with live
 * freshness computed at call time.
 */
export function listMemories(
  db: Database.Database,
  opts?: ListMemoriesOptions
): MemoryListItem[] {
  const now = new Date();

  let sql = `SELECT id, file_path, scope, project, created_at, last_recalled, tags
             FROM memory_index
             WHERE 1=1`;
  const params: any[] = [];

  if (opts?.scope) {
    sql += ` AND scope = ?`;
    params.push(opts.scope);
  }

  if (opts?.project) {
    sql += ` AND project = ?`;
    params.push(opts.project);
  }

  if (!opts?.archived) {
    sql += ` AND file_path NOT LIKE '%/archive/%'`;
  }

  sql += ` ORDER BY created_at DESC`;

  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map((row) => {
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags);
    } catch {
      tags = [];
    }

    const lastRecalled = new Date(row.last_recalled);
    const freshness = computeFreshness(lastRecalled, now);

    return {
      id: row.id,
      scope: row.scope,
      project: row.project ?? null,
      tags,
      created_at: row.created_at,
      freshness,
    };
  });
}

export interface GcOptions {
  threshold?: number; // default 0.1
}

/**
 * Garbage-collect stale memories by archiving those whose freshness
 * has dropped below the threshold. Returns the count of archived memories.
 */
export function gcMemories(
  db: Database.Database,
  base: string,
  opts?: GcOptions
): number {
  const threshold = opts?.threshold ?? 0.1;
  const now = new Date();

  // Select all non-archived memories
  const rows = db
    .prepare(
      `SELECT id, file_path, scope, last_recalled
       FROM memory_index
       WHERE file_path NOT LIKE '%/archive/%'`
    )
    .all() as { id: string; file_path: string; scope: string; last_recalled: string }[];

  let archivedCount = 0;

  const updateIndex = db.prepare(
    `UPDATE memory_index SET file_path = ?, freshness = ? WHERE id = ?`
  );
  const deleteFts = db.prepare(`DELETE FROM memory_fts WHERE id = ?`);

  const archiveAll = db.transaction(() => {
    for (const row of rows) {
      const lastRecalled = new Date(row.last_recalled);
      const freshness = computeFreshness(lastRecalled, now);

      if (freshness < threshold) {
        // Determine archive path
        let archivePath: string;
        if (row.file_path.includes('/memory/core/')) {
          // Core memory: replace /core/ with /archive/
          archivePath = row.file_path.replace('/memory/core/', '/memory/archive/');
        } else {
          // Project memory: insert archive/ before filename
          const dir = dirname(row.file_path);
          const file = basename(row.file_path);
          archivePath = join(dir, 'archive', file);
        }

        // Create archive dir and move file
        mkdirSync(dirname(archivePath), { recursive: true });
        renameSync(row.file_path, archivePath);

        // Update DB
        updateIndex.run(archivePath, freshness, row.id);
        deleteFts.run(row.id);

        archivedCount++;
      }
    }
  });

  archiveAll();
  return archivedCount;
}
