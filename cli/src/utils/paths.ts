import { join } from 'path';
import os from 'os';

export interface CortexPaths {
  cortexDir: string;
  soulFile: string;
  dbFile: string;
  activeProjectFile: string;
  memoryDir: string;
  skillsDir: string;
  growthDir: string;
  playbooksDir: string;
}

export function getCortexPaths(base: string = os.homedir()): CortexPaths {
  const cortexDir = join(base, '.cortex');

  return {
    cortexDir,
    soulFile: join(cortexDir, 'soul.yaml'),
    dbFile: join(cortexDir, 'cortex.db'),
    activeProjectFile: join(cortexDir, 'active_project'),
    memoryDir: join(cortexDir, 'memory'),
    skillsDir: join(cortexDir, 'skills'),
    growthDir: join(cortexDir, 'growth'),
    playbooksDir: join(cortexDir, 'playbooks'),
  };
}
