import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import Database from 'better-sqlite3';
import { getCortexPaths } from '../utils/paths.js';

export interface CreateSkillOptions {
  id: string;                    // filename without extension
  content: string;               // full markdown content (includes frontmatter)
  type: 'hard' | 'soft';
  scope: 'core' | 'project';
  triggers?: string[];           // for hard skills
  domain?: string[];             // for soft skills
  abstraction?: string;          // for soft skills: 'high' | 'medium' | 'low'
  project?: string;              // required when scope='project'
  projectDir?: string;           // required when scope='project'
}

/**
 * Create a skill markdown file and index it in SQLite.
 * Returns the skill id.
 */
export function createSkill(
  db: Database.Database,
  base: string,
  opts: CreateSkillOptions
): string {
  // 1. Validate id: only alphanumerics and hyphens
  if (!/^[a-z0-9-]+$/i.test(opts.id)) {
    throw new Error(`Invalid skill id: "${opts.id}". Only alphanumerics and hyphens are allowed.`);
  }

  // 2. Determine file path
  let filePath: string;
  if (opts.scope === 'core') {
    const { skillsDir } = getCortexPaths(base);
    filePath = join(skillsDir, opts.type, `${opts.id}.md`);
  } else {
    if (!opts.projectDir) {
      throw new Error('projectDir is required when scope is "project"');
    }
    filePath = join(opts.projectDir, '.cortex', 'skills', opts.type, `${opts.id}.md`);
  }

  // 3. Check if id already exists in skill_index
  const existing = db.prepare('SELECT id FROM skill_index WHERE id = ?').get(opts.id);
  if (existing) {
    throw new Error(`Skill already exists: "${opts.id}"`);
  }

  // 4. Write file (create parent dir if needed)
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, opts.content, 'utf-8');

  // 5-7. INSERT into skill_index and skill_fts in a transaction
  const now = new Date().toISOString();

  const triggersJson = opts.triggers ? JSON.stringify(opts.triggers) : null;
  const domainJson = opts.domain ? JSON.stringify(opts.domain) : null;
  const triggersFts = opts.triggers ? opts.triggers.join(' ') : '';
  const domainFts = opts.domain ? opts.domain.join(' ') : '';

  const insertIndex = db.prepare(
    `INSERT INTO skill_index (id, file_path, type, scope, project, triggers, domain, abstraction, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertFts = db.prepare(
    `INSERT INTO skill_fts (id, content, triggers, domain) VALUES (?, ?, ?, ?)`
  );

  const runBoth = db.transaction(() => {
    insertIndex.run(
      opts.id,
      filePath,
      opts.type,
      opts.scope,
      opts.scope === 'project' ? opts.project ?? null : null,
      triggersJson,
      domainJson,
      opts.abstraction ?? null,
      now,
      now
    );
    insertFts.run(opts.id, opts.content, triggersFts, domainFts);
  });

  runBoth();

  // 8. Return id
  return opts.id;
}

export interface UpdateSkillOptions {
  content: string;
  triggers?: string[];
  domain?: string[];
  abstraction?: string;
}

/**
 * Update an existing skill's file content and index entries.
 */
export function updateSkill(
  db: Database.Database,
  base: string,
  id: string,
  opts: UpdateSkillOptions
): void {
  // 1. Look up skill in skill_index by id — throw if not found
  const existing = db.prepare('SELECT id, file_path FROM skill_index WHERE id = ?').get(id) as
    | { id: string; file_path: string }
    | undefined;
  if (!existing) {
    throw new Error(`Skill not found: "${id}"`);
  }

  // 2. Overwrite file at file_path with new content
  writeFileSync(existing.file_path, opts.content, 'utf-8');

  // 3. In a transaction: UPDATE skill_index, DELETE+INSERT skill_fts
  const now = new Date().toISOString();

  // Strip YAML frontmatter for FTS content
  const ftsContent = opts.content.replace(/^---[\s\S]*?---\n?/, '').trimStart();

  const triggersFts = opts.triggers ? opts.triggers.join(' ') : null;
  const domainFts = opts.domain ? opts.domain.join(' ') : null;

  // Build UPDATE statement: always update updated_at, optionally triggers/domain/abstraction
  const setParts: string[] = ['updated_at = ?'];
  const setValues: any[] = [now];

  if (opts.triggers !== undefined) {
    setParts.push('triggers = ?');
    setValues.push(JSON.stringify(opts.triggers));
  }
  if (opts.domain !== undefined) {
    setParts.push('domain = ?');
    setValues.push(JSON.stringify(opts.domain));
  }
  if (opts.abstraction !== undefined) {
    setParts.push('abstraction = ?');
    setValues.push(opts.abstraction);
  }

  const updateIndex = db.prepare(
    `UPDATE skill_index SET ${setParts.join(', ')} WHERE id = ?`
  );
  const deleteFts = db.prepare('DELETE FROM skill_fts WHERE id = ?');

  // For FTS insert: use updated triggers/domain if provided, else fetch from current index
  const runTransaction = db.transaction(() => {
    updateIndex.run(...setValues, id);

    deleteFts.run(id);

    // Get current triggers/domain for FTS if not provided in opts
    let insertTriggersFts = triggersFts;
    let insertDomainFts = domainFts;

    if (insertTriggersFts === null || insertDomainFts === null) {
      const currentRow = db
        .prepare('SELECT triggers, domain FROM skill_index WHERE id = ?')
        .get(id) as { triggers: string | null; domain: string | null } | undefined;
      if (currentRow) {
        if (insertTriggersFts === null) {
          try {
            const parsed: string[] = currentRow.triggers ? JSON.parse(currentRow.triggers) : [];
            insertTriggersFts = parsed.join(' ');
          } catch {
            insertTriggersFts = '';
          }
        }
        if (insertDomainFts === null) {
          try {
            const parsed: string[] = currentRow.domain ? JSON.parse(currentRow.domain) : [];
            insertDomainFts = parsed.join(' ');
          } catch {
            insertDomainFts = '';
          }
        }
      }
    }

    db.prepare('INSERT INTO skill_fts (id, content, triggers, domain) VALUES (?, ?, ?, ?)').run(
      id,
      ftsContent,
      insertTriggersFts ?? '',
      insertDomainFts ?? ''
    );
  });

  runTransaction();
}

export interface ListSkillsOptions {
  type?: 'hard' | 'soft';
  scope?: 'core' | 'project';
  project?: string;
}

export interface SkillListItem {
  id: string;
  type: string;
  scope: string;
  project: string | null;
  triggers: string[];
  domain: string[];
  abstraction: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * List skills from the index, with optional filtering by type, scope, and project.
 * Returns results sorted by updated_at DESC.
 */
export function listSkills(
  db: Database.Database,
  opts?: ListSkillsOptions
): SkillListItem[] {
  let sql = `SELECT id, type, scope, project, triggers, domain, abstraction, created_at, updated_at
             FROM skill_index
             WHERE 1=1`;
  const params: any[] = [];

  if (opts?.type) {
    sql += ` AND type = ?`;
    params.push(opts.type);
  }

  if (opts?.scope) {
    sql += ` AND scope = ?`;
    params.push(opts.scope);
  }

  if (opts?.project) {
    sql += ` AND project = ?`;
    params.push(opts.project);
  }

  sql += ` ORDER BY updated_at DESC`;

  const rows = db.prepare(sql).all(...params) as any[];

  return rows.map((row) => {
    let triggers: string[] = [];
    try {
      triggers = row.triggers ? JSON.parse(row.triggers) : [];
    } catch {
      triggers = [];
    }

    let domain: string[] = [];
    try {
      domain = row.domain ? JSON.parse(row.domain) : [];
    } catch {
      domain = [];
    }

    return {
      id: row.id,
      type: row.type,
      scope: row.scope,
      project: row.project ?? null,
      triggers,
      domain,
      abstraction: row.abstraction ?? null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  });
}

export interface MatchSkillOptions {
  crossProject?: boolean;
  currentProject?: string | null;
  limit?: number;           // default 10
}

export interface MatchedSkill {
  id: string;
  type: string;
  scope: string;
  project: string | null;
  triggers: string[];
  domain: string[];
  abstraction: string | null;
  content: string;
  score: number;
}

/**
 * Match skills against a situation string using hard-skill trigger matching
 * and soft-skill FTS5 search, with scope filtering and result limiting.
 */
export function matchSkills(
  db: Database.Database,
  base: string,
  situation: string,
  opts?: MatchSkillOptions
): MatchedSkill[] {
  const limit = opts?.limit ?? 10;
  const crossProject = opts?.crossProject ?? false;
  const currentProject = opts?.currentProject ?? null;

  // --- Hard skill matching ---
  // Query all hard skills from skill_index with scope filtering
  let hardSql = `
    SELECT id, file_path, type, scope, project, triggers, domain, abstraction
    FROM skill_index
    WHERE type = 'hard'
  `;
  const hardParams: any[] = [];

  if (!crossProject) {
    if (currentProject) {
      hardSql += ` AND (scope = 'core' OR project = ?)`;
      hardParams.push(currentProject);
    } else {
      hardSql += ` AND scope = 'core'`;
    }
  }

  const hardRows = db.prepare(hardSql).all(...hardParams) as any[];

  const situationLower = situation.toLowerCase();
  const hardMatches: (MatchedSkill & { _file_path: string })[] = [];

  for (const row of hardRows) {
    let triggers: string[] = [];
    try {
      triggers = row.triggers ? JSON.parse(row.triggers) : [];
    } catch {
      triggers = [];
    }

    // Count how many triggers appear in the situation (case-insensitive)
    let triggerScore = 0;
    for (const trigger of triggers) {
      if (situationLower.includes(trigger.toLowerCase())) {
        triggerScore++;
      }
    }

    if (triggerScore > 0) {
      let domain: string[] = [];
      try {
        domain = row.domain ? JSON.parse(row.domain) : [];
      } catch {
        domain = [];
      }

      hardMatches.push({
        id: row.id,
        type: row.type,
        scope: row.scope,
        project: row.project ?? null,
        triggers,
        domain,
        abstraction: row.abstraction ?? null,
        content: '',
        score: triggerScore,
        _file_path: row.file_path,
      });
    }
  }

  // Sort hard matches by score descending
  hardMatches.sort((a, b) => b.score - a.score);

  // --- Soft skill matching ---
  let softMatches: (MatchedSkill & { _file_path: string })[] = [];
  try {
    // Sanitize the situation string for FTS5 query:
    // Split into words, keep only alphanumeric tokens, join with OR
    const ftsTokens = situation
      .split(/\s+/)
      .map((w) => w.replace(/[^a-zA-Z0-9]/g, ''))
      .filter((w) => w.length > 0);

    if (ftsTokens.length === 0) {
      // No valid tokens — skip FTS
      softMatches = [];
    } else {
      const ftsQuery = ftsTokens.join(' OR ');

      let softSql = `
        SELECT
          si.id, si.file_path, si.type, si.scope, si.project,
          si.triggers, si.domain, si.abstraction,
          fts.rank AS fts_rank
        FROM skill_fts fts
        JOIN skill_index si ON si.id = fts.id
        WHERE skill_fts MATCH ?
          AND si.type = 'soft'
      `;
      const softParams: any[] = [ftsQuery];

      if (!crossProject) {
        if (currentProject) {
          softSql += ` AND (si.scope = 'core' OR si.project = ?)`;
          softParams.push(currentProject);
        } else {
          softSql += ` AND si.scope = 'core'`;
        }
      }

      softSql += ` ORDER BY fts.rank ASC LIMIT ?`;
      softParams.push(limit);

      const softRows = db.prepare(softSql).all(...softParams) as any[];

      softMatches = softRows.map((row) => {
        let triggers: string[] = [];
        try {
          triggers = row.triggers ? JSON.parse(row.triggers) : [];
        } catch {
          triggers = [];
        }

        let domain: string[] = [];
        try {
          domain = row.domain ? JSON.parse(row.domain) : [];
        } catch {
          domain = [];
        }

        return {
          id: row.id,
          type: row.type,
          scope: row.scope,
          project: row.project ?? null,
          triggers,
          domain,
          abstraction: row.abstraction ?? null,
          content: '',
          score: -row.fts_rank, // Negate rank: FTS5 rank is negative, lower = better
          _file_path: row.file_path,
        };
      });

      // Sort soft matches by score descending (higher = better)
      softMatches.sort((a, b) => b.score - a.score);
    }
  } catch {
    // FTS query errors (invalid syntax, etc.) — return only hard matches
    softMatches = [];
  }

  // --- Combine: hard first, then soft ---
  const combined = [...hardMatches, ...softMatches];

  // Limit results
  const limited = combined.slice(0, limit);

  // Read file content from disk for each matched skill
  for (const skill of limited) {
    const filePath = (skill as any)._file_path;
    try {
      if (existsSync(filePath)) {
        skill.content = readFileSync(filePath, 'utf-8');
      }
    } catch {
      // If file can't be read, leave content empty
    }
  }

  // Clean up internal _file_path property and return
  return limited.map(({ _file_path, ...rest }) => rest);
}
