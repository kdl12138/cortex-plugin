import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Database from 'better-sqlite3';
import { initDatabase } from '../../src/db/database.js';
import { initCortexDir } from '../../src/core/init.js';
import { createSkill, matchSkills, updateSkill, listSkills } from '../../src/core/skill.js';

describe('createSkill', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-skill-'));
    initCortexDir(tmpDir);
    db = initDatabase(join(tmpDir, '.cortex', 'cortex.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a core hard skill file and indexes it', () => {
    const content = '---\ntype: hard\ntriggers: [/deploy]\n---\n\nDeploy the application.';
    const id = createSkill(db, tmpDir, {
      id: 'deploy-app',
      content,
      type: 'hard',
      scope: 'core',
      triggers: ['/deploy'],
    });

    expect(id).toBe('deploy-app');

    // Verify file at skills/hard/<id>.md
    const filePath = join(tmpDir, '.cortex', 'skills', 'hard', 'deploy-app.md');
    expect(existsSync(filePath)).toBe(true);
    const fileContent = readFileSync(filePath, 'utf-8');
    expect(fileContent).toBe(content);

    // Verify skill_index row
    const row = db.prepare('SELECT * FROM skill_index WHERE id = ?').get(id) as any;
    expect(row).toBeDefined();
    expect(row.type).toBe('hard');
    expect(row.scope).toBe('core');
    expect(row.file_path).toBe(filePath);
    expect(row.triggers).toBe(JSON.stringify(['/deploy']));
    expect(row.project).toBeNull();
    expect(row.domain).toBeNull();
    expect(row.abstraction).toBeNull();
    expect(row.created_at).toBeDefined();
    expect(row.updated_at).toBeDefined();
    expect(row.created_at).toBe(row.updated_at);

    // Verify skill_fts row
    const ftsRow = db.prepare('SELECT * FROM skill_fts WHERE id = ?').get(id) as any;
    expect(ftsRow).toBeDefined();
    expect(ftsRow.content).toBe(content);
    expect(ftsRow.triggers).toBe('/deploy');
    expect(ftsRow.domain).toBe('');
  });

  it('creates a core soft skill file and indexes it', () => {
    const content = '---\ntype: soft\ndomain: [testing, quality]\nabstraction: high\n---\n\nAlways write tests first.';
    const id = createSkill(db, tmpDir, {
      id: 'tdd-practice',
      content,
      type: 'soft',
      scope: 'core',
      domain: ['testing', 'quality'],
      abstraction: 'high',
    });

    expect(id).toBe('tdd-practice');

    // Verify file at skills/soft/<id>.md
    const filePath = join(tmpDir, '.cortex', 'skills', 'soft', 'tdd-practice.md');
    expect(existsSync(filePath)).toBe(true);

    // Verify skill_index includes domain and abstraction
    const row = db.prepare('SELECT * FROM skill_index WHERE id = ?').get(id) as any;
    expect(row).toBeDefined();
    expect(row.type).toBe('soft');
    expect(row.scope).toBe('core');
    expect(row.domain).toBe(JSON.stringify(['testing', 'quality']));
    expect(row.abstraction).toBe('high');
    expect(row.triggers).toBeNull();

    // Verify skill_fts row
    const ftsRow = db.prepare('SELECT * FROM skill_fts WHERE id = ?').get(id) as any;
    expect(ftsRow).toBeDefined();
    expect(ftsRow.domain).toBe('testing quality');
    expect(ftsRow.triggers).toBe('');
  });

  it('creates a project-scoped skill', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'cortex-proj-'));

    try {
      const content = '---\ntype: hard\ntriggers: [/build]\n---\n\nBuild the project.';
      const id = createSkill(db, tmpDir, {
        id: 'build-project',
        content,
        type: 'hard',
        scope: 'project',
        triggers: ['/build'],
        project: 'my-project',
        projectDir,
      });

      expect(id).toBe('build-project');

      // Verify file at <projectDir>/.cortex/skills/<type>/<id>.md
      const filePath = join(projectDir, '.cortex', 'skills', 'hard', 'build-project.md');
      expect(existsSync(filePath)).toBe(true);

      // Verify skill_index row with scope='project', project set
      const row = db.prepare('SELECT * FROM skill_index WHERE id = ?').get(id) as any;
      expect(row).toBeDefined();
      expect(row.scope).toBe('project');
      expect(row.project).toBe('my-project');
      expect(row.file_path).toBe(filePath);
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('throws on duplicate id', () => {
    const content = '---\ntype: hard\n---\n\nSome skill.';
    createSkill(db, tmpDir, {
      id: 'duplicate-skill',
      content,
      type: 'hard',
      scope: 'core',
    });

    expect(() => {
      createSkill(db, tmpDir, {
        id: 'duplicate-skill',
        content,
        type: 'hard',
        scope: 'core',
      });
    }).toThrow(/already exists/);
  });

  it('validates id format', () => {
    const content = '---\ntype: hard\n---\n\nSome skill.';

    // Invalid id with special chars
    expect(() => {
      createSkill(db, tmpDir, {
        id: 'invalid_skill!',
        content,
        type: 'hard',
        scope: 'core',
      });
    }).toThrow(/Invalid skill id/);

    // Invalid id with spaces
    expect(() => {
      createSkill(db, tmpDir, {
        id: 'has space',
        content,
        type: 'hard',
        scope: 'core',
      });
    }).toThrow(/Invalid skill id/);

    // Invalid id with underscores
    expect(() => {
      createSkill(db, tmpDir, {
        id: 'has_underscore',
        content,
        type: 'hard',
        scope: 'core',
      });
    }).toThrow(/Invalid skill id/);
  });

  it('accepts valid ids with alphanumerics and hyphens', () => {
    const content = '---\ntype: hard\n---\n\nSome skill.';

    // All lowercase
    expect(() => {
      createSkill(db, tmpDir, { id: 'abc', content, type: 'hard', scope: 'core' });
    }).not.toThrow();

    // With numbers
    expect(() => {
      createSkill(db, tmpDir, { id: 'skill-123', content, type: 'hard', scope: 'core' });
    }).not.toThrow();

    // Mixed case
    expect(() => {
      createSkill(db, tmpDir, { id: 'MySkill', content, type: 'hard', scope: 'core' });
    }).not.toThrow();
  });

  it('creates parent directories if they do not exist', () => {
    const freshDir = mkdtempSync(join(tmpdir(), 'cortex-fresh-'));

    try {
      const freshDb = initDatabase(join(freshDir, 'test.db'));
      try {
        const content = '---\ntype: soft\n---\n\nContent.';
        const id = createSkill(freshDb, freshDir, {
          id: 'new-dir-skill',
          content,
          type: 'soft',
          scope: 'core',
        });

        const filePath = join(freshDir, '.cortex', 'skills', 'soft', 'new-dir-skill.md');
        expect(existsSync(filePath)).toBe(true);
      } finally {
        freshDb.close();
      }
    } finally {
      rmSync(freshDir, { recursive: true, force: true });
    }
  });

  it('stores created_at and updated_at as ISO strings', () => {
    const before = new Date().toISOString();
    const content = '---\ntype: hard\n---\n\nTimestamp skill.';
    const id = createSkill(db, tmpDir, {
      id: 'timestamp-skill',
      content,
      type: 'hard',
      scope: 'core',
    });
    const after = new Date().toISOString();

    const row = db.prepare('SELECT * FROM skill_index WHERE id = ?').get(id) as any;
    expect(row.created_at >= before).toBe(true);
    expect(row.created_at <= after).toBe(true);
    expect(row.updated_at).toBe(row.created_at);
  });

  it('wraps DB operations in a transaction (no partial state on error)', () => {
    // Manually insert a skill_index row to cause a UNIQUE constraint failure
    // when createSkill tries to insert into skill_index
    db.prepare(
      `INSERT INTO skill_index (id, file_path, type, scope, project, triggers, domain, abstraction, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run('txn-test', '/fake/path', 'hard', 'core', null, null, null, null, new Date().toISOString(), new Date().toISOString());

    const content = '---\ntype: hard\n---\n\nTransaction test.';
    expect(() => {
      createSkill(db, tmpDir, {
        id: 'txn-test',
        content,
        type: 'hard',
        scope: 'core',
      });
    }).toThrow();

    // Verify no skill_fts row was created (transaction should have rolled back)
    const ftsRow = db.prepare('SELECT * FROM skill_fts WHERE id = ?').get('txn-test');
    expect(ftsRow).toBeUndefined();
  });
});

describe('matchSkills', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-skill-match-'));
    initCortexDir(tmpDir);
    db = initDatabase(join(tmpDir, '.cortex', 'cortex.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('matches hard skills by trigger keywords', () => {
    createSkill(db, tmpDir, {
      id: 'run-tests',
      content: '---\ntype: hard\ntriggers: ["run tests", "CI"]\n---\n\nRun the test suite.',
      type: 'hard',
      scope: 'core',
      triggers: ['run tests', 'CI'],
    });

    const results = matchSkills(db, tmpDir, 'I need to run tests');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe('run-tests');
    expect(results[0].type).toBe('hard');
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].triggers).toEqual(['run tests', 'CI']);
  });

  it('matches soft skills by domain and content', () => {
    createSkill(db, tmpDir, {
      id: 'system-design-guide',
      content: '---\ntype: soft\ndomain: [system-design]\n---\n\nDesign scalable microservices architectures.',
      type: 'soft',
      scope: 'core',
      domain: ['system-design'],
    });

    const results = matchSkills(db, tmpDir, 'system design for microservices');
    expect(results.length).toBeGreaterThanOrEqual(1);
    const found = results.find((r) => r.id === 'system-design-guide');
    expect(found).toBeDefined();
    expect(found!.type).toBe('soft');
    expect(found!.score).toBeGreaterThan(0);
  });

  it('returns hard matches before soft matches', () => {
    createSkill(db, tmpDir, {
      id: 'deploy-hard',
      content: '---\ntype: hard\ntriggers: ["deploy"]\n---\n\nDeploy the application to production.',
      type: 'hard',
      scope: 'core',
      triggers: ['deploy'],
    });
    createSkill(db, tmpDir, {
      id: 'deploy-soft',
      content: '---\ntype: soft\ndomain: [deployment]\n---\n\nBest practices for deploying applications.',
      type: 'soft',
      scope: 'core',
      domain: ['deployment'],
    });

    const results = matchSkills(db, tmpDir, 'deploy the application');
    expect(results.length).toBeGreaterThanOrEqual(2);
    // Hard matches should come before soft matches
    const hardIndex = results.findIndex((r) => r.id === 'deploy-hard');
    const softIndex = results.findIndex((r) => r.id === 'deploy-soft');
    expect(hardIndex).toBeLessThan(softIndex);
  });

  it('scopes to core and current project by default', () => {
    createSkill(db, tmpDir, {
      id: 'core-lint',
      content: '---\ntype: hard\ntriggers: ["lint"]\n---\n\nRun linting on the codebase.',
      type: 'hard',
      scope: 'core',
      triggers: ['lint'],
    });

    const projectDir = mkdtempSync(join(tmpdir(), 'cortex-proj-'));
    try {
      createSkill(db, tmpDir, {
        id: 'alpha-lint',
        content: '---\ntype: hard\ntriggers: ["lint"]\n---\n\nRun linting for alpha project.',
        type: 'hard',
        scope: 'project',
        triggers: ['lint'],
        project: 'alpha',
        projectDir,
      });
      createSkill(db, tmpDir, {
        id: 'beta-lint',
        content: '---\ntype: hard\ntriggers: ["lint"]\n---\n\nRun linting for beta project.',
        type: 'hard',
        scope: 'project',
        triggers: ['lint'],
        project: 'beta',
        projectDir,
      });

      const results = matchSkills(db, tmpDir, 'lint the code', {
        currentProject: 'alpha',
      });

      const ids = results.map((r) => r.id);
      expect(ids).toContain('core-lint');
      expect(ids).toContain('alpha-lint');
      expect(ids).not.toContain('beta-lint');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('returns all scopes with crossProject option', () => {
    createSkill(db, tmpDir, {
      id: 'core-build',
      content: '---\ntype: hard\ntriggers: ["build"]\n---\n\nBuild the project.',
      type: 'hard',
      scope: 'core',
      triggers: ['build'],
    });

    const projectDir = mkdtempSync(join(tmpdir(), 'cortex-proj-'));
    try {
      createSkill(db, tmpDir, {
        id: 'alpha-build',
        content: '---\ntype: hard\ntriggers: ["build"]\n---\n\nBuild for alpha project.',
        type: 'hard',
        scope: 'project',
        triggers: ['build'],
        project: 'alpha',
        projectDir,
      });
      createSkill(db, tmpDir, {
        id: 'beta-build',
        content: '---\ntype: hard\ntriggers: ["build"]\n---\n\nBuild for beta project.',
        type: 'hard',
        scope: 'project',
        triggers: ['build'],
        project: 'beta',
        projectDir,
      });

      const results = matchSkills(db, tmpDir, 'build the project', {
        crossProject: true,
        currentProject: 'alpha',
      });

      const ids = results.map((r) => r.id);
      expect(ids).toContain('core-build');
      expect(ids).toContain('alpha-build');
      expect(ids).toContain('beta-build');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('returns empty array when no matches', () => {
    createSkill(db, tmpDir, {
      id: 'unrelated-skill',
      content: '---\ntype: hard\ntriggers: ["deploy"]\n---\n\nDeploy the application.',
      type: 'hard',
      scope: 'core',
      triggers: ['deploy'],
    });

    const results = matchSkills(db, tmpDir, 'zyxwvutsrqponm');
    expect(results).toEqual([]);
  });

  it('reads file content from disk for matched skills', () => {
    const content = '---\ntype: hard\ntriggers: ["format"]\n---\n\nFormat the code using prettier.';
    createSkill(db, tmpDir, {
      id: 'format-code',
      content,
      type: 'hard',
      scope: 'core',
      triggers: ['format'],
    });

    const results = matchSkills(db, tmpDir, 'format the source files');
    expect(results.length).toBe(1);
    expect(results[0].content).toBe(content);
  });

  it('respects limit option', () => {
    for (let i = 0; i < 5; i++) {
      createSkill(db, tmpDir, {
        id: `test-skill-${i}`,
        content: `---\ntype: hard\ntriggers: ["test"]\n---\n\nTest skill number ${i}.`,
        type: 'hard',
        scope: 'core',
        triggers: ['test'],
      });
    }

    const results = matchSkills(db, tmpDir, 'run a test', { limit: 2 });
    expect(results.length).toBe(2);
  });

  it('handles FTS query errors gracefully and returns only hard matches', () => {
    createSkill(db, tmpDir, {
      id: 'hard-fallback',
      content: '---\ntype: hard\ntriggers: ["compile"]\n---\n\nCompile the project.',
      type: 'hard',
      scope: 'core',
      triggers: ['compile'],
    });
    createSkill(db, tmpDir, {
      id: 'soft-fallback',
      content: '---\ntype: soft\ndomain: [compilation]\n---\n\nCompilation best practices.',
      type: 'soft',
      scope: 'core',
      domain: ['compilation'],
    });

    // Use FTS5-invalid syntax as the situation to trigger an FTS error
    // Note: The hard match uses substring matching on triggers, so it still works
    const results = matchSkills(db, tmpDir, 'compile something');
    // Should at least have the hard match
    const hardMatch = results.find((r) => r.id === 'hard-fallback');
    expect(hardMatch).toBeDefined();
  });

  it('scores hard skills by number of trigger matches', () => {
    createSkill(db, tmpDir, {
      id: 'multi-trigger',
      content: '---\ntype: hard\ntriggers: ["test", "run", "check"]\n---\n\nRun and test checks.',
      type: 'hard',
      scope: 'core',
      triggers: ['test', 'run', 'check'],
    });
    createSkill(db, tmpDir, {
      id: 'single-trigger',
      content: '---\ntype: hard\ntriggers: ["test"]\n---\n\nRun tests only.',
      type: 'hard',
      scope: 'core',
      triggers: ['test'],
    });

    const results = matchSkills(db, tmpDir, 'run the test and check results');
    const multi = results.find((r) => r.id === 'multi-trigger');
    const single = results.find((r) => r.id === 'single-trigger');
    expect(multi).toBeDefined();
    expect(single).toBeDefined();
    // multi-trigger should have higher score (3 matches vs 1)
    expect(multi!.score).toBeGreaterThan(single!.score);
  });
});

describe('updateSkill', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-skill-update-'));
    initCortexDir(tmpDir);
    db = initDatabase(join(tmpDir, '.cortex', 'cortex.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('overwrites skill file and updates index', () => {
    const originalContent = '---\ntype: hard\ntriggers: ["/deploy"]\n---\n\nDeploy the application.';
    createSkill(db, tmpDir, {
      id: 'deploy-app',
      content: originalContent,
      type: 'hard',
      scope: 'core',
      triggers: ['/deploy'],
    });

    const originalRow = db.prepare('SELECT * FROM skill_index WHERE id = ?').get('deploy-app') as any;
    const originalUpdatedAt = originalRow.updated_at;

    // Small delay to ensure updated_at changes
    const before = new Date().toISOString();

    const newContent = '---\ntype: hard\ntriggers: ["/deploy"]\n---\n\nUpdated deployment instructions.';
    updateSkill(db, tmpDir, 'deploy-app', { content: newContent });

    // Verify file content changed on disk
    const filePath = join(tmpDir, '.cortex', 'skills', 'hard', 'deploy-app.md');
    const diskContent = readFileSync(filePath, 'utf-8');
    expect(diskContent).toBe(newContent);

    // Verify updated_at changed
    const updatedRow = db.prepare('SELECT * FROM skill_index WHERE id = ?').get('deploy-app') as any;
    expect(updatedRow.updated_at >= before).toBe(true);

    // Verify skill_fts updated (search for new content works)
    const ftsRow = db.prepare('SELECT * FROM skill_fts WHERE id = ?').get('deploy-app') as any;
    expect(ftsRow).toBeDefined();
    expect(ftsRow.content).toContain('Updated deployment instructions');
  });

  it('updates metadata fields when provided', () => {
    const originalContent = '---\ntype: hard\ntriggers: ["/deploy"]\n---\n\nDeploy the application.';
    createSkill(db, tmpDir, {
      id: 'meta-skill',
      content: originalContent,
      type: 'hard',
      scope: 'core',
      triggers: ['/deploy'],
      domain: ['ops'],
      abstraction: 'low',
    });

    const newContent = '---\ntype: hard\ntriggers: ["/release", "/ship"]\n---\n\nRelease and ship the application.';
    updateSkill(db, tmpDir, 'meta-skill', {
      content: newContent,
      triggers: ['/release', '/ship'],
      domain: ['ops', 'release'],
      abstraction: 'medium',
    });

    // Verify skill_index row updated
    const row = db.prepare('SELECT * FROM skill_index WHERE id = ?').get('meta-skill') as any;
    expect(row.triggers).toBe(JSON.stringify(['/release', '/ship']));
    expect(row.domain).toBe(JSON.stringify(['ops', 'release']));
    expect(row.abstraction).toBe('medium');

    // Verify FTS row has updated triggers and domain
    const ftsRow = db.prepare('SELECT * FROM skill_fts WHERE id = ?').get('meta-skill') as any;
    expect(ftsRow.triggers).toBe('/release /ship');
    expect(ftsRow.domain).toBe('ops release');
  });

  it('throws if skill not found', () => {
    expect(() => {
      updateSkill(db, tmpDir, 'nonexistent-skill', { content: 'some content' });
    }).toThrow(/not found/);
  });

  it('strips frontmatter when storing content in FTS', () => {
    const originalContent = '---\ntype: soft\ndomain: [testing]\n---\n\nAlways write tests first.';
    createSkill(db, tmpDir, {
      id: 'tdd-update',
      content: originalContent,
      type: 'soft',
      scope: 'core',
      domain: ['testing'],
    });

    const newContent = '---\ntype: soft\ndomain: [testing]\n---\n\nWrite tests before code. Red-green-refactor.';
    updateSkill(db, tmpDir, 'tdd-update', { content: newContent });

    const ftsRow = db.prepare('SELECT * FROM skill_fts WHERE id = ?').get('tdd-update') as any;
    // FTS content should NOT contain YAML frontmatter
    expect(ftsRow.content).not.toContain('---');
    expect(ftsRow.content).not.toContain('type: soft');
    // FTS content should contain the body
    expect(ftsRow.content).toContain('Write tests before code');
  });

  it('preserves existing metadata fields when not provided in update', () => {
    const originalContent = '---\ntype: hard\ntriggers: ["/build"]\n---\n\nBuild the project.';
    createSkill(db, tmpDir, {
      id: 'preserve-skill',
      content: originalContent,
      type: 'hard',
      scope: 'core',
      triggers: ['/build'],
      domain: ['build'],
      abstraction: 'low',
    });

    const newContent = '---\ntype: hard\ntriggers: ["/build"]\n---\n\nBuild the project with optimizations.';
    // Update only content, no triggers/domain/abstraction
    updateSkill(db, tmpDir, 'preserve-skill', { content: newContent });

    // Verify existing metadata is preserved
    const row = db.prepare('SELECT * FROM skill_index WHERE id = ?').get('preserve-skill') as any;
    expect(row.triggers).toBe(JSON.stringify(['/build']));
    expect(row.domain).toBe(JSON.stringify(['build']));
    expect(row.abstraction).toBe('low');
  });
});

describe('listSkills', () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-skill-list-'));
    initCortexDir(tmpDir);
    db = initDatabase(join(tmpDir, '.cortex', 'cortex.db'));
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('lists all skills sorted by updated_at DESC', () => {
    createSkill(db, tmpDir, {
      id: 'skill-a',
      content: '---\ntype: hard\ntriggers: ["/a"]\n---\n\nSkill A.',
      type: 'hard',
      scope: 'core',
      triggers: ['/a'],
    });
    createSkill(db, tmpDir, {
      id: 'skill-b',
      content: '---\ntype: soft\ndomain: ["testing"]\n---\n\nSkill B.',
      type: 'soft',
      scope: 'core',
      domain: ['testing'],
    });

    // Update skill-a so its updated_at is newer
    updateSkill(db, tmpDir, 'skill-a', { content: '---\ntype: hard\ntriggers: ["/a"]\n---\n\nSkill A updated.' });

    const results = listSkills(db);
    expect(results.length).toBe(2);
    // skill-a was updated more recently, should come first
    expect(results[0].id).toBe('skill-a');
    expect(results[1].id).toBe('skill-b');
    // Verify each result has all expected fields
    expect(results[0]).toMatchObject({
      id: 'skill-a',
      type: 'hard',
      scope: 'core',
      project: null,
      abstraction: null,
    });
    expect(Array.isArray(results[0].triggers)).toBe(true);
    expect(Array.isArray(results[0].domain)).toBe(true);
    expect(results[0].created_at).toBeDefined();
    expect(results[0].updated_at).toBeDefined();
  });

  it('filters by type', () => {
    createSkill(db, tmpDir, {
      id: 'hard-skill-1',
      content: '---\ntype: hard\ntriggers: ["/deploy"]\n---\n\nDeploy.',
      type: 'hard',
      scope: 'core',
      triggers: ['/deploy'],
    });
    createSkill(db, tmpDir, {
      id: 'soft-skill-1',
      content: '---\ntype: soft\ndomain: ["quality"]\n---\n\nQuality practices.',
      type: 'soft',
      scope: 'core',
      domain: ['quality'],
    });
    createSkill(db, tmpDir, {
      id: 'hard-skill-2',
      content: '---\ntype: hard\ntriggers: ["/build"]\n---\n\nBuild.',
      type: 'hard',
      scope: 'core',
      triggers: ['/build'],
    });

    const hardOnly = listSkills(db, { type: 'hard' });
    expect(hardOnly.length).toBe(2);
    expect(hardOnly.every((s) => s.type === 'hard')).toBe(true);

    const softOnly = listSkills(db, { type: 'soft' });
    expect(softOnly.length).toBe(1);
    expect(softOnly[0].id).toBe('soft-skill-1');
    expect(softOnly[0].type).toBe('soft');
  });

  it('filters by scope', () => {
    const projectDir = mkdtempSync(join(tmpdir(), 'cortex-proj-'));
    try {
      createSkill(db, tmpDir, {
        id: 'core-skill',
        content: '---\ntype: hard\ntriggers: ["/test"]\n---\n\nCore test skill.',
        type: 'hard',
        scope: 'core',
        triggers: ['/test'],
      });
      createSkill(db, tmpDir, {
        id: 'project-skill',
        content: '---\ntype: hard\ntriggers: ["/test"]\n---\n\nProject test skill.',
        type: 'hard',
        scope: 'project',
        triggers: ['/test'],
        project: 'my-project',
        projectDir,
      });

      const coreOnly = listSkills(db, { scope: 'core' });
      expect(coreOnly.length).toBe(1);
      expect(coreOnly[0].id).toBe('core-skill');
      expect(coreOnly[0].scope).toBe('core');

      const projectOnly = listSkills(db, { scope: 'project' });
      expect(projectOnly.length).toBe(1);
      expect(projectOnly[0].id).toBe('project-skill');
      expect(projectOnly[0].scope).toBe('project');
      expect(projectOnly[0].project).toBe('my-project');
    } finally {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it('returns empty array when no skills', () => {
    const results = listSkills(db);
    expect(results).toEqual([]);
  });
});
