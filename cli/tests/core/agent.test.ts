import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { parsePlaybook, createPlaybook, listPlaybooks, loadPlaybook, updatePlaybook, generateExecutionPlan } from '../../src/core/agent.js';
import type { StructuredExecutionPlan, OpenEndedExecutionPlan } from '../../src/core/agent.js';
import { initCortexDir } from '../../src/core/init.js';
import { initDatabase } from '../../src/db/database.js';
import { createSkill } from '../../src/core/skill.js';

const SAMPLE_PLAYBOOK_YAML = `
name: code-review
description: A code review playbook
roles:
  reviewer:
    perspective: Review the code for quality.
    skills_hint: [review]
flow:
  - role: reviewer
    task: "Review the PR"
    output: "Review comments"
`.trimStart();

const SAMPLE_PLAYBOOK_YAML_2 = `
name: debug
description: A debugging playbook
roles:
  investigator:
    perspective: Find the root cause.
strategy: |
  Explore freely, form hypotheses.
`.trimStart();

describe('parsePlaybook', () => {
  it('parses a structured playbook YAML', () => {
    const yamlContent = `
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
    const pb = parsePlaybook(yamlContent);
    expect(pb.name).toBe('test-playbook');
    expect(pb.description).toBe('A test playbook');
    expect(pb.roles.worker.perspective).toContain('Do the work');
    expect(pb.flow).toHaveLength(1);
    expect(pb.strategy).toBeUndefined();
  });

  it('parses an open-ended playbook YAML', () => {
    const yamlContent = `
name: investigate
description: Debug something
roles:
  investigator:
    perspective: Find the root cause.
strategy: |
  Explore freely, form hypotheses.
`;
    const pb = parsePlaybook(yamlContent);
    expect(pb.name).toBe('investigate');
    expect(pb.strategy).toContain('Explore freely');
    expect(pb.flow).toBeUndefined();
  });

  it('throws on invalid playbook (missing name)', () => {
    expect(() => parsePlaybook('roles:\n  x:\n    perspective: y')).toThrow('Invalid playbook');
  });

  it('throws on invalid playbook (missing roles)', () => {
    expect(() => parsePlaybook('name: test')).toThrow('Invalid playbook');
  });
});

describe('createPlaybook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-playbook-'));
    initCortexDir(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a playbook YAML file', () => {
    createPlaybook(tmpDir, 'code-review', SAMPLE_PLAYBOOK_YAML);

    const filePath = join(tmpDir, '.cortex', 'playbooks', 'code-review.yaml');
    expect(existsSync(filePath)).toBe(true);
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toBe(SAMPLE_PLAYBOOK_YAML);
  });

  it('throws on duplicate name', () => {
    createPlaybook(tmpDir, 'code-review', SAMPLE_PLAYBOOK_YAML);

    expect(() => {
      createPlaybook(tmpDir, 'code-review', SAMPLE_PLAYBOOK_YAML);
    }).toThrow(/already exists/);
  });

  it('validates name format', () => {
    expect(() => {
      createPlaybook(tmpDir, 'invalid_name!', SAMPLE_PLAYBOOK_YAML);
    }).toThrow(/Invalid playbook name/);

    expect(() => {
      createPlaybook(tmpDir, 'has space', SAMPLE_PLAYBOOK_YAML);
    }).toThrow(/Invalid playbook name/);

    expect(() => {
      createPlaybook(tmpDir, 'has_underscore', SAMPLE_PLAYBOOK_YAML);
    }).toThrow(/Invalid playbook name/);

    // Valid names should not throw
    expect(() => {
      createPlaybook(tmpDir, 'valid-name', SAMPLE_PLAYBOOK_YAML);
    }).not.toThrow();

    expect(() => {
      createPlaybook(tmpDir, 'Valid123', SAMPLE_PLAYBOOK_YAML_2);
    }).not.toThrow();
  });
});

describe('listPlaybooks', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-playbook-list-'));
    initCortexDir(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists all playbooks as parsed objects', () => {
    createPlaybook(tmpDir, 'code-review', SAMPLE_PLAYBOOK_YAML);
    createPlaybook(tmpDir, 'debug', SAMPLE_PLAYBOOK_YAML_2);

    const playbooks = listPlaybooks(tmpDir);
    expect(playbooks).toHaveLength(2);
    // Sorted by name: code-review before debug
    expect(playbooks[0].name).toBe('code-review');
    expect(playbooks[0].description).toBe('A code review playbook');
    expect(playbooks[1].name).toBe('debug');
    expect(playbooks[1].description).toBe('A debugging playbook');
  });

  it('returns empty array when no playbooks', () => {
    // The playbooks dir exists (from initCortexDir) but has only playbook-strategy.md
    const playbooks = listPlaybooks(tmpDir);
    expect(playbooks).toEqual([]);
  });

  it('ignores non-yaml files', () => {
    createPlaybook(tmpDir, 'code-review', SAMPLE_PLAYBOOK_YAML);
    // playbook-strategy.md is already created by initCortexDir — confirm it's ignored
    const playbooksDir = join(tmpDir, '.cortex', 'playbooks');
    writeFileSync(join(playbooksDir, 'notes.txt'), 'some notes', 'utf-8');

    const playbooks = listPlaybooks(tmpDir);
    expect(playbooks).toHaveLength(1);
    expect(playbooks[0].name).toBe('code-review');
  });
});

describe('loadPlaybook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-playbook-load-'));
    initCortexDir(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads and parses by name', () => {
    createPlaybook(tmpDir, 'code-review', SAMPLE_PLAYBOOK_YAML);

    const pb = loadPlaybook(tmpDir, 'code-review');
    expect(pb.name).toBe('code-review');
    expect(pb.description).toBe('A code review playbook');
    expect(pb.roles.reviewer.perspective).toContain('Review the code');
    expect(pb.flow).toHaveLength(1);
  });

  it('throws if not found', () => {
    expect(() => {
      loadPlaybook(tmpDir, 'nonexistent');
    }).toThrow(/not found/);
  });
});

describe('updatePlaybook', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-playbook-update-'));
    initCortexDir(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('overwrites playbook file', () => {
    createPlaybook(tmpDir, 'code-review', SAMPLE_PLAYBOOK_YAML);

    const updatedContent = `
name: code-review
description: Updated code review playbook
roles:
  reviewer:
    perspective: Thoroughly review code.
`.trimStart();

    updatePlaybook(tmpDir, 'code-review', updatedContent);

    const filePath = join(tmpDir, '.cortex', 'playbooks', 'code-review.yaml');
    const diskContent = readFileSync(filePath, 'utf-8');
    expect(diskContent).toBe(updatedContent);

    // Verify the updated content parses correctly
    const pb = loadPlaybook(tmpDir, 'code-review');
    expect(pb.description).toBe('Updated code review playbook');
  });

  it('throws if not found', () => {
    expect(() => {
      updatePlaybook(tmpDir, 'nonexistent', SAMPLE_PLAYBOOK_YAML);
    }).toThrow(/not found/);
  });
});

describe('generateExecutionPlan', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-plan-'));
    initCortexDir(tmpDir);
    db = initDatabase(join(tmpDir, '.cortex', 'cortex.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates a structured plan from a flow-based playbook', () => {
    const yamlContent = `
name: code-review
description: A code review playbook
roles:
  reviewer:
    perspective: Review the code for quality.
flow:
  - role: reviewer
    task: "Review the PR"
    output: "Review comments"
`.trimStart();
    createPlaybook(tmpDir, 'code-review', yamlContent);

    const plan = generateExecutionPlan(db, tmpDir, 'code-review', 'Review PR #42');
    expect(plan.playbook).toBe('code-review');
    expect(plan.task).toBe('Review PR #42');
    expect('steps' in plan).toBe(true);

    const structured = plan as StructuredExecutionPlan;
    expect(structured.steps).toHaveLength(1);
    expect(structured.steps[0].role).toBe('reviewer');
    expect(structured.steps[0].prompt).toBe('Review the code for quality.');
    expect(structured.steps[0].context).toBe('Review PR #42');
    expect(structured.steps[0].output_label).toBe('Review comments');
  });

  it('generates an open-ended plan from a strategy-based playbook', () => {
    const yamlContent = `
name: debug
description: A debugging playbook
roles:
  investigator:
    perspective: Find the root cause.
  fixer:
    perspective: Fix the issue.
strategy: |
  Explore freely, form hypotheses.
`.trimStart();
    createPlaybook(tmpDir, 'debug', yamlContent);

    const plan = generateExecutionPlan(db, tmpDir, 'debug', 'Fix the login bug');
    expect(plan.playbook).toBe('debug');
    expect(plan.task).toBe('Fix the login bug');
    expect('strategy' in plan).toBe(true);

    const openEnded = plan as OpenEndedExecutionPlan;
    expect(openEnded.strategy).toContain('Explore freely');
    expect(openEnded.roles.investigator.prompt).toBe('Find the root cause.');
    expect(openEnded.roles.fixer.prompt).toBe('Fix the issue.');
  });

  it('resolves skills_hint to actual skill content', () => {
    const skillContent = '---\ntype: hard\ntriggers: ["/review"]\n---\n\nReview code carefully.';
    createSkill(db, tmpDir, {
      id: 'review',
      content: skillContent,
      type: 'hard',
      scope: 'core',
      triggers: ['/review'],
    });

    const yamlContent = `
name: review-plan
description: A review playbook
roles:
  reviewer:
    perspective: Review the code.
    skills_hint: [review]
flow:
  - role: reviewer
    task: "Review code"
    output: "Review result"
`.trimStart();
    createPlaybook(tmpDir, 'review-plan', yamlContent);

    const plan = generateExecutionPlan(db, tmpDir, 'review-plan', 'Review this code');
    const structured = plan as StructuredExecutionPlan;
    expect(structured.steps[0].skills).toHaveLength(1);
    expect(structured.steps[0].skills[0]).toBe(skillContent);
  });

  it('includes depends_on for sequential steps', () => {
    const yamlContent = `
name: pipeline
description: A multi-step pipeline
roles:
  analyst:
    perspective: Analyze the requirements.
  developer:
    perspective: Write the code.
  tester:
    perspective: Test the implementation.
flow:
  - role: analyst
    task: "Analyze requirements"
    output: "Requirements doc"
  - role: developer
    task: "Implement"
    output: "Code"
  - role: tester
    task: "Test"
    output: "Test results"
`.trimStart();
    createPlaybook(tmpDir, 'pipeline', yamlContent);

    const plan = generateExecutionPlan(db, tmpDir, 'pipeline', 'Build feature X');
    const structured = plan as StructuredExecutionPlan;
    expect(structured.steps).toHaveLength(3);

    // First step has no depends_on
    expect(structured.steps[0].depends_on).toBeUndefined();
    expect(structured.steps[0].role).toBe('analyst');

    // Second step depends on first
    expect(structured.steps[1].depends_on).toBe('analyst');
    expect(structured.steps[1].role).toBe('developer');

    // Third step depends on second
    expect(structured.steps[2].depends_on).toBe('developer');
    expect(structured.steps[2].role).toBe('tester');
  });

  it('works when skills_hint references are not found', () => {
    const yamlContent = `
name: missing-skills
description: Playbook referencing nonexistent skills
roles:
  worker:
    perspective: Do the work.
    skills_hint: [nonexistent-skill, also-missing]
flow:
  - role: worker
    task: "Do work"
    output: "Result"
`.trimStart();
    createPlaybook(tmpDir, 'missing-skills', yamlContent);

    const plan = generateExecutionPlan(db, tmpDir, 'missing-skills', 'Some task');
    const structured = plan as StructuredExecutionPlan;
    expect(structured.steps).toHaveLength(1);
    expect(structured.steps[0].skills).toEqual([]);
  });
});
