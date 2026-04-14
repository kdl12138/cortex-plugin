import { describe, it, expect } from 'vitest';
import { computeFreshness } from '../../src/core/freshness.js';

describe('computeFreshness', () => {
  it('returns 1.0 when no time has elapsed', () => {
    const now = new Date();
    expect(computeFreshness(now, now)).toBeCloseTo(1.0);
  });

  it('returns high freshness after 1 hour', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const f = computeFreshness(oneHourAgo, now);
    expect(f).toBeGreaterThan(0.9);
    expect(f).toBeLessThan(1.0);
  });

  it('returns moderate freshness after 1 week', () => {
    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const f = computeFreshness(oneWeekAgo, now);
    expect(f).toBeGreaterThan(0.5);
    expect(f).toBeLessThan(0.8);
  });

  it('returns lower freshness after 6 months than after 1 week', () => {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const f6m = computeFreshness(sixMonthsAgo, now);
    const f1w = computeFreshness(oneWeekAgo, now);
    expect(f6m).toBeGreaterThan(0);
    expect(f6m).toBeLessThan(f1w);
  });

  it('is monotonically decreasing', () => {
    const now = new Date();
    const values = [1, 24, 168, 720, 4320].map((hours) => {
      const past = new Date(now.getTime() - hours * 60 * 60 * 1000);
      return computeFreshness(past, now);
    });
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeLessThan(values[i - 1]);
    }
  });

  it('always returns a value between 0 and 1', () => {
    const now = new Date();
    const veryOld = new Date(now.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
    const f = computeFreshness(veryOld, now);
    expect(f).toBeGreaterThan(0);
    expect(f).toBeLessThanOrEqual(1.0);
  });
});
