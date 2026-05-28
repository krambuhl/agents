// Real-artifact regression tier for the plan parser.
//
// plan.test.ts asserts exact trees against synthetic fixtures the test
// owns. THIS file points the parser at the real PLAN.md files committed
// in the repo and asserts they SURVIVE parsing — the loom-pr-reconcile-
// verb lesson: fixtures passed green while the real shipped artifact was
// broken. Assertions here are structural (parse, phase presence, no
// dangling deps), not content, so they stay green as plans are edited
// and go red only when a real plan takes a shape the parser chokes on.

import { test, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parsePlan } from './plan.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECTS_ROOT = join(__dirname, '..', '..', '..', '..', 'projects');
const SMOKE = join(__dirname, 'plan.smoke.ts');

function realPlanPaths(): string[] {
  const entries = readdirSync(PROJECTS_ROOT, { recursive: true }) as string[];
  return entries
    .filter((entry) => entry.endsWith('PLAN.md'))
    .map((entry) => join(PROJECTS_ROOT, entry));
}

const planPaths = realPlanPaths();

test('finds the real PLAN.md corpus (floor guards an empty glob)', () => {
  // An empty or over-narrow glob must NOT pass green — that is the exact
  // false-confidence shape the predecessor project was burned by.
  expect(planPaths.length).toBeGreaterThan(2);
});

test('every real PLAN.md parses without throwing and has no dangling deps', () => {
  let plansWithPhases = 0;
  for (const path of planPaths) {
    const text = readFileSync(path, 'utf8');
    const { plan, diagnostics } = parsePlan(text);

    for (const phase of plan.phases) {
      expect(phase.name.length, `${path} phase ${phase.id} name`).toBeGreaterThan(0);
    }

    const dangling = diagnostics.filter(
      (d) => d.code === 'plan-dangling-dependency',
    );
    expect(dangling, `${path} dangling: ${JSON.stringify(dangling)}`).toEqual([]);

    if (plan.phases.length > 0) plansWithPhases++;
  }

  // A phaseless plan (a single-PR migration described as workstreams) is
  // legitimate and exempt. This floor catches the parser silently
  // failing to find phases across the whole corpus.
  expect(plansWithPhases).toBeGreaterThanOrEqual(4);
});

test('parses the substrate-consolidation PLAN.md into the expected structure', () => {
  const path = join(
    PROJECTS_ROOT,
    '2026-05-26-substrate-consolidation',
    'PLAN.md',
  );
  const { plan } = parsePlan(readFileSync(path, 'utf8'));

  // Stable structural facts that survive prose edits — the phase /
  // milestone / dependency skeleton holds even as goal/exit text changes.
  expect(plan.phases.map((p) => p.id)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
  expect(plan.milestones?.map((m) => m.id)).toEqual(['M1', 'M2', 'M3', 'M4']);

  // Range expansion on a REAL plan: phase 7 "Depends on: Phases 1-6".
  expect(plan.phasesById['7'].dependsOn).toEqual(['1', '2', '3', '4', '5', '6']);
  // Comma list on a real plan: phase 3 "Depends on: Phase 1, Phase 2".
  expect(plan.phasesById['3'].dependsOn).toEqual(['1', '2']);
});

test('plan.ts loads and runs under the real node strip-only loader', () => {
  // The only tier that exercises Node's type-stripping loader; vitest's
  // transform would mask a parameter-property or */-in-JSDoc footgun.
  const result = spawnSync('node', [SMOKE], { encoding: 'utf8' });
  expect(result.status, `stderr: ${result.stderr}`).toBe(0);
  expect(result.stdout).toContain('plan.smoke ok');
});
