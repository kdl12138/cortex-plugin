import { describe, it, expect } from 'vitest';
import { join } from 'path';
import os from 'os';
import { getCortexPaths } from '../../src/utils/paths.js';

describe('getCortexPaths', () => {
  const tmpDir = '/tmp/cortex-test-paths';

  it('should return cortexDir as base/.cortex', () => {
    const paths = getCortexPaths(tmpDir);
    expect(paths.cortexDir).toBe(join(tmpDir, '.cortex'));
  });

  it('should return soulFile as base/.cortex/soul.yaml', () => {
    const paths = getCortexPaths(tmpDir);
    expect(paths.soulFile).toBe(join(tmpDir, '.cortex', 'soul.yaml'));
  });

  it('should return dbFile as base/.cortex/cortex.db', () => {
    const paths = getCortexPaths(tmpDir);
    expect(paths.dbFile).toBe(join(tmpDir, '.cortex', 'cortex.db'));
  });

  it('should return activeProjectFile as base/.cortex/active_project', () => {
    const paths = getCortexPaths(tmpDir);
    expect(paths.activeProjectFile).toBe(join(tmpDir, '.cortex', 'active_project'));
  });

  it('should return memoryDir as base/.cortex/memory', () => {
    const paths = getCortexPaths(tmpDir);
    expect(paths.memoryDir).toBe(join(tmpDir, '.cortex', 'memory'));
  });

  it('should return skillsDir as base/.cortex/skills', () => {
    const paths = getCortexPaths(tmpDir);
    expect(paths.skillsDir).toBe(join(tmpDir, '.cortex', 'skills'));
  });

  it('should return growthDir as base/.cortex/growth', () => {
    const paths = getCortexPaths(tmpDir);
    expect(paths.growthDir).toBe(join(tmpDir, '.cortex', 'growth'));
  });

  it('should return playbooksDir as base/.cortex/playbooks', () => {
    const paths = getCortexPaths(tmpDir);
    expect(paths.playbooksDir).toBe(join(tmpDir, '.cortex', 'playbooks'));
  });

  it('should default to os.homedir() when no base is provided', () => {
    const paths = getCortexPaths();
    expect(paths.cortexDir).toBe(join(os.homedir(), '.cortex'));
  });
});
