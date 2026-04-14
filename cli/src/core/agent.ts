import yaml from 'js-yaml';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import Database from 'better-sqlite3';
import { getCortexPaths } from '../utils/paths.js';

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

const PLAYBOOK_NAME_RE = /^[a-z0-9-]+$/i;

export function createPlaybook(base: string, name: string, content: string): void {
  if (!PLAYBOOK_NAME_RE.test(name)) {
    throw new Error(`Invalid playbook name: "${name}". Only alphanumeric characters and hyphens are allowed.`);
  }
  const { playbooksDir } = getCortexPaths(base);
  mkdirSync(playbooksDir, { recursive: true });
  const filePath = join(playbooksDir, `${name}.yaml`);
  if (existsSync(filePath)) {
    throw new Error(`Playbook "${name}" already exists`);
  }
  writeFileSync(filePath, content, 'utf-8');
}

export function listPlaybooks(base: string): Playbook[] {
  const { playbooksDir } = getCortexPaths(base);
  if (!existsSync(playbooksDir)) {
    return [];
  }
  const files = readdirSync(playbooksDir).filter((f) => f.endsWith('.yaml'));
  const playbooks: Playbook[] = [];
  for (const file of files) {
    const content = readFileSync(join(playbooksDir, file), 'utf-8');
    playbooks.push(parsePlaybook(content));
  }
  playbooks.sort((a, b) => a.name.localeCompare(b.name));
  return playbooks;
}

export function loadPlaybook(base: string, name: string): Playbook {
  const { playbooksDir } = getCortexPaths(base);
  const filePath = join(playbooksDir, `${name}.yaml`);
  if (!existsSync(filePath)) {
    throw new Error(`Playbook "${name}" not found`);
  }
  const content = readFileSync(filePath, 'utf-8');
  return parsePlaybook(content);
}

export function updatePlaybook(base: string, name: string, content: string): void {
  const { playbooksDir } = getCortexPaths(base);
  const filePath = join(playbooksDir, `${name}.yaml`);
  if (!existsSync(filePath)) {
    throw new Error(`Playbook "${name}" not found`);
  }
  writeFileSync(filePath, content, 'utf-8');
}

export interface ExecutionStep {
  role: string;
  prompt: string;
  skills: string[];
  context: string;
  output_label: string;
  depends_on?: string;
}

export interface StructuredExecutionPlan {
  playbook: string;
  task: string;
  steps: ExecutionStep[];
}

export interface OpenEndedExecutionPlan {
  playbook: string;
  task: string;
  roles: Record<string, { prompt: string; skills: string[] }>;
  strategy: string;
}

export type ExecutionPlan = StructuredExecutionPlan | OpenEndedExecutionPlan;

function resolveSkills(db: Database.Database, hints: string[] | undefined): string[] {
  if (!hints || hints.length === 0) {
    return [];
  }
  const skills: string[] = [];
  for (const hintName of hints) {
    const row = db.prepare('SELECT file_path FROM skill_index WHERE id = ?').get(hintName) as { file_path: string } | undefined;
    if (row && existsSync(row.file_path)) {
      skills.push(readFileSync(row.file_path, 'utf-8'));
    }
  }
  return skills;
}

export function generateExecutionPlan(
  db: Database.Database,
  base: string,
  playbookName: string,
  task: string
): ExecutionPlan {
  const playbook = loadPlaybook(base, playbookName);

  if (playbook.flow) {
    const steps: ExecutionStep[] = [];
    for (let i = 0; i < playbook.flow.length; i++) {
      const flowStep = playbook.flow[i];
      const role = playbook.roles[flowStep.role];
      const skills = resolveSkills(db, role?.skills_hint);
      const step: ExecutionStep = {
        role: flowStep.role,
        prompt: role?.perspective ?? '',
        skills,
        context: task,
        output_label: flowStep.output,
      };
      if (i > 0) {
        step.depends_on = playbook.flow[i - 1].role;
      }
      steps.push(step);
    }
    return {
      playbook: playbook.name,
      task,
      steps,
    };
  }

  // Open-ended (strategy-based)
  const roles: Record<string, { prompt: string; skills: string[] }> = {};
  for (const [roleName, roleConfig] of Object.entries(playbook.roles)) {
    roles[roleName] = {
      prompt: roleConfig.perspective,
      skills: resolveSkills(db, roleConfig.skills_hint),
    };
  }
  return {
    playbook: playbook.name,
    task,
    roles,
    strategy: playbook.strategy ?? '',
  };
}
