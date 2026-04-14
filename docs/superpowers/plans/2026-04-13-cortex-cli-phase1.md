# Cortex CLI — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation CLI (`cortex`) with project scaffolding, SQLite database, directory initialization, project management, soul system, and bootstrap skill installation.

**Architecture:** TypeScript CLI tool using commander for command routing and better-sqlite3 for indexed metadata. All content stored as human-readable files in `~/.cortex/`, with SQLite providing indexing/search. Bootstrap skill file installed to `~/.claude/skills/` to teach Claude Code how to use the CLI.

**Tech Stack:** TypeScript, commander, better-sqlite3, vitest

**Scope Note:** This is Phase 1 of a multi-phase project. Later phases will add Memory (Phase 2), Skill (Phase 3), Growth (Phase 4), and Agent Orchestration (Phase 5). Phase 1 creates all database tables upfront (including tables for later phases) to avoid migrations.

**Project Location:** `/Users/chenxigao/repos/cortex-cli/`

---

## File Structure

```
cortex-cli/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── .gitignore
├── src/
│   ├── main.ts                        # CLI entry point (#!/usr/bin/env node)
│   ├── cli/
│   │   ├── program.ts                 # Commander program factory
│   │   ├── init-command.ts            # cortex init
│   │   ├── soul-command.ts            # cortex soul show/edit
│   │   └── project-command.ts         # cortex project create/list/switch/link/current
│   ├── core/
│   │   ├── defaults.ts                # Default soul.yaml content
│   │   ├── init.ts                    # Directory + seed file initialization
│   │   ├── soul.ts                    # Soul read/write logic
│   │   ├── project.ts                 # Project CRUD logic
│   │   └── bootstrap.ts              # Bootstrap skill content + install
│   ├── db/
│   │   └── database.ts                # SQLite init + schema
│   └── utils/
│       └── paths.ts                   # CortexPaths resolver
└── tests/
    ├── cli/
    │   ├── program.test.ts
    │   ├── init-command.test.ts
    │   ├── soul-command.test.ts
    │   └── project-command.test.ts
    ├── core/
    │   ├── init.test.ts
    │   ├── soul.test.ts
    │   ├── project.test.ts
    │   ├── bootstrap.test.ts
    │   └── bootstrap-install.test.ts
    ├── db/
    │   └── database.test.ts
    ├── utils/
    │   └── paths.test.ts
    └── integration/
        └── phase1.test.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `src/main.ts`, `src/cli/program.ts`
- Test: `tests/cli/program.test.ts`

- [ ] **Step 1: Initialize npm project and install dependencies**

```bash
mkdir /Users/chenxigao/repos/cortex-cli && cd /Users/chenxigao/repos/cortex-cli
git init
npm init -y
npm install commander better-sqlite3
npm install -D typescript vitest @types/node @types/better-sqlite3
```

Set `package.json`:
```json
{
  "name": "cortex-cli",
  "version": "0.1.0",
  "description": "Plugin framework for Claude Code — memory, skills, and growth",
  "type": "module",
  "bin": { "cortex": "./dist/main.js" },
  "scripts": { "build": "tsc", "test": "vitest run", "test:watch": "vitest" }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "ES2022", "moduleResolution": "node16",
    "outDir": "./dist", "rootDir": "./src", "strict": true,
    "esModuleInterop": true, "declaration": true, "sourceMap": true,
    "forceConsistentCasingInFileNames": true, "skipLibCheck": true
  },
  "include": ["src/**/*"], "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 3: Create vitest.config.ts and .gitignore**

- [ ] **Step 4: Create directory structure** (`src/cli/`, `src/core/`, `src/db/`, `src/utils/`, `tests/` mirrors)

- [ ] **Step 5: Write failing test for CLI program**

```typescript
// tests/cli/program.test.ts
import { createProgram } from '../../src/cli/program.js';
describe('createProgram', () => {
  it('should create a program with name "cortex"', () => {
    expect(createProgram().name()).toBe('cortex');
  });
  it('should have version 0.1.0', () => {
    expect(createProgram().version()).toBe('0.1.0');
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 6: Implement program.ts and main.ts**

- [ ] **Step 7: Run test** — Expected: PASS

- [ ] **Step 8: Commit**
```bash
git add -A && git commit -m "task 1: project scaffolding with CLI entry point"
```

---

### Task 2: Paths Utility Module

**Files:**
- Create: `src/utils/paths.ts`
- Test: `tests/utils/paths.test.ts`

- [ ] **Step 1: Write failing test** — Test that `getCortexPaths(tmpDir)` returns correct paths for cortexDir, soulFile, dbFile, activeProjectFile, memory/skills/growth/playbooks subdirs. Test default (no arg) uses `os.homedir()`.

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `getCortexPaths`** — Takes optional `base` (defaults to `os.homedir()`), returns `CortexPaths` interface with all path properties.

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 2: paths utility module"
```

---

### Task 3: Directory Initialization

**Files:**
- Create: `src/core/init.ts`, `src/core/defaults.ts`
- Test: `tests/core/init.test.ts`

- [ ] **Step 1: Write failing test** — Test `initCortexDir(tmpDir)` creates all directories, writes `soul.yaml` with default content, creates `memory-strategy.md`, `skill-strategy.md`, `playbook-strategy.md`. Test idempotency (calling twice doesn't overwrite).

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `initCortexDir`** and `defaults.ts` (DEFAULT_SOUL_YAML, strategy file defaults). Uses `writeIfMissing` helper for idempotency.

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 3: directory initialization with seed files"
```

---

### Task 4: Database Initialization

**Files:**
- Create: `src/db/database.ts`
- Test: `tests/db/database.test.ts`

- [ ] **Step 1: Write failing test** — Test `initDatabase(dbPath)` creates file, creates tables (projects, project_dirs, memory_index, memory_fts, skill_index, skill_fts). Test idempotency. Test foreign key enforcement on project_dirs. Test `getDatabase` throws if file missing.

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `initDatabase` and `getDatabase`** — Schema with `CREATE TABLE IF NOT EXISTS`, WAL mode, foreign keys ON.

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 4: SQLite database initialization"
```

---

### Task 5: Wire `cortex init` Command

**Files:**
- Create: `src/cli/init-command.ts`
- Modify: `src/cli/program.ts` (register init command)
- Test: `tests/cli/init-command.test.ts`

- [ ] **Step 1: Write failing test** — Test that `cortex init` via `program.parseAsync` creates .cortex dir and database file.

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `registerInitCommand`** — calls `initCortexDir` + `initDatabase`. Update `program.ts` to register.

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 5: wire cortex init command"
```

---

### Task 6: Soul System

**Files:**
- Create: `src/core/soul.ts`, `src/cli/soul-command.ts`
- Modify: `src/cli/program.ts`
- Test: `tests/core/soul.test.ts`, `tests/cli/soul-command.test.ts`

- [ ] **Step 1: Write failing test for soul core** — Test `showSoul(base)` returns content, throws if not initialized. Test `editSoul(base, content)` overwrites file, throws if not initialized.

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `showSoul` and `editSoul`**

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Write failing test for soul CLI** — Test command registration (soul show, soul edit subcommands exist).

Run: `npm test` — Expected: FAIL

- [ ] **Step 4: Implement `registerSoulCommand`** — `soul show` writes to stdout, `soul edit` reads stdin. Update program.ts.

Run: `npm test` — Expected: PASS

- [ ] **Step 5: Commit**
```bash
git add -A && git commit -m "task 6: soul system (show and edit)"
```

---

### Task 7: Project Core Logic

**Files:**
- Create: `src/core/project.ts`
- Test: `tests/core/project.test.ts`

- [ ] **Step 1: Write failing test** — Test `createProject(db, name, desc?)` inserts row, sets timestamps, throws on duplicate. Test `listProjects(db)` returns all sorted by last_active. Test `switchProject(db, base, name)` writes active_project file, updates last_active, throws if not found. Test `linkProject(db, dir, name)` inserts/replaces. Test `currentProject(db, base, cwd?)` checks active_project file first, then directory links (walks ancestors), returns null if nothing.

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement all project functions**

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 7: project core logic"
```

---

### Task 8: Project CLI Commands

**Files:**
- Create: `src/cli/project-command.ts`
- Modify: `src/cli/program.ts`
- Test: `tests/cli/project-command.test.ts`

- [ ] **Step 1: Write failing test** — Test `cortex project create`, `list`, `switch`, `current`, `link` via parseAsync.

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `registerProjectCommand`** — Each subcommand opens db, does work, closes db. Update program.ts.

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 8: project CLI commands"
```

---

### Task 9: Bootstrap Skill File

**Files:**
- Create: `src/core/bootstrap.ts`
- Modify: `src/cli/init-command.ts`
- Test: `tests/core/bootstrap.test.ts`, `tests/core/bootstrap-install.test.ts`

- [ ] **Step 1: Write failing test for skill content** — Test `getBootstrapSkillContent()` contains key CLI commands.

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `getBootstrapSkillContent`** — Returns the full skill markdown as a string constant.

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Write failing test for install** — Test `installBootstrapSkill(homeDir)` creates `~/.claude/skills/cortex.md`.

Run: `npm test` — Expected: FAIL

- [ ] **Step 4: Implement `installBootstrapSkill`** — Creates directory, writes file.

Run: `npm test` — Expected: PASS

- [ ] **Step 5: Update `cortex init` to call `installBootstrapSkill`** — Add test to init-command.test.ts.

Run: `npm test` — Expected: PASS

- [ ] **Step 6: Commit**
```bash
git add -A && git commit -m "task 9: bootstrap skill file"
```

---

### Task 10: Integration Test

**Files:**
- Test: `tests/integration/phase1.test.ts`

- [ ] **Step 1: Write integration test** — Single test that runs full lifecycle: init → soul show → soul edit → project create → project list → project switch → project current → project link. Verifies all database tables exist (including Phase 2+ tables). Verifies bootstrap skill installed.

Run: `npm test` — Expected: PASS (all previous tasks complete)

- [ ] **Step 2: Verify build**
```bash
npm run build
```
Verify `dist/main.js` exists with shebang.

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 10: Phase 1 integration test"
```

---

## Key Design Decisions

1. **`base` parameter threading** — Every function accepts optional `base` defaulting to `os.homedir()`. Tests pass temp dirs. No DI container needed.
2. **DB open/close per command** — Appropriate for short-lived CLI invocations. No connection pooling.
3. **Idempotent init** — `mkdirSync({recursive: true})` + `writeIfMissing` pattern. Safe to run `cortex init` multiple times.
4. **All tables created in Phase 1** — Avoids migration complexity. Empty tables cost nothing.
5. **ESM throughout** — `"type": "module"`, all imports use `.js` extensions.

## Verification

After all tasks complete:
```bash
cd /Users/chenxigao/repos/cortex-cli
npm test                    # All tests pass
npm run build               # TypeScript compiles
node dist/main.js --help    # CLI shows help
node dist/main.js init      # Creates ~/.cortex/ (use a temp dir for verification)
```
