# Cortex CLI — Phase 5 Implementation Plan (Agent Orchestration)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Agent Orchestration subsystem for cortex-cli — manage playbook YAML files (create, update, list) and generate JSON execution plans from playbooks for the bootstrap skill to orchestrate via Claude Code's Agent tool.

**Architecture:** Playbooks are YAML files stored in `~/.cortex/playbooks/` (core) or `<project>/.cortex/playbooks/` (project-scoped). There are two playbook types: structured (with `flow` defining sequential/parallel steps) and open-ended (with `strategy` for flexible exploration). The `cortex agent run` command reads a playbook, resolves referenced skills, and outputs a JSON execution plan to stdout. The bootstrap skill consumes this JSON to dispatch subagents. No database tables needed — playbooks are purely file-based.

**Tech Stack:** TypeScript, commander, js-yaml (new dependency for YAML parsing), vitest

**Scope Note:** This is Phase 5, the final phase. Phases 1-4 are complete with 176 tests. This phase adds playbook management and execution plan generation.

**Project Location:** `/Users/chenxigao/repos/cortex-cli/`

---

## File Structure

```
cortex-cli/
├── src/
│   ├── cli/
│   │   └── agent-command.ts           # cortex agent run/update/list
│   ├── core/
│   │   └── agent.ts                   # Playbook CRUD + execution plan generation
│   └── ...existing files...
└── tests/
    ├── cli/
    │   └── agent-command.test.ts
    ├── core/
    │   └── agent.test.ts
    └── integration/
        └── phase5.test.ts
```

---

## Existing Infrastructure

**Paths available** from `getCortexPaths(base)`:
- `playbooksDir` → `<base>/.cortex/playbooks`

**Directory** (created by `initCortexDir`):
- `<base>/.cortex/playbooks/` — already exists after `cortex init`

**Strategy file** (already seeded by init):
- `~/.cortex/playbooks/playbook-strategy.md`

**Skill matching** (from `src/core/skill.ts`):
- `matchSkills(db, base, situation, opts?)` — can be used to resolve `skills_hint` references in playbook roles

**Playbook file format** (from spec):

Structured playbook (with `flow`):
```yaml
name: feature-development
description: 从需求到落地的完整开发流程

roles:
  architect:
    perspective: |
      关注系统边界、接口设计、数据流。
    skills_hint: [system-design, api-design]
  implementer:
    perspective: |
      关注代码质量、可测试性、边界情况。
    skills_hint: [tdd, clean-code]
  reviewer:
    perspective: |
      以新人视角审视代码。
    skills_hint: [code-review]

flow:
  - role: architect
    task: "理解需求，做技术方案"
    output: "方案文档"
  - role: implementer
    task: "按方案实现，写测试"
    output: "代码 + 测试"
  - role: reviewer
    task: "Review 代码和测试"
    output: "反馈意见"
    on_issues: "回到 implementer 修改"
```

Open-ended playbook (with `strategy`):
```yaml
name: investigate-bug
description: 排查一个复杂 bug

roles:
  investigator:
    perspective: |
      追踪线索，形成假设，设计验证方法。
  fixer:
    perspective: |
      找到最小修改方案，确保修复不引入新问题。

strategy: |
  先让 investigator 自由探索，形成至少两个假设。
  验证假设后，如果确认了 root cause，交给 fixer。
```

**CLI commands** (from spec):
```
cortex agent run <playbook> --task <desc>      # Execute orchestration
cortex agent update <playbook>                 # Update playbook
cortex agent list                              # List playbooks
```

---

## New Dependency

This phase requires `js-yaml` for parsing YAML playbook files.

```bash
npm install js-yaml
npm install -D @types/js-yaml
```

---

### Task 1: Install js-yaml and Playbook Types

**Files:**
- Modify: `package.json` (add js-yaml dependency)
- Create: `src/core/agent.ts` (type definitions only)
- Test: `tests/core/agent.test.ts` (basic type verification)

- [ ] **Step 1: Install js-yaml**
```bash
cd /Users/chenxigao/repos/cortex-cli
npm install js-yaml
npm install -D @types/js-yaml
```

- [ ] **Step 2: Write failing test for playbook type parsing**

```typescript
// tests/core/agent.test.ts
describe('playbook types', () => {
  it('parsePlaybook parses a structured playbook YAML', () => {
    const yaml = `
name: test-playbook
description: A test playbook
roles:
  worker:
    perspective: Do the work.
    skills_hint: [coding]
flow:
  - role: worker
    task: "Implement the feature"
    output: "Code"
`;
    const pb = parsePlaybook(yaml);
    expect(pb.name).toBe('test-playbook');
    expect(pb.description).toBe('A test playbook');
    expect(pb.roles.worker.perspective).toContain('Do the work');
    expect(pb.flow).toHaveLength(1);
    expect(pb.strategy).toBeUndefined();
  });

  it('parsePlaybook parses an open-ended playbook YAML', () => {
    const yaml = `
name: investigate
description: Debug something
roles:
  investigator:
    perspective: Find the root cause.
strategy: |
  Explore freely, form hypotheses.
`;
    const pb = parsePlaybook(yaml);
    expect(pb.name).toBe('investigate');
    expect(pb.strategy).toContain('Explore freely');
    expect(pb.flow).toBeUndefined();
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 3: Implement types and parsePlaybook**

```typescript
// src/core/agent.ts
import yaml from 'js-yaml';

export interface PlaybookRole {
  perspective: string;
  skills_hint?: string[];
}

export interface PlaybookFlowStep {
  role: string;
  task: string;
  output: string;
  on_issues?: string;
  depends_on?: string;
}

export interface Playbook {
  name: string;
  description: string;
  roles: Record<string, PlaybookRole>;
  flow?: PlaybookFlowStep[];
  strategy?: string;
}

export function parsePlaybook(content: string): Playbook {
  const parsed = yaml.load(content) as Playbook;
  if (!parsed.name || !parsed.roles) {
    throw new Error('Invalid playbook: missing name or roles');
  }
  return parsed;
}
```

Run: `npm test` — Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "task 1: install js-yaml and define playbook types"
```

---

### Task 2: Playbook CRUD (Core Logic)

**Files:**
- Modify: `src/core/agent.ts`
- Test: `tests/core/agent.test.ts` (add tests)

- [ ] **Step 1: Write failing tests for createPlaybook, listPlaybooks, updatePlaybook, loadPlaybook**

```typescript
describe('createPlaybook', () => {
  it('creates a playbook YAML file in the playbooks directory', () => {
    createPlaybook(tmpDir, 'my-playbook', yamlContent);
    const filePath = join(tmpDir, '.cortex', 'playbooks', 'my-playbook.yaml');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf-8')).toBe(yamlContent);
  });

  it('throws on duplicate playbook name', () => {
    createPlaybook(tmpDir, 'dup', content);
    expect(() => createPlaybook(tmpDir, 'dup', content)).toThrow();
  });

  it('validates playbook name format', () => {
    expect(() => createPlaybook(tmpDir, 'bad name!', content)).toThrow();
  });
});

describe('listPlaybooks', () => {
  it('lists all playbooks as parsed objects', () => { ... });
  it('returns empty array when no playbooks', () => { ... });
  it('ignores non-yaml files (like playbook-strategy.md)', () => { ... });
});

describe('loadPlaybook', () => {
  it('loads and parses a specific playbook by name', () => { ... });
  it('throws if playbook not found', () => { ... });
});

describe('updatePlaybook', () => {
  it('overwrites playbook file with new content', () => { ... });
  it('throws if playbook not found', () => { ... });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement CRUD functions**

```typescript
export function createPlaybook(base: string, name: string, content: string): void
// Validate name (alphanumeric + hyphens only)
// Write to <base>/.cortex/playbooks/<name>.yaml
// Throw if file already exists

export function listPlaybooks(base: string): Playbook[]
// Read all .yaml files from playbooks dir
// Parse each, return array sorted by name
// Ignore non-.yaml files (like playbook-strategy.md)

export function loadPlaybook(base: string, name: string): Playbook
// Read <base>/.cortex/playbooks/<name>.yaml
// Parse and return
// Throw if not found

export function updatePlaybook(base: string, name: string, content: string): void
// Overwrite <base>/.cortex/playbooks/<name>.yaml
// Throw if doesn't exist
```

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 2: playbook CRUD core logic"
```

---

### Task 3: Execution Plan Generation

**Files:**
- Modify: `src/core/agent.ts`
- Test: `tests/core/agent.test.ts` (add tests)

This is the core of the orchestration system. `generateExecutionPlan` reads a playbook, resolves skill hints, and produces the JSON execution plan that the bootstrap skill uses to dispatch subagents.

- [ ] **Step 1: Write failing tests**

```typescript
describe('generateExecutionPlan', () => {
  it('generates a structured plan from a flow-based playbook', () => {
    // Create playbook with flow steps
    // Create matching skills
    // Generate plan
    // Verify JSON structure: playbook name, task, steps array
    // Each step has: role, prompt (includes perspective), skills (resolved content), context, output_label
  });

  it('generates an open-ended plan from a strategy-based playbook', () => {
    // Create playbook with strategy (no flow)
    // Generate plan
    // Verify JSON has: playbook, task, roles, strategy (no steps array)
  });

  it('resolves skills_hint to actual skill content', () => {
    // Create skills matching the hints
    // Generate plan
    // Verify step.skills contains actual skill file content
  });

  it('includes depends_on for sequential steps', () => {
    // Flow with multiple steps
    // Verify each step after the first has depends_on set to previous role
  });

  it('works when skills_hint references are not found', () => {
    // Skills referenced in hints don't exist
    // Plan still generates, skills array is empty
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `generateExecutionPlan`**

```typescript
interface ExecutionStep {
  role: string;
  prompt: string;          // role perspective as the agent's identity prompt
  skills: string[];        // resolved skill file contents
  context: string;         // task description + any prior context
  output_label: string;
  depends_on?: string;     // previous step's role (for structured playbooks)
}

interface StructuredExecutionPlan {
  playbook: string;
  task: string;
  steps: ExecutionStep[];
}

interface OpenEndedExecutionPlan {
  playbook: string;
  task: string;
  roles: Record<string, { prompt: string; skills: string[] }>;
  strategy: string;
}

export type ExecutionPlan = StructuredExecutionPlan | OpenEndedExecutionPlan;

export function generateExecutionPlan(
  db: Database.Database,
  base: string,
  playbookName: string,
  task: string
): ExecutionPlan
```

Logic:
1. Load playbook via `loadPlaybook(base, playbookName)`
2. For each role, resolve `skills_hint`:
   - For each hint name, try to read the skill file directly from skills dir (by id)
   - If not found, skip (empty skills array for that role)
3. If playbook has `flow` (structured):
   - Build steps array from flow entries
   - Each step gets: role, prompt (from role.perspective), skills (resolved), context (task description), output_label
   - Set depends_on to the previous step's role for sequential steps
4. If playbook has `strategy` (open-ended):
   - Build roles map with prompt and resolved skills for each role
   - Include strategy string
5. Return the execution plan object

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 3: execution plan generation"
```

---

### Task 4: Agent CLI Commands

**Files:**
- Create: `src/cli/agent-command.ts`
- Modify: `src/cli/program.ts`
- Test: `tests/cli/agent-command.test.ts`

CLI commands:

```
cortex agent run <playbook> --task <desc> [--home <path>]
cortex agent update <playbook> --content <content> [--home <path>]
cortex agent list [--home <path>]
```

- [ ] **Step 1: Write failing test**

```typescript
describe('agent command', () => {
  it('registers agent as a subcommand with run, update, list', () => { ... });

  it('agent list shows playbooks', () => {
    // create a playbook file manually in tmpDir playbooks dir
    // cortex agent list --home tmpDir
    // verify output contains playbook name
  });

  it('agent run outputs JSON execution plan', () => {
    // create a playbook file
    // cortex agent run <name> --task "do something" --home tmpDir
    // verify output is valid JSON with expected structure
  });

  it('agent update replaces playbook content', () => {
    // create a playbook, then update it
    // verify file content changed
  });

  it('agent list shows empty message when no playbooks', () => {
    // cortex agent list --home tmpDir (no playbooks created)
    // verify "No playbooks found." message
  });
});
```

Run: `npm test` — Expected: FAIL

- [ ] **Step 2: Implement `registerAgentCommand`**

For `agent run`:
- `<playbook>` required argument (playbook name)
- `--task` required
- `--home` optional
- Opens database (needed for skill resolution in generateExecutionPlan)
- Calls `generateExecutionPlan(db, base, playbook, task)`
- Outputs JSON to stdout via `console.log(JSON.stringify(plan, null, 2))`
- Closes database

For `agent list`:
- `--home` optional
- Calls `listPlaybooks(base)`
- Prints each playbook: name, description, type (structured/open-ended)
- "No playbooks found." if empty

For `agent update`:
- `<playbook>` required argument
- `--content` required
- `--home` optional
- Calls `updatePlaybook(base, playbook, content)`
- Prints "Playbook updated: <name>"

- [ ] **Step 3: Update `program.ts`** to register agent command.

Run: `npm test` — Expected: PASS

- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "task 4: agent CLI commands"
```

---

### Task 5: Update Bootstrap Skill

**Files:**
- Modify: `src/core/bootstrap.ts`
- Test: `tests/core/bootstrap.test.ts` (update assertions if needed)

- [ ] **Step 1: Update `getBootstrapSkillContent`** to include agent orchestration guidance:
- Add `cortex agent run <playbook> --task <desc>` command reference — explain that it outputs JSON to stdout
- Add `cortex agent list` command reference
- Add `cortex agent update <playbook>` command reference
- Add guidance on how to consume the execution plan JSON:
  - For structured plans: dispatch subagents per step, pass previous step's output as context to next step
  - For open-ended plans: use strategy to decide role switching dynamically
- Add guidance on when to use playbooks (complex multi-role tasks vs simple single-role tasks)
- **Add reference to `~/.cortex/playbooks/playbook-strategy.md`** — instruct the LLM to consult and update this file

- [ ] **Step 2: Run tests** — update assertions for new commands.

Run: `npm test` — Expected: PASS

- [ ] **Step 3: Commit**
```bash
git add -A && git commit -m "task 5: update bootstrap skill with agent orchestration guidance"
```

---

### Task 6: Phase 5 Integration Test

**Files:**
- Create: `tests/integration/phase5.test.ts`

- [ ] **Step 1: Write integration test** — Single test covering full agent orchestration lifecycle:
1. `cortex init` (setup)
2. Create a structured playbook file manually in playbooks dir (write YAML file directly)
3. `cortex agent list` — verify playbook appears
4. `cortex agent run <playbook> --task "build a feature"` — verify JSON output with steps
5. Verify JSON structure: has playbook name, task, steps array with role/prompt/skills/context
6. Create an open-ended playbook file
7. `cortex agent run <playbook> --task "investigate a bug"` — verify JSON output with strategy
8. `cortex agent update <playbook> --content "updated YAML"` — update the playbook
9. Verify updated content on disk

Run: `npm test` — Expected: PASS

- [ ] **Step 2: Verify build**
```bash
npm run build
```

- [ ] **Step 3: Final verification — all CLI commands are present**
```bash
node dist/main.js --help
node dist/main.js agent --help
```

- [ ] **Step 4: Commit**
```bash
git add -A && git commit -m "task 6: Phase 5 integration test"
```

---

## Key Design Decisions

1. **Playbooks are YAML files, not database entries** — no database tables for playbooks. They are human-readable, version-controllable files. Simple CRUD on the filesystem.
2. **js-yaml for YAML parsing** — needed because playbooks are YAML, and the existing codebase doesn't parse YAML yet (soul.yaml is read as raw text, not parsed).
3. **Execution plan is JSON output to stdout** — the CLI produces the plan, the bootstrap skill (running in Claude Code) consumes it. This is a clean separation: CLI does data assembly, LLM does orchestration.
4. **Skill resolution is best-effort** — if `skills_hint` references a skill that doesn't exist, the plan still generates with an empty skills array for that role. No hard failure.
5. **Two plan types map to two execution modes** — structured (with `steps`) for sequential orchestration, open-ended (with `strategy` and `roles`) for flexible LLM-driven orchestration.
6. **No `agent create` command** — playbooks are created by writing YAML files (either via `cortex agent update` with new content, or the LLM writing files directly). The `cortex agent run` and `cortex agent list` commands read existing files. This keeps the interface simple. However, we do provide `createPlaybook` as a core function for programmatic use.
7. **`base` parameter threading** — consistent with all other phases.

## Verification

After all tasks complete:
```bash
cd /Users/chenxigao/repos/cortex-cli
npm test                    # All tests pass
npm run build               # TypeScript compiles
node dist/main.js --help    # Shows all commands including agent
node dist/main.js agent --help  # Shows run/update/list subcommands
```
