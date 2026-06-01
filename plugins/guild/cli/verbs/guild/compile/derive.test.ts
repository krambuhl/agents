import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { derive } from './derive.ts';
import { parse } from './parse.ts';
import { DeriveError, type AxesData, type Cell } from './types.ts';

const pluginRoot = dirname(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))));
const AXES_PATH = join(pluginRoot, 'modes', 'axes.toml');

function deriveSeed(): Cell[] {
  return derive(parse(readFileSync(AXES_PATH, 'utf8')));
}

describe('derive: seed axes.toml', () => {
  it('produces a non-empty deterministic Cell list', () => {
    const cells = deriveSeed();
    expect(cells.length).toBeGreaterThan(0);

    const a = derive(parse(readFileSync(AXES_PATH, 'utf8')));
    const b = derive(parse(readFileSync(AXES_PATH, 'utf8')));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('reviewer-default recipe emits one evaluator-<domain> cell per domain', () => {
    const cells = deriveSeed();
    const reviewerCells = cells.filter((c: Cell) => c.source === 'recipe' && c.source_name === 'reviewer-default');
    expect(reviewerCells.length).toBeGreaterThan(0);
    for (const cell of reviewerCells) {
      expect(cell.phase).toBe('reviewer');
      expect(cell.personality).toBe('skeptic');
      expect(cell.id).toBe(`evaluator-${cell.domain}`);
    }
  });

  it('plan recipes emit plan-<domain> cells', () => {
    const cells = deriveSeed();
    const planCells = cells.filter((c: Cell) => c.phase === 'plan' && c.source === 'recipe');
    expect(planCells.length).toBeGreaterThan(0);
    for (const cell of planCells) {
      expect(cell.id).toBe(`plan-${cell.domain}`);
    }
  });

  it('singletons are emitted with their explicit name and null domain', () => {
    const cells = deriveSeed();
    const singletons = cells.filter((c: Cell) => c.source === 'singleton');
    expect(singletons.length).toBeGreaterThan(0);
    for (const cell of singletons) {
      expect(cell.domain).toBeNull();
      expect(cell.id).toBe(cell.source_name);
    }
  });

  it('recipes come before singletons in the ordering', () => {
    const cells = deriveSeed();
    const firstSingletonIdx = cells.findIndex((c: Cell) => c.source === 'singleton');
    if (firstSingletonIdx >= 0) {
      // Walk backwards manually (TS lib doesn't include es2023 findLastIndex).
      let lastRecipeIdx = -1;
      for (let i = cells.length - 1; i >= 0; i--) {
        if (cells[i]!.source === 'recipe') {
          lastRecipeIdx = i;
          break;
        }
      }
      expect(lastRecipeIdx).toBeLessThan(firstSingletonIdx);
    }
  });
});

describe('derive: error cases', () => {
  function makeData(overrides: Partial<AxesData> = {}): AxesData {
    return {
      schema_version: 1,
      domains: {},
      personalities: {},
      phases: {},
      recipes: [],
      singletons: [],
      retained: [],
      ...overrides,
    };
  }

  it('throws DeriveError when a recipe references an unknown phase prefix', () => {
    const data = makeData({
      recipes: [{ name: 'r', phase: 'no-such-phase', personality: 'p', domains: ['d'] }],
    });
    expect(() => derive(data)).toThrow(DeriveError);
    expect(() => derive(data)).toThrow(/no-such-phase/);
  });

  it('throws DeriveError when two recipes produce the same cell id', () => {
    const data = makeData({
      recipes: [
        { name: 'r1', phase: 'reviewer', personality: 'p1', domains: ['x'] },
        { name: 'r2', phase: 'reviewer', personality: 'p2', domains: ['x'] },
      ],
    });
    expect(() => derive(data)).toThrow(DeriveError);
    expect(() => derive(data)).toThrow(/evaluator-x/);
  });

  it('throws DeriveError when a singleton id collides with a recipe-derived id', () => {
    const data = makeData({
      recipes: [{ name: 'r', phase: 'reviewer', personality: 'p', domains: ['a'] }],
      singletons: [{ name: 'evaluator-a', phase: 'reviewer', personality: 'p' }],
    });
    expect(() => derive(data)).toThrow(DeriveError);
    expect(() => derive(data)).toThrow(/evaluator-a/);
  });
});
