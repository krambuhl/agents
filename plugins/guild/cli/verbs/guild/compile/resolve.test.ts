import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { derive } from './derive.ts';
import { parse } from './parse.ts';
import { resolve, type FragmentReader } from './resolve.ts';
import { ResolveError, type AxesData, type Cell } from './types.ts';

const pluginRoot = dirname(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))));
const AXES_PATH = join(pluginRoot, 'axes.toml');

function realReader(): FragmentReader {
  return (relPath: string) => readFileSync(join(pluginRoot, relPath), 'utf8');
}

function makeData(): AxesData {
  return parse(readFileSync(AXES_PATH, 'utf8'));
}

describe('resolve: seed axes.toml cells', () => {
  it('resolves an evaluator (reviewer) cell with base_tools ∪ domain.tool_grants', () => {
    const data = makeData();
    const cell = derive(data).find((c: Cell) => c.id === 'evaluator-a11y')!;
    expect(cell).toBeDefined();
    const resolved = resolve(data, cell, realReader());
    expect(resolved.phase_fragment.length).toBeGreaterThan(0);
    expect(resolved.personality_fragment.length).toBeGreaterThan(0);
    expect(resolved.domain_fragment.length).toBeGreaterThan(0);
    expect(resolved.tools).toContain('Read');
    expect(resolved.tools.some((t) => t.startsWith('Bash(npm run test:a11y'))).toBe(true);
  });

  it('resolves a whiteboard (planner) cell with base_tools only — no domain grants at planner', () => {
    const data = makeData();
    const cell = derive(data).find((c: Cell) => c.id === 'whiteboard-react')!;
    expect(cell).toBeDefined();
    const resolved = resolve(data, cell, realReader());
    expect(resolved.tools).toEqual(['Glob', 'Grep', 'Read']);
  });

  it('resolves a singleton cell with empty domain_fragment + phase base_tools only', () => {
    const data = makeData();
    const cell = derive(data).find((c: Cell) => c.id === 'whiteboard-skeptic')!;
    expect(cell).toBeDefined();
    const resolved = resolve(data, cell, realReader());
    expect(resolved.domain).toBeNull();
    expect(resolved.domain_fragment).toBe('');
    expect(resolved.tools).toEqual(['Glob', 'Grep', 'Read']);
  });

  it('produces sorted + deduped tools', () => {
    const data = makeData();
    for (const cell of derive(data)) {
      const resolved = resolve(data, cell, realReader());
      const sortedCopy = [...resolved.tools].sort();
      expect(resolved.tools).toEqual(sortedCopy);
      expect(new Set(resolved.tools).size).toBe(resolved.tools.length);
    }
  });
});

describe('resolve: tool fold by verification phase', () => {
  function makeMinimalData(phase: string, writes: boolean, domainGrants: string[]): AxesData {
    return {
      schema_version: 1,
      domains: {
        foo: { name: 'foo', phases: [phase], tool_grants: domainGrants },
      },
      personalities: {
        skeptic: { name: 'skeptic', phases: [phase], disposition: 'doubt' },
      },
      phases: {
        [phase]: {
          name: phase,
          base_tools: ['Read', 'Grep'],
          writes,
          default_personality: 'skeptic',
        },
      },
      recipes: [],
      singletons: [],
      retained: [],
    };
  }

  const dummyReader: FragmentReader = () => 'fragment-body';

  it('reviewer phase folds in domain grants', () => {
    const data = makeMinimalData('reviewer', false, ['Bash(npm run lint:*)']);
    const cell: Cell = {
      id: 'evaluator-foo',
      phase: 'reviewer',
      personality: 'skeptic',
      domain: 'foo',
      source: 'recipe',
      source_name: 'test',
    };
    const resolved = resolve(data, cell, dummyReader);
    expect(resolved.tools).toEqual(['Bash(npm run lint:*)', 'Grep', 'Read']);
  });

  it('implementer phase folds in domain grants', () => {
    const data = makeMinimalData('implementer', true, ['Bash(npm test:*)']);
    const cell: Cell = {
      id: 'generator-foo',
      phase: 'implementer',
      personality: 'skeptic',
      domain: 'foo',
      source: 'recipe',
      source_name: 'test',
    };
    const resolved = resolve(data, cell, dummyReader);
    expect(resolved.tools).toContain('Bash(npm test:*)');
  });

  it('planner phase does NOT fold in domain grants', () => {
    const data = makeMinimalData('planner', false, ['Bash(npm run lint:*)']);
    const cell: Cell = {
      id: 'whiteboard-foo',
      phase: 'planner',
      personality: 'skeptic',
      domain: 'foo',
      source: 'recipe',
      source_name: 'test',
    };
    const resolved = resolve(data, cell, dummyReader);
    expect(resolved.tools).toEqual(['Grep', 'Read']);
  });

  it('researcher phase does NOT fold in domain grants', () => {
    const data = makeMinimalData('researcher', false, ['Bash(npm run lint:*)']);
    const cell: Cell = {
      id: 'whiteboard-foo',
      phase: 'researcher',
      personality: 'skeptic',
      domain: 'foo',
      source: 'recipe',
      source_name: 'test',
    };
    const resolved = resolve(data, cell, dummyReader);
    expect(resolved.tools).toEqual(['Grep', 'Read']);
  });
});

describe('resolve: error cases', () => {
  const dummyReader: FragmentReader = () => '';

  it('throws ResolveError when cell.phase missing from axis.phase.*', () => {
    const data: AxesData = {
      schema_version: 1,
      domains: {},
      personalities: { p: { name: 'p', phases: [], disposition: 'x' } },
      phases: {},
      recipes: [],
      singletons: [],
      retained: [],
    };
    const cell: Cell = {
      id: 'x',
      phase: 'missing',
      personality: 'p',
      domain: null,
      source: 'singleton',
      source_name: 'x',
    };
    expect(() => resolve(data, cell, dummyReader)).toThrow(ResolveError);
  });

  it('throws ResolveError when cell.personality missing from axis.personality.*', () => {
    const data: AxesData = {
      schema_version: 1,
      domains: {},
      personalities: {},
      phases: {
        p: { name: 'p', base_tools: [], writes: false, default_personality: 'q' },
      },
      recipes: [],
      singletons: [],
      retained: [],
    };
    const cell: Cell = {
      id: 'x',
      phase: 'p',
      personality: 'missing',
      domain: null,
      source: 'singleton',
      source_name: 'x',
    };
    expect(() => resolve(data, cell, dummyReader)).toThrow(ResolveError);
  });
});
