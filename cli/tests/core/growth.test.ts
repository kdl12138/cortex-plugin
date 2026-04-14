import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { appendGrowthLog, getGrowthReport } from '../../src/core/growth.js';

describe('appendGrowthLog', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-growth-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a daily log file with timestamped entry', () => {
    appendGrowthLog(tmpDir, 'Learned about microservice decomposition.');
    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(tmpDir, '.cortex', 'growth', `${today}.log`);
    expect(existsSync(logFile)).toBe(true);
    const content = readFileSync(logFile, 'utf-8');
    expect(content).toContain('Learned about microservice decomposition.');
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T/);
  });

  it('appends to existing daily log file', () => {
    appendGrowthLog(tmpDir, 'First entry.');
    appendGrowthLog(tmpDir, 'Second entry.');
    const today = new Date().toISOString().slice(0, 10);
    const logFile = join(tmpDir, '.cortex', 'growth', `${today}.log`);
    const content = readFileSync(logFile, 'utf-8');
    expect(content).toContain('First entry.');
    expect(content).toContain('Second entry.');
  });

  it('creates growth directory if missing', () => {
    // tmpDir has no .cortex directory at all
    appendGrowthLog(tmpDir, 'Entry.');
    const today = new Date().toISOString().slice(0, 10);
    expect(existsSync(join(tmpDir, '.cortex', 'growth', `${today}.log`))).toBe(true);
  });
});

describe('getGrowthReport', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'cortex-growth-'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reads log files from the last N days', () => {
    appendGrowthLog(tmpDir, 'Learned something today.');
    appendGrowthLog(tmpDir, 'And a second thing.');
    const report = getGrowthReport(tmpDir, 7);
    expect(report).toContain('Learned something today.');
    expect(report).toContain('And a second thing.');
  });

  it('returns files in chronological order', () => {
    const growthDir = join(tmpDir, '.cortex', 'growth');
    mkdirSync(growthDir, { recursive: true });

    const today = new Date();
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(today.getDate() - 2);

    const todayStr = today.toISOString().slice(0, 10);
    const olderStr = twoDaysAgo.toISOString().slice(0, 10);

    writeFileSync(join(growthDir, `${todayStr}.log`), 'newer entry\n', 'utf-8');
    writeFileSync(join(growthDir, `${olderStr}.log`), 'older entry\n', 'utf-8');

    const report = getGrowthReport(tmpDir, 7);
    const olderPos = report.indexOf('older entry');
    const newerPos = report.indexOf('newer entry');
    expect(olderPos).toBeGreaterThanOrEqual(0);
    expect(newerPos).toBeGreaterThanOrEqual(0);
    expect(olderPos).toBeLessThan(newerPos);
  });

  it('returns empty string when no logs exist', () => {
    const report = getGrowthReport(tmpDir, 7);
    expect(report).toBe('');
  });

  it('respects the days parameter', () => {
    const growthDir = join(tmpDir, '.cortex', 'growth');
    mkdirSync(growthDir, { recursive: true });

    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
    const oldStr = tenDaysAgo.toISOString().slice(0, 10);

    writeFileSync(join(growthDir, `${oldStr}.log`), 'old entry\n', 'utf-8');

    const report = getGrowthReport(tmpDir, 3);
    expect(report).toBe('');
  });
});
