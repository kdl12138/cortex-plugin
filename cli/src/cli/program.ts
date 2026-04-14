import { Command } from 'commander';
import { registerInitCommand } from './init-command.js';
import { registerSoulCommand } from './soul-command.js';
import { registerProjectCommand } from './project-command.js';
import { registerMemoryCommand } from './memory-command.js';
import { registerSkillCommand } from './skill-command.js';
import { registerGrowthCommand } from './growth-command.js';
import { registerAgentCommand } from './agent-command.js';

export function createProgram(): Command {
  const program = new Command();
  program.name('cortex').version('0.1.0').description('Plugin framework for Claude Code');

  registerInitCommand(program);
  registerSoulCommand(program);
  registerProjectCommand(program);
  registerMemoryCommand(program);
  registerSkillCommand(program);
  registerGrowthCommand(program);
  registerAgentCommand(program);

  return program;
}
