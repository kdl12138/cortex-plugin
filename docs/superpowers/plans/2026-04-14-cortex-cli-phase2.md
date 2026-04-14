# Cortex CLI — Phase 2 Implementation Plan (Memory System)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Memory subsystem for cortex-cli — write, recall, list, and garbage-collect memories with FTS search, freshness decay, cross-project recall, and archive/forget support.

**Architecture:** Memories are markdown files stored in `~/.cortex/memory/core/` (global) or `<project>/.cortex/memory/` (project-scoped). SQLite `memory_index` and `memory_fts` tables (already created in Phase 1) provide indexing and full-text search. Each memory has a freshness score (0.0–1.0) that decays logarithmically over time and resets on recall. Garbage collection archives low-freshness memories by moving files to `archive/` and removing them from FTS.

**Tech Stack:** TypeScript, commander, better-sqlite3, vitest (same as Phase 1)

**Scope Note:** This is Phase 2. Phase 1 (project scaffolding, init, soul, project management) is complete. The `memory_index` and `memory_fts` tables already exist in the database schema. This phase adds the core logic and CLI commands to use them.

**Project Location:** `/Users/chenxigao/repos/cortex-cli/`

---

## File Structure

```
cortex-cli/
├── src/
│   ├── cli/
│   │   └── memory-command.ts          # cortex memory recall/write/list/gc
│   ├── core/
│   │   ├── memory.ts                  # Memory CRUD + recall + gc logic
│   │   └── freshness.ts               # Freshness decay algorithm
│   └── ...existing files...
└── tests/
    ├── cli/
    │   └── memory-command.test.ts
    ├── core/
    │   ├── memory.test.ts
    │   └── freshness.test.ts
    └── integration/
        └── phase2.test.ts
```

---

## Existing Infrastructure (from Phase 1)

**Database tables already exist** (created by `initDatabase` in Phase 1):

```sql
CREATE TABLE IF NOT EXISTS memory_index (
  id TEXT PRIMARY KEY,          -- filename without extension, e.g. '1744531200000-sqlite-fts5-cjk'
  file_path TEXT,               -- full absolute path to .md file
  scope TEXT,                   -- 'core' | 'project'
  project TEXT,                 -- project name (null for core memories)
  created_at DATETIME,
  last_recalled DATETIME,
  recall_count INTEGER,
  freshness REAL,               -- 0.0 ~ 1.0
  tags TEXT                     -- JSON array, e.g. '["sqlite","fts5","cjk"]'
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
  id, content, tags, tokenize='unicode61'
);
```

**Paths available** from `getCortexPaths(base)`:
- `memoryDir` → `<base>/.cortex/memory`

**Subdirectories** (created by `initCortexDir`):
- `<base>/.cortex/memory/core/` — core memories
- `<base>/.cortex/memory/archive/` — archived (forgotten) memories

**Memory file naming convention** (from spec):
- Format: `<timestamp>-<slug>.md` where timestamp is milliseconds (e.g. `1744531200000`)
- `id` in DB = filename without `.md` extension
- Core: `~/.cortex/memory/core/1744531200000-sqlite-fts5-cjk.md`
- Project: `<project>/.cortex/memory/1744531200000-deploy-config-gotcha.md`

**Memory file format**:
```markdown
---
created: 2026-04-13
tags: [sqlite, fts5, cjk]
---

Content here in narrative form...
```

---

### Task 1: Freshness Decay Module

**Files:**
- Create: `src/core/freshness.ts`
- Test: `tests/core/freshness.test.ts`

The freshness score models how "fresh" a memory is. It starts at 1.0 when created or recalled, then decays logarithmically over time — fast at first, slowing over time, mimicking human memory.

**Decay formula:** `freshness = 1.0 / (1.0 + k * ln(1 + hoursElapsed))` where `k` is a decay constant (use `k = 0.1`). This gives:
- After 1 hour: ~0.99
- After 1 day: ~0.97
- After 1 week: ~0.66
- After 1 month: ~0.41
- After 6 months: ~0.12

- [ ] **Step 1: Write failing test**

```typescript
// tests/core/freshness.test.ts
import { describe, it, expect } from 'vitest';
import { computeFreshness } from '../../src/core/freshness.js';

describe('computeFreshness', () => {
  it('returns 1.0 when no time has elapsed', () => {
    const now = new Date();
    expect(computeFreshness(now, now)).toBeCloseTo(1.0);
  });

  it('returns high freshness after 1 hour', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const f = computeFreshness(oneHourAgo, now);
    expect(f).toBeGreaterThan(0.9);
    expect(f).toBeLessThan(1.0);
  });

  it('returns moderate freshness after 1 week', () => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const f = computeFreshness(oneWeekAgo, now);
    expect(f).toBeGreaterThan(0.5);
    expect(f).toBeLessThan(0.8);
  });

  it('returns low freshness after 6 months', () => {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const f = computeFreshness(sixMonthsAgo, now);
    expect(f).toBeGreaterThan(0.05);
    expect(f).toBeLessThan(0.2);
  });

  it('is monotonically decreasing', () => {
    const now = new Date();
    const values = [1, 24, 168, 720, 4320].map((hours) => {
      const past = new Date(now.getTime() - hours * 60 * 60 * 1000);
      return computeFreshness(past, now);
    });
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });

  it('always returns a value between 0 and 1', () => {
    const now = new Date();
    const veryOld = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
    const f = computeFreshness(veryOld, now);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThanOrEqual(1.0);
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `computeFreshness`**

```typescript
// src/core/freshness.ts
const DECAY_K = 0.1;

/**
 * Compute the freshness of a memory based on elapsed time.
 * Returns a value between 0.0 and 1.0.
 * Uses logarithmic decay: 1 / (1 + k * ln(1 + hours)).
 */
export function computeFreshness(lastActive: Date, now: Date): number {
  const msElapsed = now.getTime() - lastActive.getTime();
  const hoursElapsed = Math.max(0, msElapsed / (1000 * 60 * 60));
  return 1.0 / (1.0 + DECAY_K * Math.log(1 + hoursElapsed));
}
```

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 1: freshness decay module"
```

---

### Task 2: Memory Write (Core Logic)

**Files:**
- Create: `src/core/memory.ts`
- Test: `tests/core/memory.test.ts`

- [ ] **Step 1: Write failing test for `writeMemory`**

Test that `writeMemory(db, base, { content, scope, tags, slug })`:
- Creates a markdown file with frontmatter at the correct path (core: `memory/core/<id>.md`, project: `<projectDir>/memory/<id>.md`)
- Inserts a row into `memory_index` with correct fields (id, file_path, scope, project, created_at, recall_count=0, freshness=1.0, tags as JSON)
- Inserts into `memory_fts` with content and tags
- Returns the generated id
- The id format is `<timestamp>-<slug>`

Test both core scope and project scope.

```typescript
// tests/core/memory.test.ts — partial sketch
describe('writeMemory', () => {
  it('writes a core memory file and indexes it', () => {
    // setup: initCortexDir + initDatabase in tmpDir
    const id = writeMemory(db, tmpDir, {
      content: 'Learned something about FTS5 tokenizers.',
      scope: 'core',
      tags: ['sqlite', 'fts5'],
      slug: 'fts5-tokenizer-lesson',
    });
    // verify file exists at memory/core/<id>.md
    // verify file has frontmatter with created date and tags
    // verify file body matches content
    // verify memory_index row: scope='core', project=null, freshness=1.0, recall_count=0
    // verify memory_fts row: content matches
  });

  it('writes a project memory file', () => {
    // scope: 'project', project: 'my-project', projectDir: '/path/to/project'
    // verify file at <projectDir>/.cortex/memory/<id>.md
    // verify memory_index row: scope='project', project='my-project'
  });

  it('generates a timestamped id with slug', () => {
    // verify id matches pattern /^\d+-fts5-tokenizer-lesson$/
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `writeMemory`**

Function signature:
```typescript
interface WriteMemoryOptions {
  content: string;
  scope: 'core' | 'project';
  tags: string[];
  slug: string;
  project?: string;       // required when scope='project'
  projectDir?: string;    // required when scope='project'
}

export function writeMemory(
  db: Database.Database,
  base: string,
  opts: WriteMemoryOptions
): string  // returns the generated id
```

Logic:
1. Generate id: `${Date.now()}-${slug}`
2. Determine file path based on scope:
   - core: `getCortexPaths(base).memoryDir + '/core/' + id + '.md'`
   - project: `opts.projectDir + '/.cortex/memory/' + id + '.md'`
3. Build markdown content with frontmatter (`created`, `tags`)
4. Write file (create parent dir if needed)
5. INSERT into `memory_index` (freshness=1.0, recall_count=0, created_at=now, last_recalled=now)
6. INSERT into `memory_fts` (id, content, tags as space-separated string)
7. Return id

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 2: memory write core logic"
```

---

### Task 3: Memory Recall (Core Logic)

**Files:**
- Modify: `src/core/memory.ts`
- Test: `tests/core/memory.test.ts` (add tests)

- [ ] **Step 1: Write failing test for `recallMemories`**

Test that `recallMemories(db, base, query, opts?)`:
- Returns memories matching the query via FTS, sorted by relevance * freshness
- Each result includes: id, content (file body), tags, freshness, scope, created_at
- Updates `last_recalled` and `recall_count` for returned memories
- Resets `freshness` to 1.0 for recalled memories
- With `--cross-project` option, searches all scopes
- Without `--cross-project`, only returns core memories and current project memories
- Returns empty array when no matches
- When few results found, also searches archive (extending recall to archived memories)

```typescript
describe('recallMemories', () => {
  it('finds memories by FTS query', () => {
    // write two memories, recall by keyword
    // verify matching memory returned with content
  });

  it('sorts by freshness-weighted relevance', () => {
    // write two memories with same keyword
    // manually lower freshness on one
    // verify fresher one ranks higher
  });

  it('updates recall metadata on returned memories', () => {
    // recall a memory
    // verify recall_count incremented
    // verify last_recalled updated
    // verify freshness reset to 1.0
  });

  it('scopes to core and current project by default', () => {
    // write core memory and two project memories (different projects)
    // recall without cross-project
    // verify only core + current project returned
  });

  it('returns all scopes with crossProject option', () => {
    // same setup, recall with crossProject: true
    // verify all memories returned
  });

  it('returns empty array when no matches', () => {
    // recall a query with no matching memories
  });

  it('falls back to archive when few results', () => {
    // write a memory, archive it (move to archive, remove from FTS)
    // recall — should find it in archive fallback
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `recallMemories`**

Function signature:
```typescript
interface RecallOptions {
  crossProject?: boolean;
  currentProject?: string | null;
  limit?: number;           // default 10
}

interface RecalledMemory {
  id: string;
  content: string;
  tags: string[];
  freshness: number;
  scope: string;
  project: string | null;
  created_at: string;
  score: number;            // combined relevance score
}

export function recallMemories(
  db: Database.Database,
  base: string,
  query: string,
  opts?: RecallOptions
): RecalledMemory[]
```

Logic:
1. Search `memory_fts` with FTS5 MATCH query, JOIN with `memory_index`
2. Filter by scope: if not crossProject, only return rows where `scope='core'` OR `project=currentProject`
3. Exclude archived memories (where file_path contains '/archive/')
4. Compute current freshness for each result using `computeFreshness`
5. Score = FTS rank * freshness
6. Sort by score DESC, limit results
7. For each returned memory, read the file content from disk
8. Update `last_recalled`, increment `recall_count`, set `freshness=1.0` for returned memories
9. If results.length < 3, also search for archived memories by querying `memory_index` directly (WHERE file_path LIKE '%/archive/%') with tag matching and content keyword search (read files from disk). Archived memories are NOT in `memory_fts` (removed during gc), so FTS cannot be used for this fallback. Append any archive hits to the results.
10. Return results

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 3: memory recall core logic"
```

---

### Task 4: Memory List (Core Logic)

**Files:**
- Modify: `src/core/memory.ts`
- Test: `tests/core/memory.test.ts` (add tests)

- [ ] **Step 1: Write failing test for `listMemories`**

Test that `listMemories(db, opts?)`:
- Returns all memories from `memory_index`, sorted by `created_at DESC`
- Can filter by scope (core/project)
- Can include archived memories with `archived: true`
- By default excludes archived memories
- Returns id, scope, project, tags, created_at, freshness (computed live)

```typescript
describe('listMemories', () => {
  it('lists all non-archived memories sorted by created_at DESC', () => { ... });
  it('filters by scope', () => { ... });
  it('excludes archived by default', () => { ... });
  it('includes archived when option set', () => { ... });
  it('returns empty array when no memories', () => { ... });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `listMemories`**

```typescript
interface ListMemoriesOptions {
  scope?: 'core' | 'project';
  archived?: boolean;
  project?: string;
}

interface MemoryListItem {
  id: string;
  scope: string;
  project: string | null;
  tags: string[];
  created_at: string;
  freshness: number;
}

export function listMemories(
  db: Database.Database,
  opts?: ListMemoriesOptions
): MemoryListItem[]
```

Logic:
1. SELECT from `memory_index`, ORDER BY `created_at DESC`
2. Filter: if `scope` given, WHERE scope=?
3. Filter: if `project` given, WHERE project=?
4. Filter: if not `archived`, exclude rows where file_path contains '/archive/'
5. Compute live freshness for each row using `computeFreshness(last_recalled, now)`
6. Return results

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 4: memory list core logic"
```

---

### Task 5: Memory Garbage Collection (Core Logic)

**Files:**
- Modify: `src/core/memory.ts`
- Test: `tests/core/memory.test.ts` (add tests)

- [ ] **Step 1: Write failing test for `gcMemories`**

Test that `gcMemories(db, base, opts?)`:
- Scans all non-archived memories and computes live freshness
- Memories with freshness below threshold (default 0.1) are archived:
  1. File moved from `core/<id>.md` to `archive/<id>.md`
  2. `file_path` updated in `memory_index`
  3. Row removed from `memory_fts`
- Returns count of archived memories
- Does not touch already-archived memories
- Respects custom threshold

```typescript
describe('gcMemories', () => {
  it('archives memories below freshness threshold', () => {
    // write a memory, manually set last_recalled to a very old date
    // run gc
    // verify file moved to archive/
    // verify memory_index file_path updated
    // verify memory_fts row removed
  });

  it('preserves fresh memories', () => {
    // write a recent memory
    // run gc
    // verify not archived
  });

  it('returns count of archived memories', () => { ... });

  it('does not touch already-archived memories', () => { ... });

  it('respects custom threshold', () => { ... });

  it('archives project-scoped memories to project archive dir', () => {
    // write a project memory, manually set last_recalled to very old date
    // run gc
    // verify file moved to <projectDir>/.cortex/memory/archive/<id>.md
    // verify memory_index file_path updated
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `gcMemories`**

```typescript
interface GcOptions {
  threshold?: number;  // default 0.1
}

export function gcMemories(
  db: Database.Database,
  base: string,
  opts?: GcOptions
): number  // returns count of archived
```

Logic:
1. SELECT all non-archived from `memory_index` (WHERE file_path NOT LIKE '%/archive/%')
2. For each, compute live freshness via `computeFreshness`
3. If freshness < threshold:
   a. Determine archive path based on scope:
      - Core memories: replace `/core/` with `/archive/` in file_path
        (e.g. `~/.cortex/memory/core/123-slug.md` → `~/.cortex/memory/archive/123-slug.md`)
      - Project memories: insert `archive/` before the filename in the project memory path
        (e.g. `<projectDir>/.cortex/memory/123-slug.md` → `<projectDir>/.cortex/memory/archive/123-slug.md`)
   b. Create archive dir if needed (`mkdirSync({ recursive: true })`), move file (`renameSync`)
   c. UPDATE `memory_index` SET file_path = archive_path, freshness = computed value
   d. DELETE from `memory_fts` WHERE id = ?
4. Return count

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 5: memory garbage collection"
```

---

### Task 6: Memory CLI Commands

**Files:**
- Create: `src/cli/memory-command.ts`
- Modify: `src/cli/program.ts`
- Test: `tests/cli/memory-command.test.ts`

CLI commands to implement:

```
cortex memory recall <query> [--cross-project] [--home <path>]
cortex memory write --scope <core|project> --tags <tags> [--slug <slug>] [--project <name>] [--project-dir <dir>] [--home <path>]
  (content from stdin)
cortex memory list [--scope <core|project>] [--archived] [--home <path>]
cortex memory gc [--threshold <number>] [--home <path>]
```

- [ ] **Step 1: Write failing test**

```typescript
// tests/cli/memory-command.test.ts
describe('memory command', () => {
  // Setup: init cortex in tmpDir before each test

  it('registers memory as a subcommand with recall, write, list, gc', () => { ... });

  it('memory write creates a memory file', () => {
    // pipe content via --content flag (like soul edit)
    // cortex memory write --scope core --tags "sqlite,fts5" --slug "test-memory" --content "Learned something" --home tmpDir
    // verify file created in memory/core/
  });

  it('memory recall returns matching memories', () => {
    // write a memory first, then recall by keyword
    // verify output contains the memory content
  });

  it('memory list shows memories', () => {
    // write a memory, then list
    // verify output contains the memory id
  });

  it('memory gc archives old memories', () => {
    // write a memory, manually make it old in DB
    // run gc
    // verify output shows archived count
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `registerMemoryCommand`**

Each subcommand follows the established pattern:
1. Resolve base from `--home`
2. Open database with `getDatabase`
3. Perform operation
4. Close database in `finally`
5. Print result

For `memory write`: accept content via `--content` flag (same pattern as `soul edit`). The `--tags` option is a comma-separated string that gets split into an array.

For `memory recall`: print each result with its id, freshness, tags, and content snippet.

For `memory list`: print a table-like list of memories with id, scope, tags, freshness.

For `memory gc`: print count of archived memories.

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Update `program.ts`** to register memory command.

- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "task 6: memory CLI commands"
```

---

### Task 7: Update Bootstrap Skill

**Files:**
- Modify: `src/core/bootstrap.ts`
- Test: `tests/core/bootstrap.test.ts` (update assertions if needed)

- [ ] **Step 1: Update `getBootstrapSkillContent`** to include more specific memory command examples and guidance now that the memory system is functional:
- Add `cortex memory write` command reference with `--scope`, `--tags`, `--slug`, `--content` options
- Add `cortex memory list` command reference
- Add `cortex memory gc` command reference
- Enhance the "when to write memories" guidance with practical examples
- **Add reference to `~/.cortex/memory/memory-strategy.md`** — instruct the LLM to consult this file for memory strategy guidance, and to update it during growth reflections when it discovers its memory strategy can be improved (per spec: "记忆形成能力本身也在成长")

- [ ] **Step 2: Run tests** — ensure existing bootstrap tests still pass, update assertions if content keywords changed.

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 7: update bootstrap skill with memory commands"
```

---

### Task 8: Phase 2 Integration Test

**Files:**
- Create: `tests/integration/phase2.test.ts`

- [ ] **Step 1: Write integration test** — Single test covering full memory lifecycle:
1. `cortex init` (setup)
2. `cortex memory write` — write a core memory with tags
3. `cortex memory write` — write another core memory with different tags
4. `cortex memory list` — verify both memories appear
5. `cortex memory recall <query>` — verify relevant memory returned
6. `cortex memory recall --cross-project <query>` — verify works
7. Verify recall updated recall_count and last_recalled in DB
8. `cortex memory gc` — verify no memories archived (all fresh)
9. Manually set one memory's last_recalled to very old date in DB
10. `cortex memory gc` — verify one memory archived
11. `cortex memory list --archived` — verify archived memory appears
12. `cortex memory recall <query>` for archived memory — verify archive fallback works

Run: `npm test` — Expected: PASS

- [ ] **Step 2: Verify build**
```bash
npm run build
```

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 8: Phase 2 integration test"
```

---

## Key Design Decisions

1. **`computeFreshness` is a pure function** — takes two dates, returns a number. No DB access. Easy to test and reason about.
2. **Freshness is computed live** — not stored as a static value during recall/list. The stored `freshness` value in `memory_index` is only updated during gc (to persist the computed value) and reset to 1.0 on recall.
3. **Archive = move file + update path + remove from FTS** — archived memories are still in `memory_index` (queryable for list --archived), but not in FTS (not found by normal recall). The archive fallback in recall searches `memory_index` directly when results are few.
4. **Content via `--content` flag** — same pattern as `soul edit`. Stdin support can be added later.
5. **Slug provided by caller** — the LLM generates the slug when calling `cortex memory write`. The CLI doesn't auto-generate slugs from content.
6. **Project memories require explicit `--project` and `--project-dir`** — the CLI doesn't auto-detect these. The bootstrap skill instructs the LLM to provide them based on context.
7. **`base` parameter threading** — consistent with Phase 1 pattern. All functions accept optional base, tests pass temp dirs.

## Verification

After all tasks complete:
```bash
cd /Users/chenxigao/repos/cortex-cli
npm test                    # All tests pass
npm run build               # TypeScript compiles
node dist/main.js memory --help    # Shows memory subcommands
```
