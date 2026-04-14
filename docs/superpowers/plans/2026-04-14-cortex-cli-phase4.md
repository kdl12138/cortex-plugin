# Cortex CLI — Phase 4 Implementation Plan (Growth System)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Growth subsystem for cortex-cli — log daily growth reflections and generate narrative growth reports from accumulated logs.

**Architecture:** Growth logs are plain text files stored in `~/.cortex/growth/`, one file per day (e.g. `2026-04-14.log`), append-only. No database tables needed — logs are purely file-based. The `cortex growth log` command appends a timestamped entry. The `cortex growth report` command reads recent log files and outputs the raw log content for the LLM to organize into a narrative report.

**Tech Stack:** TypeScript, commander, better-sqlite3 (only for `getDatabase` in report to read recent skill/soul changes), vitest

**Scope Note:** This is Phase 4. Phases 1-3 (scaffolding, memory, skill) are complete with 163 tests. Growth is the simplest subsystem — just file append and file read operations. No new database tables are needed.

**Project Location:** `/Users/chenxigao/repos/cortex-cli/`

---

## File Structure

```
cortex-cli/
├── src/
│   ├── cli/
│   │   └── growth-command.ts          # cortex growth log/report
│   ├── core/
│   │   └── growth.ts                  # Growth log + report logic
│   └── ...existing files...
└── tests/
    ├── cli/
    │   └── growth-command.test.ts
    ├── core/
    │   └── growth.test.ts
    └── integration/
        └── phase4.test.ts
```

---

## Existing Infrastructure

**Paths available** from `getCortexPaths(base)`:
- `growthDir` → `<base>/.cortex/growth`

**Directory** (created by `initCortexDir`):
- `<base>/.cortex/growth/` — already exists after `cortex init`

**Growth log format** (from spec):
- One file per day: `~/.cortex/growth/2026-04-14.log`
- Append-only plain text, each entry timestamped
- Not structured — just a journal/diary

**CLI commands** (from spec):
```
cortex growth log                    # Record growth (content via --content flag)
cortex growth report --days <n>      # Growth report (read last N days of logs)
```

---

### Task 1: Growth Log (Core Logic)

**Files:**
- Create: `src/core/growth.ts`
- Test: `tests/core/growth.test.ts`

- [ ] **Step 1: Write failing test for `appendGrowthLog`**

Test that `appendGrowthLog(base, content)`:
- Creates a log file named with today's date (`YYYY-MM-DD.log`) in the growth directory
- Appends content with a timestamp header (e.g. `[2026-04-14T10:30:00.000Z]`)
- Appending multiple times in the same day writes to the same file
- Creates the growth directory if it doesn't exist
- Each entry is separated by a blank line

```typescript
// tests/core/growth.test.ts
describe('appendGrowthLog', () => {
  it('creates a daily log file with timestamped entry', () => {
    appendGrowthLog(tmpDir, 'Learned about microservice decomposition.');
    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(tmpDir, '.cortex', 'growth', `${today}.log`);
    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, 'utf-8');
    expect(content).toContain('Learned about microservice decomposition.');
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T/); // timestamp header
  });

  it('appends to existing daily log file', () => {
    appendGrowthLog(tmpDir, 'First entry.');
    appendGrowthLog(tmpDir, 'Second entry.');
    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(tmpDir, '.cortex', 'growth', `${today}.log`);
    const content = readFileSync(logFile, 'utf-8');
    expect(content).toContain('First entry.');
    expect(content).toContain('Second entry.');
  });

  it('creates growth directory if missing', () => {
    // use a tmpDir without initCortexDir, just mkdirSync for .cortex
    appendGrowthLog(tmpDir, 'Entry.');
    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(tmpDir, '.cortex', 'growth', `${today}.log`);
    expect(existsSync(logFile)).toBe(true);
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `appendGrowthLog`**

```typescript
// src/core/growth.ts
import { appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { getCortexPaths } from '../utils/paths.js';

/**
 * Append a timestamped growth reflection to today's log file.
 * Creates the file and directory if they don't exist.
 */
export function appendGrowthLog(base: string, content: string): void {
  const { growthDir } = getCortexPaths(base);
  mkdirSync(growthDir, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const logFile = join(growthDir, `${dateStr}.log`);

  const entry = `\n[${now.toISOString()}]\n${content}\n`;
  appendFileSync(logFile, entry, 'utf-8');
}
```

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 1: growth log core logic"
```

---

### Task 2: Growth Report (Core Logic)

**Files:**
- Modify: `src/core/growth.ts`
- Test: `tests/core/growth.test.ts` (add tests)

- [ ] **Step 1: Write failing test for `getGrowthReport`**

Test that `getGrowthReport(base, days)`:
- Reads log files from the last N days
- Returns concatenated content from all matching log files
- Returns files in chronological order (oldest first)
- Returns empty string when no logs exist
- Ignores non-log files in the growth directory
- Each file's content is prefixed with a date header

```typescript
describe('getGrowthReport', () => {
  it('reads log files from the last N days', () => {
    // Create log files for today and yesterday manually
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    // write files directly
    // call getGrowthReport(tmpDir, 7)
    // verify both days' content included
  });

  it('returns files in chronological order', () => {
    // create two days of logs
    // verify older day's content appears before newer
  });

  it('returns empty string when no logs exist', () => {
    const report = getGrowthReport(tmpDir, 7);
    expect(report).toBe('');
  });

  it('respects the days parameter', () => {
    // create log from 10 days ago
    // call getGrowthReport(tmpDir, 3)
    // verify old log NOT included
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `getGrowthReport`**

```typescript
/**
 * Read growth log files from the last N days.
 * Returns concatenated content in chronological order with date headers.
 */
export function getGrowthReport(base: string, days: number): string {
  const { growthDir } = getCortexPaths(base);

  if (!existsSync(growthDir)) return '';

  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // List .log files, filter by date range
  const files = readdirSync(growthDir)
    .filter(f => f.endsWith('.log'))
    .filter(f => {
      const dateStr = f.replace('.log', '');
      const fileDate = new Date(dateStr + 'T00:00:00.000Z');
      return fileDate >= cutoff;
    })
    .sort(); // chronological (YYYY-MM-DD sorts naturally)

  if (files.length === 0) return '';

  return files
    .map(f => {
      const dateStr = f.replace('.log', '');
      const content = readFileSync(join(growthDir, f), 'utf-8');
      return `## ${dateStr}\n${content}`;
    })
    .join('\n---\n\n');
}
```

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 2: growth report core logic"
```

---

### Task 3: Growth CLI Commands

**Files:**
- Create: `src/cli/growth-command.ts`
- Modify: `src/cli/program.ts`
- Test: `tests/cli/growth-command.test.ts`

CLI commands:

```
cortex growth log --content <content> [--home <path>]
cortex growth report --days <n> [--home <path>]
```

- [ ] **Step 1: Write failing test**

```typescript
describe('growth command', () => {
  it('registers growth as a subcommand with log and report', () => { ... });

  it('growth log appends to daily log file', () => {
    // cortex growth log --content "Learned something important" --home tmpDir
    // verify output confirms logging
    // verify file exists in growth dir
  });

  it('growth report prints recent logs', () => {
    // log something first
    // cortex growth report --days 7 --home tmpDir
    // verify output contains the logged content
  });

  it('growth report shows no logs message when empty', () => {
    // cortex growth report --days 7 --home tmpDir
    // verify "No growth logs" message
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `registerGrowthCommand`**

Each subcommand follows the established pattern:
1. Resolve base from `--home`
2. Perform operation (no database needed for growth — pure file operations)
3. Print result

For `growth log`:
- `--content` required
- Call `appendGrowthLog(base, content)`
- Print "Growth logged for <date>."

For `growth report`:
- `--days` required (number, default 7)
- Call `getGrowthReport(base, days)`
- Print the report content, or "No growth logs found for the last N days." if empty

- [ ] **Step 3: Update `program.ts`** to register growth command.

Run: `npm test` — Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "task 3: growth CLI commands"
```

---

### Task 4: Update Bootstrap Skill

**Files:**
- Modify: `src/core/bootstrap.ts`
- Test: `tests/core/bootstrap.test.ts` (update assertions if needed)

- [ ] **Step 1: Update `getBootstrapSkillContent`** to enhance growth guidance:
- Add `cortex growth log --content <content>` command reference with detailed usage
- Add `cortex growth report --days <n>` command reference
- Enhance guidance on when to log growth (after non-trivial tasks, after overcoming difficulty, after receiving user feedback)
- Add guidance on what makes a good growth entry (narrative reflection, not just "what I did" but "what I learned")
- Reference the session lifecycle: growth log should happen at session end as the final reflection step
- Connect growth to the other systems: "在 growth 反思中，如果发现记忆策略或技能策略可以改进，直接更新对应的 strategy 文件"

- [ ] **Step 2: Run tests** — ensure existing tests pass, update assertions for new commands.

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 4: update bootstrap skill with growth guidance"
```

---

### Task 5: Phase 4 Integration Test

**Files:**
- Create: `tests/integration/phase4.test.ts`

- [ ] **Step 1: Write integration test** — Single test covering full growth lifecycle:
1. `cortex init` (setup)
2. `cortex growth log --content "First reflection: learned about FTS5 tokenizers"` — log a growth entry
3. `cortex growth log --content "Second reflection: discovered team size matters for architecture"` — log another entry same day
4. Verify daily log file exists with both entries
5. `cortex growth report --days 7` — verify both entries appear in report
6. Create a log file for 2 days ago manually (to test multi-day report)
7. `cortex growth report --days 7` — verify both days appear
8. `cortex growth report --days 1` — verify only today's log appears (not the 2-day-old one)

Run: `npm test` — Expected: PASS

- [ ] **Step 2: Verify build**
```bash
npm run build
```

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 5: Phase 4 integration test"
```

---

## Key Design Decisions

1. **No database tables for growth** — growth logs are purely file-based. They are a journal, not indexed data. The simplicity is intentional.
2. **One file per day, append-only** — `YYYY-MM-DD.log` naming. Multiple entries in a day append to the same file with timestamp headers. This matches how a diary works.
3. **Report is raw log content** — `getGrowthReport` returns raw log text with date headers. The LLM organizes this into a narrative report. The CLI doesn't do summarization.
4. **Content via `--content` flag** — consistent with memory write and soul edit. Stdin support can be added later.
5. **No project scoping for growth** — growth logs are global (follow the person). There's no project-scoped growth, unlike memory and skills.
6. **Growth directory already exists** — created by `initCortexDir` in Phase 1. No additional init work needed.

## Verification

After all tasks complete:
```bash
cd /Users/chenxigao/repos/cortex-cli
npm test                    # All tests pass
npm run build               # TypeScript compiles
node dist/main.js growth --help    # Shows growth subcommands
```
