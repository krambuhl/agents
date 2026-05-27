import { test, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planVerb, reviseVerb, parsePlanVerb } from './plan.ts';
import type { GitRunner } from '../../lib/git.ts';

let projectsRoot: string;
let planFile: string;
let interviewFile: string;
let gitCalls: Array<{ method: string; args: unknown[] }>;
let committedPaths: Set<string>;
let gitRunner: GitRunner;

beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), 'plan-test-'));
  // Source files to copy from
  const srcDir = mkdtempSync(join(tmpdir(), 'plan-test-src-'));
  planFile = join(srcDir, 'plan.md');
  interviewFile = join(srcDir, 'interview.md');
  writeFileSync(planFile, '# PLAN\n\nSome plan content.\n');
  writeFileSync(interviewFile, '# INTERVIEW\n\nSome interview trail.\n');

  // Stub git runner: records calls, treats `committedPaths` as the
  // set of files that have been committed at least once.
  gitCalls = [];
  committedPaths = new Set();
  gitRunner = {
    isCommitted(repoRoot: string, filePath: string): boolean {
      gitCalls.push({ method: 'isCommitted', args: [repoRoot, filePath] });
      return committedPaths.has(filePath);
    },
    addAndCommit(repoRoot: string, paths: string[], message: string): void {
      gitCalls.push({ method: 'addAndCommit', args: [repoRoot, paths, message] });
      for (const p of paths) committedPaths.add(p);
    },
  };
});

afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true });
});

function makePlanReadableProject(slug: string): string {
  // Marker for plan-readable projects: PLAN.md present. Draft-only
  // projects have just PLAN.md + INTERVIEW.md; loom + draft projects
  // carry PLAN.md alongside manifest.json. Both qualify under the
  // resolver's PLAN-bearing filter.
  const path = join(projectsRoot, slug);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'PLAN.md'), '# Plan\n');
  return path;
}

const baseCtx = () => ({
  projectsRoot,
  today: '2026-05-15',
  gitRunner,
});

// ---------- Happy paths ----------

test('planVerb: happy path writes both draft files + auto-adopts loom + commits', () => {
  const result = planVerb(
    [
      'Adopt Biome',
      `--plan-file=${planFile}`,
      `--interview-file=${interviewFile}`,
    ],
    baseCtx(),
  );

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBeDefined();
  const payload = JSON.parse(result.stdout as string);
  expect(payload.slug).toBe('2026-05-15-adopt-biome');
  expect(payload.path).toBe(join(projectsRoot, '2026-05-15-adopt-biome'));
  expect(payload.committed).toBe(true);
  expect(payload.loom_adopted).toBe(true);

  // Draft files copied
  expect(
    readFileSync(join(payload.path, 'PLAN.md'), 'utf8'),
  ).toContain('# PLAN');
  expect(
    readFileSync(join(payload.path, 'INTERVIEW.md'), 'utf8'),
  ).toContain('# INTERVIEW');

  // Loom files written by auto-adopt
  expect(existsSync(join(payload.path, 'manifest.json'))).toBe(true);
  expect(existsSync(join(payload.path, 'config.json'))).toBe(true);
  expect(existsSync(join(payload.path, 'events.jsonl'))).toBe(true);
  expect(existsSync(join(payload.path, 'checkins'))).toBe(true);
  expect(existsSync(join(payload.path, 'sessions'))).toBe(true);

  // Manifest carries title derived from slug
  const m = JSON.parse(
    readFileSync(join(payload.path, 'manifest.json'), 'utf8'),
  );
  expect(m.title).toBe('Adopt Biome');
  expect(m.slug).toBe('2026-05-15-adopt-biome');
  expect(m.status).toBe('active');

  // git addAndCommit called once with all five files + a draft-plan message
  const addCalls = gitCalls.filter((c) => c.method === 'addAndCommit');
  expect(addCalls.length).toBe(1);
  const [, paths, message] = addCalls[0]?.args ?? [];
  expect((paths as string[]).length).toBe(5);
  expect(message).toContain('loom plan');
  expect(message).toContain('2026-05-15-adopt-biome');
});

test('planVerb: --no-loom skips auto-adopt', () => {
  const result = planVerb(
    [
      'Adopt Biome',
      `--plan-file=${planFile}`,
      `--interview-file=${interviewFile}`,
      '--no-loom',
    ],
    baseCtx(),
  );

  expect(result.exitCode).toBe(0);
  const payload = JSON.parse(result.stdout as string);
  expect(payload.loom_adopted).toBe(false);

  // Draft files written
  expect(existsSync(join(payload.path, 'PLAN.md'))).toBe(true);
  expect(existsSync(join(payload.path, 'INTERVIEW.md'))).toBe(true);
  // Loom files NOT written
  expect(existsSync(join(payload.path, 'manifest.json'))).toBe(false);
  expect(existsSync(join(payload.path, 'config.json'))).toBe(false);
  expect(existsSync(join(payload.path, 'events.jsonl'))).toBe(false);

  // Commit only includes the two draft files
  const addCalls = gitCalls.filter((c) => c.method === 'addAndCommit');
  expect(addCalls.length).toBe(1);
  const [, paths] = addCalls[0]?.args ?? [];
  expect((paths as string[]).length).toBe(2);
});

test('planVerb: skips loom adopt when manifest.json already exists (recovery case)', () => {
  // Pre-create the project with PLAN.md uncommitted + manifest.json
  // already in place (simulating a prior successful loom adopt that
  // the user is rerunning loom plan over).
  const slug = '2026-05-15-existing';
  const dir = join(projectsRoot, slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'PLAN.md'), '# old plan\n');
  writeFileSync(join(dir, 'manifest.json'), '{"existing":"manifest"}');

  const result = planVerb(
    [slug, `--plan-file=${planFile}`, `--interview-file=${interviewFile}`],
    baseCtx(),
  );
  expect(result.exitCode).toBe(0);
  const payload = JSON.parse(result.stdout as string);
  expect(payload.loom_adopted).toBe(false);
  // Existing manifest preserved (writeLoomSubstrate would have overwritten)
  expect(readFileSync(join(dir, 'manifest.json'), 'utf8')).toBe(
    '{"existing":"manifest"}',
  );
});

test('planVerb: --no-commit writes files but skips git', () => {
  const result = planVerb(
    [
      'Adopt Biome',
      `--plan-file=${planFile}`,
      `--interview-file=${interviewFile}`,
      '--no-commit',
    ],
    baseCtx(),
  );

  expect(result.exitCode).toBe(0);
  const payload = JSON.parse(result.stdout as string);
  expect(payload.committed).toBe(false);
  // Files still copied
  expect(existsSync(join(payload.path, 'PLAN.md'))).toBe(true);
  expect(existsSync(join(payload.path, 'INTERVIEW.md'))).toBe(true);
  // No addAndCommit call
  expect(gitCalls.filter((c) => c.method === 'addAndCommit').length).toBe(0);
});

test('planVerb: --pretty produces indented JSON output', () => {
  const result = planVerb(
    [
      'Adopt Biome',
      `--plan-file=${planFile}`,
      `--interview-file=${interviewFile}`,
      '--pretty',
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.stdout).toContain('\n');
  expect(result.stdout).toContain('  "slug"');
});

// ---------- Slug-resolution / collision ----------

test('planVerb: derives slug from a topic via createSlug(topic, today)', () => {
  const result = planVerb(
    [
      'CLI: plan & revise!',
      `--plan-file=${planFile}`,
      `--interview-file=${interviewFile}`,
      '--no-commit',
    ],
    baseCtx(),
  );
  const payload = JSON.parse(result.stdout as string);
  expect(payload.slug).toBe('2026-05-15-cli-plan-revise');
});

// (The earlier "project-already-exists" tests merged into the
// PLAN.md-committed-collision case below. Under the broadened
// resolver filter, a project is recognized by PLAN.md presence;
// the only refuse-on-collision rule is "PLAN.md exists AND is
// committed." Uncommitted PLAN.md is the failed-commit recovery
// path and gets overwritten.)

// ---------- Directory exists but no PLAN.md ----------

test('planVerb: dir-exists-no-PLAN succeeds and writes files', () => {
  // Directory exists but has no PLAN.md (so it doesn't qualify as
  // a plan-readable project yet — loom plan creates the PLAN.md
  // here)
  const targetDir = join(projectsRoot, '2026-05-15-adopt-biome');
  mkdirSync(targetDir, { recursive: true });
  const result = planVerb(
    [
      'Adopt Biome',
      `--plan-file=${planFile}`,
      `--interview-file=${interviewFile}`,
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.exitCode).toBe(0);
  expect(existsSync(join(targetDir, 'PLAN.md'))).toBe(true);
});

// ---------- PLAN.md exists ----------

test('planVerb: uncommitted PLAN.md is overwritten (recovery case)', () => {
  const targetDir = join(projectsRoot, '2026-05-15-adopt-biome');
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, 'PLAN.md'), 'stale content');
  // committedPaths is empty → isCommitted returns false
  const result = planVerb(
    [
      'Adopt Biome',
      `--plan-file=${planFile}`,
      `--interview-file=${interviewFile}`,
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.exitCode).toBe(0);
  expect(readFileSync(join(targetDir, 'PLAN.md'), 'utf8')).toContain('# PLAN');
});

test('planVerb: committed PLAN.md throws plan-exists-committed', () => {
  const targetDir = join(projectsRoot, '2026-05-15-adopt-biome');
  mkdirSync(targetDir, { recursive: true });
  const planMdPath = join(targetDir, 'PLAN.md');
  writeFileSync(planMdPath, 'committed plan');
  // Mark it committed in the stub
  committedPaths.add(planMdPath);
  const result = planVerb(
    [
      'Adopt Biome',
      `--plan-file=${planFile}`,
      `--interview-file=${interviewFile}`,
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  const payload = JSON.parse(result.stderr as string);
  expect(payload.error).toBe('plan-exists-committed');
  expect(payload.message).toMatch(/revise/);
});

// ---------- Missing args ----------

test('planVerb: missing positional throws missing-args', () => {
  const result = planVerb(
    [`--plan-file=${planFile}`, `--interview-file=${interviewFile}`],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('planVerb: missing --plan-file throws missing-args', () => {
  const result = planVerb(
    ['Adopt Biome', `--interview-file=${interviewFile}`],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('planVerb: missing --interview-file throws missing-args', () => {
  const result = planVerb(
    ['Adopt Biome', `--plan-file=${planFile}`],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

// ---------- reviseVerb ----------

function seedTroutProjectWithPlan(slug: string, planContent: string): string {
  const path = makePlanReadableProject(slug);
  writeFileSync(join(path, 'PLAN.md'), planContent);
  return path;
}

const revisionFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'plan-revise-src-'));
  const path = join(dir, 'revision.md');
  writeFileSync(path, '# PLAN (revised)\n\nNew content.\n');
  return path;
};

test('reviseVerb: happy path replaces PLAN.md, appends Revision log, commits', () => {
  const projectDir = seedTroutProjectWithPlan(
    '2026-05-15-adopt-biome',
    '# PLAN\n\nOriginal content.\n',
  );
  const result = reviseVerb(
    [
      '2026-05-15-adopt-biome',
      `--revision-file=${revisionFile()}`,
      '--rationale=narrowed scope to lint-only',
    ],
    baseCtx(),
  );

  expect(result.exitCode).toBe(0);
  const payload = JSON.parse(result.stdout as string);
  expect(payload.slug).toBe('2026-05-15-adopt-biome');
  expect(payload.committed).toBe(true);
  expect(payload.rationale).toBe('narrowed scope to lint-only');

  const updated = readFileSync(join(projectDir, 'PLAN.md'), 'utf8');
  // Content is the revision file content + a Revision log
  expect(updated).toContain('New content.');
  expect(updated).toContain('## Revision log');
  expect(updated).toContain('2026-05-15 — narrowed scope to lint-only');

  // git addAndCommit called once with the rationale in the message
  const addCalls = gitCalls.filter((c) => c.method === 'addAndCommit');
  expect(addCalls.length).toBe(1);
  const [, paths, message] = addCalls[0]?.args ?? [];
  expect(message).toContain('loom revise-plan');
  expect(message).toContain('narrowed scope to lint-only');
  expect((paths as string[]).length).toBe(1);
  expect((paths as string[])[0]).toContain('PLAN.md');
});

test('reviseVerb: --no-commit writes file but skips git', () => {
  seedTroutProjectWithPlan(
    '2026-05-15-adopt-biome',
    '# PLAN\n\nOriginal.\n',
  );
  const result = reviseVerb(
    [
      '2026-05-15-adopt-biome',
      `--revision-file=${revisionFile()}`,
      '--rationale=test',
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.exitCode).toBe(0);
  const payload = JSON.parse(result.stdout as string);
  expect(payload.committed).toBe(false);
  expect(gitCalls.filter((c) => c.method === 'addAndCommit').length).toBe(0);
});

test('reviseVerb: --pretty produces indented JSON', () => {
  seedTroutProjectWithPlan(
    '2026-05-15-adopt-biome',
    '# PLAN\n',
  );
  const result = reviseVerb(
    [
      '2026-05-15-adopt-biome',
      `--revision-file=${revisionFile()}`,
      '--rationale=test',
      '--no-commit',
      '--pretty',
    ],
    baseCtx(),
  );
  expect(result.stdout).toContain('\n');
  expect(result.stdout).toContain('  "slug"');
});

test('reviseVerb: project-not-found for nonexistent slug', () => {
  const result = reviseVerb(
    [
      '2026-05-15-does-not-exist',
      `--revision-file=${revisionFile()}`,
      '--rationale=test',
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('project-not-found');
});

// (Earlier draft tested `plan-not-found` by creating a project with
// MANIFEST.md but no PLAN.md. Under the broadened resolver filter
// — "PLAN.md present + manifest.json absent" — such a directory
// isn't recognized as a project at all, so the surface returns
// `project-not-found` instead. The `plan-not-found` branch in the
// verb body remains as a defensive race-against-FS check; not
// reachable through the public test surface.)

test('reviseVerb: existing ## Revision log gets new entry inserted into it', () => {
  const projectDir = seedTroutProjectWithPlan(
    '2026-05-15-adopt-biome',
    '# PLAN\n\nOriginal.\n',
  );
  // Revision file already has its own log section with prior entries
  const dir = mkdtempSync(join(tmpdir(), 'plan-revise-with-log-'));
  const revFile = join(dir, 'revision.md');
  writeFileSync(
    revFile,
    [
      '# PLAN (revised)',
      '',
      'Body content.',
      '',
      '## Revision log',
      '',
      '- 2026-05-14 — prior revision rationale',
      '',
    ].join('\n'),
  );

  const result = reviseVerb(
    [
      '2026-05-15-adopt-biome',
      `--revision-file=${revFile}`,
      '--rationale=narrowed scope',
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.exitCode).toBe(0);

  const updated = readFileSync(join(projectDir, 'PLAN.md'), 'utf8');
  // Single Revision log section
  expect(updated.match(/## Revision log/g)?.length).toBe(1);
  // Both entries present (new + old)
  expect(updated).toContain('2026-05-15 — narrowed scope');
  expect(updated).toContain('2026-05-14 — prior revision rationale');
});

test('reviseVerb: missing positional slug throws missing-args', () => {
  const result = reviseVerb(
    [`--revision-file=${revisionFile()}`, '--rationale=test'],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('reviseVerb: missing --revision-file throws missing-args', () => {
  seedTroutProjectWithPlan('2026-05-15-adopt-biome', '# PLAN\n');
  const result = reviseVerb(
    ['2026-05-15-adopt-biome', '--rationale=test'],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('reviseVerb: missing --rationale throws missing-args', () => {
  seedTroutProjectWithPlan('2026-05-15-adopt-biome', '# PLAN\n');
  const result = reviseVerb(
    ['2026-05-15-adopt-biome', `--revision-file=${revisionFile()}`],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

// ---------- parse-plan ----------

const RICH_PLAN = [
  '# Test Plan',
  '',
  '## Phases',
  '',
  '### M1 — Milestone one',
  '',
  '#### Phase 1 — Alpha',
  '',
  '**Goal**: Do alpha.',
  '',
  '**Exit**:',
  '- a1',
  '',
  '**Depends on**: nothing.',
  '',
  '#### Phase 2 — Beta',
  '',
  '**Goal**: Do beta.',
  '',
  '**Exit**:',
  '- b1',
  '',
  '**Depends on**: Phase 1.',
  '',
].join('\n');

function seedPlanProject(slug: string, planText: string): void {
  const path = join(projectsRoot, slug);
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, 'PLAN.md'), planText);
}

test('parsePlanVerb: emits the parsed plan + diagnostics as JSON', () => {
  seedPlanProject('2026-05-15-parse-target', RICH_PLAN);

  const result = parsePlanVerb(['2026-05-15-parse-target'], baseCtx());
  expect(result.exitCode).toBe(0);

  const payload = JSON.parse(result.stdout as string);
  expect(payload.plan.phases.map((p: { id: string }) => p.id)).toEqual(['1', '2']);
  expect(payload.plan.phasesById['2'].dependsOn).toEqual(['1']);
  expect(payload.plan.milestones[0].id).toBe('M1');
  expect(Array.isArray(payload.diagnostics)).toBe(true);
});

test('parsePlanVerb: --pretty produces indented JSON', () => {
  seedPlanProject('2026-05-15-parse-pretty', RICH_PLAN);

  const result = parsePlanVerb(['2026-05-15-parse-pretty', '--pretty'], baseCtx());
  expect(result.exitCode).toBe(0);
  expect(result.stdout as string).toContain('\n  ');
});

test('parsePlanVerb: missing slug -> missing-args', () => {
  const result = parsePlanVerb([], baseCtx());
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('parsePlanVerb: unknown slug -> project-not-found', () => {
  const result = parsePlanVerb(['2026-01-01-nope'], baseCtx());
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('project-not-found');
});

test('parsePlanVerb: a dir without PLAN.md is not a plan project -> project-not-found', () => {
  // resolveProjectByPlan only resolves PLAN-bearing projects, so a
  // PLAN-less directory never reaches the (race-guard) plan-not-found
  // branch — it is simply not a plan project.
  mkdirSync(join(projectsRoot, '2026-05-15-no-plan'), { recursive: true });
  const result = parsePlanVerb(['2026-05-15-no-plan'], baseCtx());
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('project-not-found');
});
