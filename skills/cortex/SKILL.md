---
name: cortex
description: >-
  This skill should be used at the start of every session and throughout work.
  It provides the Cortex self-growth system — persistent identity, memory, skills,
  and growth for Claude Code. This skill should be activated when the user starts
  a new session, when working on tasks that could benefit from past experience,
  when encountering familiar patterns, or when completing non-trivial work.
  It teaches how to use the cortex CLI for "recall memories", "match skills",
  "log growth", "soul show", "project switch", and other cortex commands.
---

# Cortex — Self-Growth System

A persistent growth system that manages memory, skills, and growth logs through the cortex CLI.
The following are capabilities to use naturally during work — not a rigid checklist, but internalized habits.

## Prerequisites

Before first use, build the cortex CLI:

```bash
cd ${CLAUDE_PLUGIN_ROOT}/cli && npm run build
```

Then initialize:

```bash
node ${CLAUDE_PLUGIN_ROOT}/cli/dist/main.js init
```

All commands can be invoked via `node ${CLAUDE_PLUGIN_ROOT}/cli/dist/main.js`. For brevity, `cortex` is used below to refer to the full path.

## At Session Start

Understand yourself and the context:

- Run `cortex soul show` to review identity and core principles — a reminder of who you are
- Run `cortex project current` to understand the current project context
- Run `cortex memory recall <keywords related to current task>` to recall relevant past experience
- Run `cortex skill match <current task description>` to find reusable skills

Not all of these need to run every time — judge which are valuable based on the situation.

## During Work

Stay sensitive to experience:

- When making important decisions, discovering valuable patterns, or making mistakes, consider recording them
- When noticing a practice repeating 3+ times, consider extracting it as a skill
- Proactively mention relevant past experience when appropriate, but do not block the workflow
- Use `cortex memory recall` when encountering a problem that feels familiar

## At Session End

As the final step of the session, reflect on growth:

- Run `cortex growth log --content "<reflection>"` to record growth and reflections from this session
- Not every session needs a log — only write when there is genuine non-trivial insight
- Growth logs are narrative reflections: write "what I learned", not "what I did"

## When to Write Memories

Proactively write memories in these situations:

- **Decisions and trade-offs**: e.g. "Chose approach X over Y because..."
- **Pitfalls and fixes**: Encountered a non-obvious error and found a solution
- **Pattern discovery**: Noticed the same structure or practice across multiple places
- **User preferences**: The user indicated a habit or style preference
- **Cross-session context**: Key background that should not be rediscovered next time this project is opened

```
cortex memory write --scope project --tags "decision,architecture" --slug "tech-choice-rationale" --content "..."
```

## When to Create Skills

- **3+ similar patterns** → extract as a skill
- **Nameable capability unit** → suitable as a skill
- **Cross-project reuse** → should not exist only as a single memory

Hard skills (`--type hard`): Concrete operational steps, precisely executable.
Soft skills (`--type soft`): Mental models and principles, requiring flexible application.

## From Memory to Skill

When multiple memories point to the same capability pattern, distill them into a skill:
1. Use `cortex memory list` to find the cluster of related memories
2. Identify the common pattern
3. Use `cortex skill create` to refine into a reusable skill

## Agent Orchestration

For complex multi-role tasks, use Playbook orchestration:

- `cortex agent run <playbook> --task <description>` outputs a JSON execution plan
- Structured plans (with `steps`): dispatch subagents per step sequentially
- Open-ended plans (with `strategy`): dynamically switch roles based on strategy

## Command Reference

See `references/commands.md` for the full command reference.

## Strategy Files

The following strategy files can be consulted and updated during growth reflections:

- `~/.cortex/memory/memory-strategy.md` — memory strategy
- `~/.cortex/skills/skill-strategy.md` — skill strategy
- `~/.cortex/playbooks/playbook-strategy.md` — orchestration strategy

The strategies themselves are capabilities that can be continuously refined.

## Core Philosophy

The goal of this system is not to mechanically execute checklists, but to act like an experienced person:
remember past lessons, reuse existing skills, and continuously reflect and grow.
