# Cortex CLI — Phase 3 Implementation Plan (Skill System)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Skill subsystem for cortex-cli — create, match, update, and list skills with two skill types (hard/soft), FTS search, trigger/domain matching, and scope filtering.

**Architecture:** Skills are markdown files with YAML frontmatter stored in `~/.cortex/skills/hard/` and `~/.cortex/skills/soft/` (core) or `<project>/.cortex/skills/hard|soft/` (project-scoped). SQLite `skill_index` and `skill_fts` tables (already created in Phase 1) provide indexing and full-text search. Hard skills match by trigger keywords; soft skills match by domain tags and FTS content search. Both types support core and project scopes.

**Tech Stack:** TypeScript, commander, better-sqlite3, vitest (same as Phase 1/2)

**Scope Note:** This is Phase 3. Phase 1 (scaffolding, init, soul, project) and Phase 2 (memory system) are complete with 127 tests. The `skill_index` and `skill_fts` tables already exist in the database schema.

**Project Location:** `/Users/chenxigao/repos/cortex-cli/`

---

## File Structure

```
cortex-cli/
├── src/
│   ├── cli/
│   │   └── skill-command.ts           # cortex skill match/create/update/list
│   ├── core/
│   │   └── skill.ts                   # Skill CRUD + match logic
│   └── ...existing files...
└── tests/
    ├── cli/
    │   └── skill-command.test.ts
    ├── core/
    │   └── skill.test.ts
    └── integration/
        └── phase3.test.ts
```

---

## Existing Infrastructure (from Phase 1)

**Database tables already exist** (created by `initDatabase` in Phase 1):

```sql
CREATE TABLE IF NOT EXISTS skill_index (
  id TEXT PRIMARY KEY,            -- filename without extension, e.g. 'system-design'
  file_path TEXT,
  type TEXT,                      -- 'hard' | 'soft'
  scope TEXT,                     -- 'core' | 'project'
  project TEXT,                   -- project name (null for core)
  triggers TEXT,                  -- JSON array (hard skill trigger words)
  domain TEXT,                    -- JSON array (soft skill domain tags)
  abstraction TEXT,               -- 'high' | 'medium' | 'low' (soft skill only)
  created_at DATETIME,
  updated_at DATETIME
);

CREATE VIRTUAL TABLE IF NOT EXISTS skill_fts USING fts5(
  id, content, triggers, domain, tokenize='unicode61'
);
```

**Directories** (created by `initCortexDir`):
- `<base>/.cortex/skills/hard/` — hard skills
- `<base>/.cortex/skills/soft/` — soft skills

**Paths available** from `getCortexPaths(base)`:
- `skillsDir` → `<base>/.cortex/skills`

**Strategy file** (already seeded by init):
- `~/.cortex/skills/skill-strategy.md`

**Skill file format** (from spec):

Hard skill:
```markdown
---
type: hard
triggers: ["run tests", "CI", "check pipeline"]
tools: [bash]
---

## 在这个项目中跑测试
...
```

Soft skill:
```markdown
---
type: soft
domain: [system-design, architecture]
abstraction: high
---

## 如何判断一个抽象是否合理
...
```

**Skill ID** = filename without extension. E.g. `~/.cortex/skills/soft/system-design.md` → ID `system-design`.

---

### Task 1: Skill Create (Core Logic)

**Files:**
- Create: `src/core/skill.ts`
- Test: `tests/core/skill.test.ts`

- [ ] **Step 1: Write failing test for `createSkill`**

Test that `createSkill(db, base, opts)`:
- Creates a markdown file at the correct path based on type and scope:
  - Core hard: `<base>/.cortex/skills/hard/<id>.md`
  - Core soft: `<base>/.cortex/skills/soft/<id>.md`
  - Project hard: `<projectDir>/.cortex/skills/hard/<id>.md`
  - Project soft: `<projectDir>/.cortex/skills/soft/<id>.md`
- Writes content as-is (the content already includes frontmatter from the LLM)
- Inserts a row into `skill_index` with correct fields
- Inserts into `skill_fts` with content, triggers, domain
- Returns the id
- Throws on duplicate id

```typescript
// tests/core/skill.test.ts
describe('createSkill', () => {
  it('creates a core hard skill file and indexes it', () => {
    const id = createSkill(db, tmpDir, {
      id: 'run-tests',
      content: '---\ntype: hard\ntriggers: ["run tests", "CI"]\n---\n\n## Run tests\n...',
      type: 'hard',
      scope: 'core',
      triggers: ['run tests', 'CI'],
    });
    expect(id).toBe('run-tests');
    // verify file at skills/hard/run-tests.md
    // verify skill_index row
    // verify skill_fts row
  });

  it('creates a core soft skill file and indexes it', () => {
    const id = createSkill(db, tmpDir, {
      id: 'system-design',
      content: '---\ntype: soft\ndomain: [system-design]\nabstraction: high\n---\n\n## Design\n...',
      type: 'soft',
      scope: 'core',
      domain: ['system-design', 'architecture'],
      abstraction: 'high',
    });
    // verify file at skills/soft/system-design.md
    // verify skill_index includes domain and abstraction
  });

  it('creates a project-scoped skill', () => {
    // scope: 'project', project: 'myproj', projectDir: tmpDir
    // verify file at <projectDir>/.cortex/skills/hard/<id>.md
  });

  it('throws on duplicate id', () => {
    // create same id twice → throws
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `createSkill`**

Function signature:
```typescript
interface CreateSkillOptions {
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

export function createSkill(
  db: Database.Database,
  base: string,
  opts: CreateSkillOptions
): string  // returns the id
```

Logic:
1. Validate id: only alphanumerics and hyphens (same pattern as memory slug)
2. Determine file path: `<skillsDir>/<type>/<id>.md` for core, `<projectDir>/.cortex/skills/<type>/<id>.md` for project
3. Check if file already exists → throw if so
4. Write file (create parent dir if needed)
5. INSERT into `skill_index` (created_at=now, updated_at=now, triggers/domain as JSON arrays)
6. INSERT into `skill_fts` (id, content body without frontmatter, triggers space-separated, domain space-separated)
7. Wrap DB operations in transaction
8. Return id

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 1: skill create core logic"
```

---

### Task 2: Skill Match (Core Logic)

**Files:**
- Modify: `src/core/skill.ts`
- Test: `tests/core/skill.test.ts` (add tests)

- [ ] **Step 1: Write failing test for `matchSkills`**

Test that `matchSkills(db, base, situation, opts?)`:
- For hard skills: matches by trigger keyword overlap with the situation string
- For soft skills: matches by domain tag overlap + FTS content search
- Returns results sorted: hard matches first (exact trigger hits), then soft matches (by FTS relevance)
- Each result includes: id, type, scope, triggers/domain, content (from file), score
- Can filter by scope (core only, project only, or both)
- Prioritizes current project skills when no cross-project flag

```typescript
describe('matchSkills', () => {
  it('matches hard skills by trigger keywords', () => {
    // create hard skill with triggers: ["run tests", "CI"]
    // match with situation "I need to run tests"
    // verify the hard skill is returned
  });

  it('matches soft skills by domain and content', () => {
    // create soft skill with domain: ["system-design"]
    // match with situation "system design for microservices"
    // verify the soft skill is returned
  });

  it('returns hard matches before soft matches', () => {
    // create both a hard and soft skill that match
    // verify hard skill comes first
  });

  it('scopes to core and current project by default', () => {
    // create core skill and two project skills (different projects)
    // match without cross-project
    // verify only core + current project returned
  });

  it('returns all scopes with crossProject option', () => {
    // verify all skills returned
  });

  it('returns empty array when no matches', () => { ... });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `matchSkills`**

Function signature:
```typescript
interface MatchSkillOptions {
  crossProject?: boolean;
  currentProject?: string | null;
  limit?: number;           // default 10
}

interface MatchedSkill {
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

export function matchSkills(
  db: Database.Database,
  base: string,
  situation: string,
  opts?: MatchSkillOptions
): MatchedSkill[]
```

Logic:
1. **Hard skill matching**: Query `skill_index` WHERE type='hard'. For each, parse triggers JSON, check if any trigger word appears in the situation string (case-insensitive). Score = number of trigger matches.
2. **Soft skill matching**: Use FTS5 MATCH on `skill_fts` joined with `skill_index` WHERE type='soft'. Score from FTS rank.
3. Apply scope filtering (same pattern as recallMemories): if not crossProject, WHERE scope='core' OR project=currentProject.
4. Read file content from disk for each matched skill.
5. Combine: hard matches (sorted by score DESC) first, then soft matches (sorted by FTS score DESC).
6. Limit results.
7. Handle FTS query errors gracefully (return only hard matches if FTS fails).

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 2: skill match core logic"
```

---

### Task 3: Skill Update (Core Logic)

**Files:**
- Modify: `src/core/skill.ts`
- Test: `tests/core/skill.test.ts` (add tests)

- [ ] **Step 1: Write failing test for `updateSkill`**

Test that `updateSkill(db, base, id, newContent)`:
- Overwrites the skill file with new content
- Updates `skill_fts` content (DELETE + INSERT)
- Updates `skill_index.updated_at` timestamp
- Optionally updates triggers/domain/abstraction if provided
- Throws if skill id not found

```typescript
describe('updateSkill', () => {
  it('overwrites skill file and updates index', () => {
    // create a skill, then update its content
    // verify file content changed
    // verify skill_fts updated
    // verify updated_at changed
  });

  it('updates metadata fields when provided', () => {
    // update with new triggers/domain
    // verify skill_index row updated
  });

  it('throws if skill not found', () => { ... });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `updateSkill`**

```typescript
interface UpdateSkillOptions {
  content: string;
  triggers?: string[];
  domain?: string[];
  abstraction?: string;
}

export function updateSkill(
  db: Database.Database,
  base: string,
  id: string,
  opts: UpdateSkillOptions
): void
```

Logic:
1. Look up skill in `skill_index` by id — throw if not found
2. Overwrite file at file_path with new content
3. In a transaction:
   a. UPDATE `skill_index` SET updated_at=now, and optionally triggers/domain/abstraction
   b. DELETE from `skill_fts` WHERE id=?
   c. INSERT into `skill_fts` with new content
4. Return void

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 3: skill update core logic"
```

---

### Task 4: Skill List (Core Logic)

**Files:**
- Modify: `src/core/skill.ts`
- Test: `tests/core/skill.test.ts` (add tests)

- [ ] **Step 1: Write failing test for `listSkills`**

Test that `listSkills(db, opts?)`:
- Returns all skills from `skill_index`, sorted by `updated_at DESC`
- Can filter by type (hard/soft)
- Can filter by scope (core/project)
- Can filter by project
- Returns id, type, scope, project, triggers, domain, abstraction, created_at, updated_at

```typescript
describe('listSkills', () => {
  it('lists all skills sorted by updated_at DESC', () => { ... });
  it('filters by type', () => { ... });
  it('filters by scope', () => { ... });
  it('returns empty array when no skills', () => { ... });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `listSkills`**

```typescript
interface ListSkillsOptions {
  type?: 'hard' | 'soft';
  scope?: 'core' | 'project';
  project?: string;
}

interface SkillListItem {
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

export function listSkills(
  db: Database.Database,
  opts?: ListSkillsOptions
): SkillListItem[]
```

Logic:
1. SELECT from `skill_index`, ORDER BY `updated_at DESC`
2. Filter by type if given
3. Filter by scope if given
4. Filter by project if given
5. Parse JSON arrays for triggers and domain
6. Return results

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 4: skill list core logic"
```

---

### Task 5: Skill CLI Commands

**Files:**
- Create: `src/cli/skill-command.ts`
- Modify: `src/cli/program.ts`
- Test: `tests/cli/skill-command.test.ts`

CLI commands:

```
cortex skill match --situation <desc> [--cross-project] [--home <path>]
cortex skill create --type <hard|soft> --id <id> [--domain <domains>] [--triggers <triggers>] [--abstraction <level>] [--scope <core|project>] [--project <name>] [--project-dir <dir>] --content <content> [--home <path>]
cortex skill update <skill-id> --content <content> [--triggers <triggers>] [--domain <domains>] [--abstraction <level>] [--home <path>]
cortex skill list [--type <hard|soft>] [--scope <core|project>] [--home <path>]
```

- [ ] **Step 1: Write failing test**

```typescript
describe('skill command', () => {
  it('registers skill as a subcommand with match, create, update, list', () => { ... });

  it('skill create creates a hard skill', () => {
    // cortex skill create --type hard --id "test-skill" --triggers "test,CI" --content "..." --home tmpDir
    // verify output contains the skill id
  });

  it('skill match returns matching skills', () => {
    // create a skill, then match by situation
    // verify output contains the skill
  });

  it('skill list shows skills', () => {
    // create a skill, then list
    // verify output contains the skill id
  });

  it('skill update modifies a skill', () => {
    // create a skill, update it, verify updated content
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `registerSkillCommand`**

Each subcommand follows the established pattern (same as memory-command.ts):
1. Resolve base from `--home`
2. Open database with `getDatabase`
3. Perform operation
4. Close database in `finally`
5. Print result

For `skill create`:
- `--type` required (hard|soft)
- `--id` required (skill identifier/filename)
- `--triggers` comma-separated (for hard skills)
- `--domain` comma-separated (for soft skills)
- `--abstraction` optional (high|medium|low, for soft skills)
- `--scope` defaults to 'core'
- `--content` required
- `--project` and `--project-dir` for project scope
- Print created skill id

For `skill match`:
- `--situation` required
- `--cross-project` boolean flag
- Print each match: id, type, triggers/domain, content snippet
- Print "No matching skills found." if empty

For `skill list`:
- `--type` optional filter
- `--scope` optional filter
- Print table-like list: id, type, scope, triggers/domain
- Print "No skills found." if empty

For `skill update`:
- `<skill-id>` required argument
- `--content` required
- `--triggers`, `--domain`, `--abstraction` optional metadata updates
- Print confirmation

- [ ] **Step 3: Update `program.ts`** to register skill command.

Run: `npm test` — Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "task 5: skill CLI commands"
```

---

### Task 6: Update Bootstrap Skill

**Files:**
- Modify: `src/core/bootstrap.ts`
- Test: `tests/core/bootstrap.test.ts` (update assertions if needed)

- [ ] **Step 1: Update `getBootstrapSkillContent`** to include skill system guidance:
- Add `cortex skill create` command reference with `--type`, `--id`, `--triggers`, `--domain`, `--content` options
- Add `cortex skill update` command reference
- Add `cortex skill list` command reference
- Add guidance on when to create skills (3+ similar patterns → extract as skill)
- Add guidance on hard vs soft skill selection
- **Add reference to `~/.cortex/skills/skill-strategy.md`** — instruct the LLM to consult this file and update it during growth reflections when it discovers its skill extraction strategy can be improved
- Add guidance on the memory-to-skill upgrade path: "当你发现多条记忆指向同一个能力模式时，考虑将它们升华为一个 skill"

- [ ] **Step 2: Run tests** — ensure existing bootstrap tests still pass, update assertions for new command references.

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 6: update bootstrap skill with skill system guidance"
```

---

### Task 7: Phase 3 Integration Test

**Files:**
- Create: `tests/integration/phase3.test.ts`

- [ ] **Step 1: Write integration test** — Single test covering full skill lifecycle:
1. `cortex init` (setup)
2. `cortex skill create --type hard --id "run-tests" --triggers "test,CI" --content "..."` — create a hard skill
3. `cortex skill create --type soft --id "code-review" --domain "review,quality" --abstraction high --content "..."` — create a soft skill
4. `cortex skill list` — verify both skills appear
5. `cortex skill list --type hard` — verify only hard skill
6. `cortex skill match --situation "run tests"` — verify hard skill matched
7. `cortex skill match --situation "code review"` — verify soft skill matched
8. `cortex skill update run-tests --content "Updated content..."` — update hard skill
9. Verify updated content on disk and in DB
10. `cortex skill list` — verify updated_at changed

Run: `npm test` — Expected: PASS

- [ ] **Step 2: Verify build**
```bash
npm run build
```

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 7: Phase 3 integration test"
```

---

## Key Design Decisions

1. **Skill ID is explicit** — provided by the LLM via `--id` flag, not auto-generated. The ID becomes the filename. This differs from memory where the ID is auto-generated with a timestamp prefix.
2. **Content includes frontmatter** — the full markdown content (including YAML frontmatter) is passed via `--content`. The CLI does not parse or generate frontmatter. The LLM constructs the complete skill file content.
3. **Triggers and domain are separate from content** — even though frontmatter contains them, the CLI also accepts them as flags for indexing in `skill_index`. This allows the DB index to be maintained independently of file parsing.
4. **Hard skills match by trigger overlap** — simple case-insensitive substring matching of trigger phrases against the situation string. No FTS needed for triggers.
5. **Soft skills match by FTS + domain** — FTS5 MATCH for content relevance, plus domain tag overlap for contextual relevance.
6. **No freshness/decay for skills** — unlike memories, skills don't decay. They are updated explicitly. The `updated_at` timestamp tracks when a skill was last modified.
7. **`base` parameter threading** — consistent with Phase 1/2 pattern. All functions accept optional base, tests pass temp dirs.

## Verification

After all tasks complete:
```bash
cd /Users/chenxigao/repos/cortex-cli
npm test                    # All tests pass
npm run build               # TypeScript compiles
node dist/main.js skill --help    # Shows skill subcommands
```
