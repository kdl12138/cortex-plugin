import { describe, it, expect } from 'vitest';
import { createProgram } from '../../src/cli/program.js';

describe('createProgram', () => {
  it('should create a program with name "cortex"', () => {
    expect(createProgram().name()).toBe('cortex');
  });

  it('should have version 0.1.0', () => {
    expect(createProgram().version()).toBe('0.1.0');
  });
});
