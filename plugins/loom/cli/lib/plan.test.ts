import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlan, parseDependsOn } from './plan.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'fixtures');

function fixture(name: string): string {
  return readFileSync(join(FIXTURES, `${name}.md`), 'utf8');
}

// ---------- Canonical shape: milestones + integer phases ----------

test('parses milestones, integer phases, exit bullets, and deps', () => {
  const { plan, diagnostics } = parsePlan(fixture('plan-milestone-integer'));

  expect(plan.phases.map((p) => p.id)).toEqual(['1', '2', '3']);
  expect(plan.phases.map((p) => p.name)).toEqual(['Alpha', 'Beta', 'Gamma']);

  expect(plan.phases[0].exitCriteria).toEqual([
    'alpha criterion one',
    'alpha criterion two',
  ]);
  expect(plan.phases[0].dependsOn).toEqual([]);
  expect(plan.phases[1].dependsOn).toEqual(['1']);
  expect(plan.phases[2].dependsOn).toEqual(['1', '2']);

  // Milestones are an optional grouping over the flat phase list.
  expect(plan.milestones?.map((m) => m.id)).toEqual(['M1', 'M2']);
  expect(plan.milestones?.[0].phases.map((p) => p.id)).toEqual(['1', '2']);
  expect(plan.milestones?.[1].phases.map((p) => p.id)).toEqual(['3']);
  expect(plan.phases[0].milestone).toEqual({ id: 'M1', name: 'First milestone' });

  expect(plan.loopStrategy).toBe(
    'Interactive throughout. This is the strategy prose.',
  );

  // phasesById indexes the flat list for the dependency resolver.
  expect(plan.phasesById['2'].name).toBe('Beta');

  // Every phase has goal + exit + resolvable deps: no diagnostics.
  expect(diagnostics).toEqual([]);
});

// ---------- Dotted ids + Goal (updated) override ----------

test('keeps dotted phase ids as strings and lets Goal (updated) win', () => {
  const { plan, diagnostics } = parsePlan(fixture('plan-dotted-ids'));

  expect(plan.phases.map((p) => p.id)).toEqual(['1.1', '1.2']);
  expect(plan.phasesById['1.1'].goal).toBe('Updated goal wins.');
  expect(plan.phases[1].dependsOn).toEqual(['1.1']);
  expect(diagnostics).toEqual([]);
});

// ---------- Flat, no milestones, Output as an Exit alias ----------

test('parses the no-milestone shape with Output as an Exit alias', () => {
  const { plan, diagnostics } = parsePlan(fixture('plan-flat-output'));

  expect(plan.phases.map((p) => p.id)).toEqual(['1', '2']);
  // No milestone headers -> the optional grouping is omitted entirely.
  expect(plan.milestones).toBeUndefined();
  expect(plan.phases[0].milestone).toBeUndefined();
  expect(plan.phases[0].name).toBe('Design (done)');

  // Inline Output value becomes a single criterion.
  expect(plan.phases[0].exitCriteria).toEqual(['`docs/DESIGN.md`, 100 lines.']);
  // Bullet Output becomes one criterion per bullet.
  expect(plan.phases[1].exitCriteria).toEqual(['created dir', 'created file']);
  expect(plan.phases[1].dependsOn).toEqual(['1']);

  expect(diagnostics).toEqual([]);
});

// ---------- Graceful degradation: missing optional sections ----------

test('degrades gracefully on a phase missing goal and exit', () => {
  const { plan, diagnostics } = parsePlan(fixture('plan-degraded'));

  expect(plan.phases).toHaveLength(1);
  expect(plan.phases[0].goal).toBeUndefined();
  expect(plan.phases[0].exitCriteria).toEqual([]);

  // Cosmetic diagnostics, not a throw and not structural.
  const codes = diagnostics.map((d) => d.code);
  expect(codes).toContain('plan-phase-missing-goal');
  expect(codes).toContain('plan-phase-missing-exit');
  expect(diagnostics.every((d) => d.severity === 'cosmetic')).toBe(true);

  // Diagnostics anchor to the phase heading line (line 3 in the fixture),
  // not a placeholder 0, so a consumer can surface them to the author.
  const missingGoal = diagnostics.find((d) => d.code === 'plan-phase-missing-goal');
  expect(missingGoal?.line).toBe(3);
});

// ---------- Structural diagnostic: dangling dependency ----------

test('flags a dependency on a nonexistent phase as structural', () => {
  const { plan, diagnostics } = parsePlan(fixture('plan-dangling-dep'));

  expect(plan.phases[0].dependsOn).toEqual(['9']);
  const dangling = diagnostics.find((d) => d.code === 'plan-dangling-dependency');
  expect(dangling).toBeDefined();
  expect(dangling?.severity).toBe('structural');
  // Anchored to the **Depends on** line (line 10 in the fixture).
  expect(dangling?.line).toBe(10);
});

// ---------- Heading-level tolerance, ranges, whiteboard blocks ----------

test('accepts ASCII-hyphen headings, expands en-dash ranges, captures whiteboard', () => {
  const { plan, diagnostics } = parsePlan(fixture('plan-hyphen-range'));

  // Phases declared with an ASCII hyphen still parse.
  expect(plan.phases.map((p) => p.id)).toEqual(['1', '2', '3']);

  // Plan-level whiteboard (before any phase) vs phase-level override.
  expect(plan.whiteboard).toBe(
    'engineers=guild:whiteboard-skeptic; topic=plan-level default; rounds=1',
  );
  expect(plan.phases[1].whiteboard).toBe(
    'engineers=guild:whiteboard-substrate-engineer; topic=phase override; rounds=2',
  );
  expect(plan.phases[0].whiteboard).toBeUndefined();

  // `Phases 1–2` (en-dash range) expands to each id.
  expect(plan.phases[2].dependsOn).toEqual(['1', '2']);

  expect(diagnostics).toEqual([]);
});

// ---------- The one thrown error: not a plan ----------

test('throws only when the input has no markdown headings', () => {
  expect(() => parsePlan('just some prose\nwith no headings at all')).toThrow(
    /plan-no-headings/,
  );
});

test('does not throw on a heading-bearing plan with no phases; flags it', () => {
  const { plan, diagnostics } = parsePlan('# A doc\n\n## Notes\n\nno phases here');
  expect(plan.phases).toEqual([]);
  const noPhases = diagnostics.find((d) => d.code === 'plan-no-phases-found');
  expect(noPhases?.severity).toBe('structural');
});

// ---------- parseDependsOn unit coverage ----------

test('parseDependsOn handles nothing, singles, lists, ranges, parentheticals', () => {
  expect(parseDependsOn('nothing.')).toEqual([]);
  expect(parseDependsOn('nothing (independent of M1).')).toEqual([]);
  expect(parseDependsOn('Phase 1.')).toEqual(['1']);
  expect(parseDependsOn('Phase 1, Phase 2.')).toEqual(['1', '2']);
  expect(parseDependsOn('Phase 1.1.')).toEqual(['1.1']);
  expect(parseDependsOn('Phase 2 (manifest.toml), Phase 5 (recipes).')).toEqual([
    '2',
    '5',
  ]);
  expect(parseDependsOn('Phases 1–6 (all harvests landed).')).toEqual([
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
  ]);
});
