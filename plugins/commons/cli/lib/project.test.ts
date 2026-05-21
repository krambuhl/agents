import { test, describe, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  resolveProject,
  listProjects,
  createSlug,
  resolveProjectByPlan,
  listProjectsByPlan,
} from './project.ts';

let projectsRoot: string;

function makeLoomProject(root: string, slug: string): void {
  const path = join(root, slug);
  mkdirSync(path, { recursive: true });
  // Marker file: loom-managed projects carry manifest.json. Filtering
  // by this marker excludes any directory without it (e.g. draft-only
  // projects that haven't been adopted yet).
  writeFileSync(join(path, 'manifest.json'), '{}');
}

beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), 'loom-project-test-'));
  // Active projects
  makeLoomProject(projectsRoot, '2026-05-10-project-a');
  makeLoomProject(projectsRoot, '2026-05-15-loom-cli');
  // Archived
  makeLoomProject(join(projectsRoot, 'archive'), '2026-04-01-old-project');
  // Add some non-project entries that should be ignored
  writeFileSync(join(projectsRoot, 'CONVENTIONS.md'), '# noise\n');
  // Add a bare project (no manifest.json) — must NOT appear in
  // listProjects output. Exercises the manifest-marker filter.
  mkdirSync(join(projectsRoot, '2026-05-12-bare-only'));
});

afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true });
});

test('resolveProject: full slug returns its path', () => {
  const p = resolveProject('2026-05-15-loom-cli', projectsRoot);
  expect(p).toBe(join(projectsRoot, '2026-05-15-loom-cli'));
});

test('resolveProject: date-less suffix returns unique match', () => {
  const p = resolveProject('loom-cli', projectsRoot);
  expect(p).toBe(join(projectsRoot, '2026-05-15-loom-cli'));
});

test('resolveProject: archived slug falls back to archive/', () => {
  const p = resolveProject('old-project', projectsRoot);
  expect(p).toBe(join(projectsRoot, 'archive', '2026-04-01-old-project'));
});

test('resolveProject: relative path resolves to absolute', () => {
  const rel = './2026-05-15-loom-cli';
  const p = resolveProject(join(projectsRoot, rel), projectsRoot);
  expect(p).toBe(resolve(projectsRoot, '2026-05-15-loom-cli'));
});

test('resolveProject: nonexistent slug throws project-not-found', () => {
  expect(() => resolveProject('does-not-exist', projectsRoot)).toThrow(
    /project-not-found/,
  );
});

test('resolveProject: ambiguous suffix throws slug-ambiguous with candidates', () => {
  // Two loom-marked projects sharing the suffix `-foo`
  makeLoomProject(projectsRoot, '2026-05-20-foo');
  makeLoomProject(projectsRoot, '2026-05-25-foo');
  try {
    resolveProject('foo', projectsRoot);
    throw new Error('expected throw');
  } catch (err: unknown) {
    const e = err as { code: string; candidates?: string[] };
    expect(e.code).toBe('slug-ambiguous');
    expect(e.candidates).toBeDefined();
    expect(e.candidates?.length).toBe(2);
  }
});

test('listProjects: filters out projects without manifest.json', () => {
  const list = listProjects(projectsRoot);
  for (const p of list) {
    expect(p.slug).not.toBe('2026-05-12-bare-only');
  }
});

test('listProjects: enumerates active projects only by default', () => {
  const list = listProjects(projectsRoot);
  expect(list.map((p) => p.slug).sort()).toEqual([
    '2026-05-10-project-a',
    '2026-05-15-loom-cli',
  ]);
});

test('listProjects: --archived enumerates the archive instead', () => {
  const list = listProjects(projectsRoot, { archived: true });
  expect(list.map((p) => p.slug)).toEqual(['2026-04-01-old-project']);
});

// ----- createSlug -----

const slugShape = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*[a-z0-9]$/;

test('createSlug: happy path lowercases and joins with date', () => {
  const s = createSlug('Adopt Biome', '2026-05-15');
  expect(s).toBe('2026-05-15-adopt-biome');
  expect(s).toMatch(slugShape);
});

test('createSlug: collapses runs of non-alphanumeric chars to single hyphen', () => {
  expect(createSlug('CLI: plan & revise!', '2026-05-15')).toBe(
    '2026-05-15-cli-plan-revise',
  );
  expect(createSlug('hello  world', '2026-05-15')).toBe(
    '2026-05-15-hello-world',
  );
});

test('createSlug: trims leading and trailing punctuation', () => {
  expect(createSlug('--draft-cli--', '2026-05-15')).toBe(
    '2026-05-15-draft-cli',
  );
  expect(createSlug('   spaced   ', '2026-05-15')).toBe('2026-05-15-spaced');
});

test('createSlug: empty topic throws invalid-topic', () => {
  expect(() => createSlug('', '2026-05-15')).toThrow(/invalid-topic/);
});

test('createSlug: whitespace-only topic throws invalid-topic', () => {
  expect(() => createSlug('   ', '2026-05-15')).toThrow(/invalid-topic/);
});

test('createSlug: all-special-chars topic throws invalid-topic', () => {
  expect(() => createSlug('!!!', '2026-05-15')).toThrow(/invalid-topic/);
  expect(() => createSlug('---', '2026-05-15')).toThrow(/invalid-topic/);
});

test('createSlug: single-character slug fails SLUG_RE — throws invalid-topic', () => {
  // SLUG_RE requires the slug part to be 2+ chars (start AND end with [a-z0-9]).
  expect(() => createSlug('a', '2026-05-15')).toThrow(/invalid-topic/);
});

test('createSlug: malformed date throws invalid-date', () => {
  expect(() => createSlug('valid topic', '05/15/2026')).toThrow(/invalid-date/);
  expect(() => createSlug('valid topic', '2026-5-15')).toThrow(/invalid-date/);
  expect(() => createSlug('valid topic', '')).toThrow(/invalid-date/);
  expect(() => createSlug('valid topic', '2026-05-15T00:00:00')).toThrow(
    /invalid-date/,
  );
});

// ===== PLAN.md filter variants (merged from draft-project.test.ts in PR6) =====
//
// These tests came from the dissolved `draft-project.ts` module. PR6 of
// repo-compartmentalize moved the PLAN.md-filter functions into this
// file (as `resolveProjectByPlan` + `listProjectsByPlan`). The
// assertions check the same behaviors against the new symbol names.

describe('resolveProjectByPlan + listProjectsByPlan: PLAN.md filter', () => {
  let projectsRoot: string;

  function makePlanOnlyProject(root: string, slug: string): void {
    const path = join(root, slug);
    mkdirSync(path, { recursive: true });
    // Marker file: a project qualifies for the PLAN.md filter if it
    // carries PLAN.md. Plan-only projects (this case) have just PLAN.md,
    // no manifest.json. Loom-adopted projects (both markers) also
    // qualify; see makeLoomAndPlanProject below.
    writeFileSync(join(path, 'PLAN.md'), '# Plan\n');
  }

  function makeLoomOnlyProject(root: string, slug: string): void {
    const path = join(root, slug);
    mkdirSync(path, { recursive: true });
    // Loom-only: manifest.json but no PLAN.md. Unusual state — loom is
    // meant to coexist with planning artifacts; surfacing it via this
    // filter would mask the missing PLAN.md.
    writeFileSync(join(path, 'manifest.json'), '{}');
  }

  function makeLoomAndPlanProject(root: string, slug: string): void {
    const path = join(root, slug);
    mkdirSync(path, { recursive: true });
    // Loom + plan: both markers. This is the default post-adoption
    // state — loom owns execution state, PLAN.md owns planning
    // artifacts. The PLAN.md filter sees it.
    writeFileSync(join(path, 'manifest.json'), '{}');
    writeFileSync(join(path, 'PLAN.md'), '# Plan\n');
  }

  beforeEach(() => {
    projectsRoot = mkdtempSync(join(tmpdir(), 'plan-filter-test-'));
    makePlanOnlyProject(projectsRoot, '2026-05-10-project-a');
    makePlanOnlyProject(projectsRoot, '2026-05-15-plan-cli');
    makeLoomOnlyProject(projectsRoot, '2026-05-15-loom-cli');
    makeLoomAndPlanProject(projectsRoot, '2026-05-15-trout-sunset');
    mkdirSync(join(projectsRoot, '2026-05-20-bare'));
    makePlanOnlyProject(join(projectsRoot, 'archive'), '2026-04-01-old-project');
    writeFileSync(join(projectsRoot, 'CONVENTIONS.md'), '# noise\n');
  });

  afterEach(() => {
    rmSync(projectsRoot, { recursive: true, force: true });
  });

  test('resolveProjectByPlan: full slug returns its path', () => {
    const p = resolveProjectByPlan('2026-05-15-plan-cli', projectsRoot);
    expect(p).toBe(join(projectsRoot, '2026-05-15-plan-cli'));
  });

  test('resolveProjectByPlan: date-less suffix returns unique match', () => {
    const p = resolveProjectByPlan('plan-cli', projectsRoot);
    expect(p).toBe(join(projectsRoot, '2026-05-15-plan-cli'));
  });

  test('resolveProjectByPlan: archived slug falls back to archive/', () => {
    const p = resolveProjectByPlan('old-project', projectsRoot);
    expect(p).toBe(join(projectsRoot, 'archive', '2026-04-01-old-project'));
  });

  test('resolveProjectByPlan: relative path resolves to absolute', () => {
    const rel = './2026-05-15-plan-cli';
    const p = resolveProjectByPlan(join(projectsRoot, rel), projectsRoot);
    expect(p).toBe(resolve(projectsRoot, '2026-05-15-plan-cli'));
  });

  test('resolveProjectByPlan: nonexistent slug throws project-not-found', () => {
    expect(() => resolveProjectByPlan('does-not-exist', projectsRoot)).toThrow(
      /project-not-found/,
    );
  });

  test('resolveProjectByPlan: ambiguous suffix throws slug-ambiguous with candidates', () => {
    makePlanOnlyProject(projectsRoot, '2026-05-20-foo');
    makePlanOnlyProject(projectsRoot, '2026-05-25-foo');
    try {
      resolveProjectByPlan('foo', projectsRoot);
      throw new Error('expected throw');
    } catch (err: unknown) {
      const e = err as { code: string; candidates?: string[] };
      expect(e.code).toBe('slug-ambiguous');
      expect(e.candidates).toBeDefined();
      expect(e.candidates?.length).toBe(2);
    }
  });

  test('resolveProjectByPlan: loom-only project (no PLAN.md) does NOT resolve', () => {
    // The PLAN.md filter requires PLAN.md; manifest.json alone is not
    // enough. 2026-05-15-loom-cli has manifest.json but no PLAN.md.
    expect(() => resolveProjectByPlan('loom-cli', projectsRoot)).toThrow(
      /project-not-found/,
    );
  });

  test('resolveProjectByPlan: loom + plan project (both markers) DOES resolve', () => {
    // 2026-05-15-trout-sunset has BOTH markers. The PLAN.md filter
    // qualifies it.
    const p = resolveProjectByPlan('trout-sunset', projectsRoot);
    expect(p).toBe(join(projectsRoot, '2026-05-15-trout-sunset'));
  });

  test('resolveProjectByPlan: bare directory without PLAN.md does NOT resolve', () => {
    expect(() => resolveProjectByPlan('bare', projectsRoot)).toThrow(
      /project-not-found/,
    );
  });

  test('listProjectsByPlan: enumerates active PLAN-marker projects (including loom+plan)', () => {
    // Includes: plan-only (PLAN.md without manifest.json) AND
    // loom+plan (both markers). Excludes: loom-only (manifest.json
    // without PLAN.md) and bare dirs.
    const list = listProjectsByPlan(projectsRoot);
    expect(list.map((p) => p.slug).sort()).toEqual([
      '2026-05-10-project-a',
      '2026-05-15-plan-cli',
      '2026-05-15-trout-sunset',
    ]);
  });

  test('listProjectsByPlan: --archived enumerates the archive', () => {
    const list = listProjectsByPlan(projectsRoot, { archived: true });
    expect(list.map((p) => p.slug)).toEqual(['2026-04-01-old-project']);
  });
});
