import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { phaseReady } from './phase.ts';

let projectsRoot: string;
let projectPath: string;

const MANIFEST = `
[meta]
schema_version = 1
title = "Threaded test project"
slug = "2026-07-02-threaded-test"
started = "2026-07-02"
status = "active"
strategy = "Fan-out phase readiness test."

[config]
base_branch = "main"
reviewers = []
labels = []
verification = []
worker_bindings = {}

[[phases]]
number = 1
name = "Foundation"
status = "completed"

[[phases]]
number = 2
name = "Independent A (no deps)"
status = "not-started"

[[phases]]
number = 3
name = "Independent B (no deps)"
status = "not-started"

[[phases]]
number = 4
name = "Depends on 2, unmet"
status = "not-started"

[[phases]]
number = 5
name = "Depends on 1, met"
status = "not-started"

[[phases]]
number = 6
name = "Depends on a phantom phase"
status = "not-started"
`;

const PLAN_MD = `# Plan

## Phase 1 — Foundation

**Goal**: seed.

## Phase 2 — Independent A (no deps)

**Goal**: partitioned work A.

## Phase 3 — Independent B (no deps)

**Goal**: partitioned work B.

## Phase 4 — Depends on 2, unmet

**Depends on**: Phase 2

**Goal**: waits on phase 2.

## Phase 5 — Depends on 1, met

**Depends on**: Phase 1

**Goal**: waits on phase 1 (already completed).

## Phase 6 — Depends on a phantom phase

**Depends on**: Phase 99

**Goal**: references a phase that doesn't exist in the manifest.
`;

beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), 'loom-phase-ready-'));
  projectPath = join(projectsRoot, '2026-07-02-threaded-test');
  mkdirSync(projectPath, { recursive: true });
  writeFileSync(join(projectPath, 'manifest.toml'), MANIFEST, 'utf8');
  writeFileSync(join(projectPath, 'PLAN.md'), PLAN_MD, 'utf8');
});

afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true });
});

test('phaseReady: returns every unblocked not-started phase, not just the lowest-numbered one', () => {
  const result = phaseReady(['threaded-test'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  const { ready } = JSON.parse(result.stdout as string);
  const readyNumbers = ready.map((p: { number: number }) => p.number).sort();
  // 2 and 3 have no deps; 5 depends on the already-completed phase 1.
  expect(readyNumbers).toEqual([2, 3, 5]);
});

test('phaseReady: excludes a phase whose dependency is not yet completed', () => {
  const result = phaseReady(['threaded-test'], { projectsRoot });
  const { ready } = JSON.parse(result.stdout as string);
  expect(ready.some((p: { number: number }) => p.number === 4)).toBe(false);
});

test('phaseReady: an unresolved dependency id is reported, not silently ready', () => {
  const result = phaseReady(['threaded-test'], { projectsRoot });
  const { ready, unresolvedDeps } = JSON.parse(result.stdout as string);
  expect(ready.some((p: { number: number }) => p.number === 6)).toBe(false);
  expect(unresolvedDeps).toEqual([{ number: 6, depId: '99' }]);
});

test('phaseReady: errors on a missing slug', () => {
  const result = phaseReady([], { projectsRoot });
  expect(result.exitCode).toBe(1);
});

test('phaseReady: errors when PLAN.md is absent', () => {
  const bare = join(projectsRoot, '2026-07-02-no-plan');
  mkdirSync(bare, { recursive: true });
  writeFileSync(
    join(bare, 'manifest.toml'),
    '[meta]\nschema_version = 1\ntitle = "x"\nslug = "2026-07-02-no-plan"\nstarted = "2026-07-02"\nstatus = "active"\nstrategy = "x"\n[config]\nbase_branch = "main"\nreviewers = []\nlabels = []\nverification = []\nworker_bindings = {}\n',
    'utf8',
  );
  const result = phaseReady(['no-plan'], { projectsRoot });
  expect(result.exitCode).toBe(1);
});
