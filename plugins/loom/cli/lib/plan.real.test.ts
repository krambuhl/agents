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

// The previous test here pinned structural assertions to the
// `2026-05-26-substrate-consolidation` PLAN.md (phase IDs 1-7,
// milestones M1-M4, range expansion on phase 7, comma list on phase 3).
// PR #101 archived that project, the test went red on origin/main, and
// stayed red until Phase 8 of substrate-followups (this commit) removed
// the pin. The parser features it covered are redundantly tested:
// `plan.test.ts` lines 114-156 exercise range expansion + comma-list
// dependency parsing against synthetic fixtures the test owns; the
// corpus-wide tests above iterate every real PLAN.md and catch
// real-artifact regressions on phase-name and dangling-dep shape. The
// pinned test was vestigial real-artifact anchoring; deleting it cuts
// the archive-time coupling without losing signal.
// Memory: [[feedback_plan_real_test_breaks_on_project_archive]].

test('plan.ts loads and runs under the real node strip-only loader', () => {
  // The only tier that exercises Node's type-stripping loader; vitest's
  // transform would mask a parameter-property or */-in-JSDoc footgun.
  const result = spawnSync('node', [SMOKE], { encoding: 'utf8' });
  expect(result.status, `stderr: ${result.stderr}`).toBe(0);
  expect(result.stdout).toContain('plan.smoke ok');
});
