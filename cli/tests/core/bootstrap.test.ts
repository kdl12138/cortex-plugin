import { describe, it, expect } from 'vitest';
import { getBootstrapSkillContent } from '../../src/core/bootstrap.js';

describe('getBootstrapSkillContent', () => {
  it('returns a non-empty string', () => {
    const content = getBootstrapSkillContent();
    expect(content).toBeTruthy();
    expect(typeof content).toBe('string');
    expect(content.length).toBeGreaterThan(0);
  });

  it('references key CLI commands', () => {
    const content = getBootstrapSkillContent();
    expect(content).toContain('cortex soul show');
    expect(content).toContain('cortex memory recall');
    expect(content).toContain('cortex memory write');
    expect(content).toContain('cortex memory list');
    expect(content).toContain('cortex memory gc');
    expect(content).toContain('cortex skill match');
    expect(content).toContain('cortex skill create');
    expect(content).toContain('cortex skill update');
    expect(content).toContain('cortex skill list');
    expect(content).toContain('cortex growth log');
    expect(content).toContain('cortex growth log --content');
    expect(content).toContain('cortex growth report --days');
    expect(content).toContain('cortex project current');
    // Agent orchestration commands
    expect(content).toContain('cortex agent run');
    expect(content).toContain('cortex agent list');
    expect(content).toContain('cortex agent update');
  });

  it('covers agent orchestration guidance', () => {
    const content = getBootstrapSkillContent();
    // References agent run command with task flag
    expect(content).toContain('cortex agent run <playbook> --task');
    // Explains JSON output to stdout
    expect(content).toContain('stdout');
    expect(content).toContain('JSON');
    // Guidance for structured plans with steps
    expect(content).toContain('steps');
    // Guidance for open-ended plans with strategy and roles
    expect(content).toContain('strategy');
    expect(content).toContain('roles');
    // Reference to playbook-strategy.md
    expect(content).toContain('playbook-strategy.md');
    // When to use playbooks guidance
    expect(content).toContain('复杂多角色任务');
  });

  it('contains skill frontmatter', () => {
    const content = getBootstrapSkillContent();
    expect(content).toMatch(/^---\n/);
    expect(content).toContain('name:');
    expect(content).toContain('description:');
  });

  it('covers session lifecycle guidance', () => {
    const content = getBootstrapSkillContent();
    // Should mention soul.yaml
    expect(content).toContain('soul.yaml');
    // Should reference memory and growth concepts
    expect(content).toContain('memory');
    expect(content).toContain('growth');
    // Should reference memory-strategy.md
    expect(content).toContain('memory-strategy.md');
    // Should reference skill-strategy.md
    expect(content).toContain('skill-strategy.md');
  });

  it('provides detailed growth guidance', () => {
    const content = getBootstrapSkillContent();
    // Growth log is the final step at session end
    expect(content).toContain('会话的最后一步');
    // Guidance on when to log
    expect(content).toContain('非平凡任务');
    expect(content).toContain('克服了困难');
    expect(content).toContain('用户反馈');
    // Guidance on what makes a good entry (narrative reflection)
    expect(content).toContain('我学到了什么');
    // Connect growth to strategy files
    expect(content).toContain('strategy 文件');
  });
});
