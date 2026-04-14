# Cortex CLI Command Reference

## Identity

| Command | Description |
|---------|-------------|
| `cortex soul show` | Display current identity (soul.yaml) |
| `cortex soul edit --content <content>` | Update identity |

## Memory

| Command | Description |
|---------|-------------|
| `cortex memory recall <query>` | Search memories by keyword (FTS + freshness weighted) |
| `cortex memory recall --cross-project <query>` | Search across all projects |
| `cortex memory write --scope <core\|project> --tags <comma-separated> --slug <name> --content <text>` | Write a new memory |
| `cortex memory list` | List all active memories |
| `cortex memory list --scope core` | List only core memories |
| `cortex memory list --archived` | Include archived memories |
| `cortex memory gc` | Archive low-freshness memories |
| `cortex memory gc --threshold 0.5` | Archive with custom freshness threshold |

### Memory Scopes

- `--scope core`: Global memories that follow the person across projects
- `--scope project`: Project-specific memories (requires `--project <name> --project-dir <path>`)

### Memory Freshness

Memories have a freshness score (0.0-1.0) that decays logarithmically over time. Recently recalled memories are fresh (1.0). Memories that haven't been recalled in months become stale and may be archived by `gc`.

## Skills

| Command | Description |
|---------|-------------|
| `cortex skill match --situation <description>` | Find skills matching a task |
| `cortex skill match --situation <desc> --cross-project` | Search across all projects |
| `cortex skill create --type <hard\|soft> --id <name> --content <markdown>` | Create a new skill |
| `cortex skill create --type hard --triggers <comma-separated> ...` | Create hard skill with triggers |
| `cortex skill create --type soft --domain <comma-separated> --abstraction <high\|medium\|low> ...` | Create soft skill |
| `cortex skill update <id> --content <markdown>` | Update skill content |
| `cortex skill list` | List all skills |
| `cortex skill list --type hard` | List only hard skills |

### Skill Types

- **Hard skills** (`--type hard`): Deterministic procedures with specific trigger keywords. Matched by trigger overlap.
- **Soft skills** (`--type soft`): Principles and patterns with domain tags. Matched by FTS content search + domain overlap.

## Growth

| Command | Description |
|---------|-------------|
| `cortex growth log --content <reflection>` | Append a timestamped reflection to today's log |
| `cortex growth report --days <n>` | Read growth logs from the last N days |

### Growth Log Format

Daily log files at `~/.cortex/growth/YYYY-MM-DD.log`. Each entry is timestamped and appended. Not structured — just a journal.

## Projects

| Command | Description |
|---------|-------------|
| `cortex project create <name> [--desc <description>]` | Create a new project |
| `cortex project list` | List all projects |
| `cortex project switch <name>` | Set the active project |
| `cortex project current` | Show the active project |
| `cortex project link <dir> <name>` | Associate a directory with a project |

## Agent Orchestration

| Command | Description |
|---------|-------------|
| `cortex agent run <playbook> --task <description>` | Generate JSON execution plan from playbook |
| `cortex agent list` | List all available playbooks |
| `cortex agent update <playbook> --content <yaml>` | Update a playbook |

### Execution Plan Types

**Structured** (playbook has `flow`): Returns JSON with `steps` array. Dispatch subagents per step, passing previous output as context.

**Open-ended** (playbook has `strategy`): Returns JSON with `roles` map and `strategy` string. Dynamically decide role switching based on strategy.

## Initialization

| Command | Description |
|---------|-------------|
| `cortex init` | Create ~/.cortex/ directory, database, seed files, and bootstrap skill |

### Directory Structure

```
~/.cortex/
├── soul.yaml                 # Identity definition
├── cortex.db                 # SQLite index
├── active_project            # Current project name
├── memory/
│   ├── memory-strategy.md    # Memory strategy (self-updating)
│   ├── core/                 # Core memories
│   └── archive/              # Archived memories
├── skills/
│   ├── skill-strategy.md     # Skill strategy (self-updating)
│   ├── hard/                 # Hard skills
│   └── soft/                 # Soft skills
├── growth/                   # Daily log files
└── playbooks/                # YAML playbook files
    └── playbook-strategy.md  # Playbook strategy (self-updating)
```

## Global Options

All commands accept `--home <path>` to override the home directory (default: `os.homedir()`). Useful for testing.
