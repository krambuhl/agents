import { test, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  copyFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { doctor, detectGuildSkew, queryGuildVerbs } from './doctor.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '..', 'fixtures');

let projectsRoot: string;
let projectPath: string;

beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), 'loom-verbs-doctor-'));
  projectPath = join(projectsRoot, '2026-05-15-test-loom');
  mkdirSync(projectPath);
});

afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true });
});

test('doctor: healthy project returns ok=true with empty issues', () => {
  copyFileSync(
    join(FIXTURES, 'manifest-basic.toml'),
    join(projectPath, 'manifest.toml'),
  );
  const result = doctor(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  const report = JSON.parse(result.stdout as string);
  expect(report.ok).toBe(true);
  expect(report.issues).toEqual([]);
});

test('doctor: missing manifest.toml is reported as an issue and ok=false', () => {
  // Resolve by explicit path (the slug filter requires manifest.toml to
  // even see the project; an explicit path reaches a dir that lacks it).
  const result = doctor([projectPath], { projectsRoot });
  expect(result.exitCode).toBe(1);
  const report = JSON.parse(result.stdout as string);
  expect(report.ok).toBe(false);
  const codes = report.issues.map((i: { code: string }) => i.code);
  expect(codes).toContain('manifest-missing');
});

test('doctor: an unparseable / unsupported-version manifest is reported', () => {
  // schema_version 999 — readManifest rejects it on parse, surfacing as
  // manifest-unreadable through doctor.
  writeFileSync(
    join(projectPath, 'manifest.toml'),
    [
      '[meta]',
      'schema_version = 999',
      'title = "x"',
      'slug = "x"',
      'started = "2026-05-15"',
      'status = "active"',
      'strategy = "x"',
      '',
      '[config]',
      'base_branch = "main"',
      'reviewers = []',
      'labels = []',
      'verification = []',
      'worker_bindings = {}',
      '',
    ].join('\n'),
  );
  const result = doctor(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(1);
  const report = JSON.parse(result.stdout as string);
  expect(report.ok).toBe(false);
  const codes = report.issues.map((i: { code: string }) => i.code);
  expect(codes).toContain('manifest-unreadable');
});

test('doctor: no slug arg → uses cwd discovery (not-in-project error if absent)', () => {
  // Without a slug and without cwdOverride pointing at a project,
  // doctor reports it cannot find a project.
  const result = doctor([], { projectsRoot, cwdOverride: tmpdir() });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('not-in-project');
});

// --- guild cache-skew probe (gate-coverage P2) ---
//
// detectGuildSkew is the pure, deterministic core; the "simulated stale
// fixture" is just an injected verb-set pair. The live gather (spawning the
// real source + resolvable guild) is exercised by a manual `loom doctor`
// run, not these unit tests — which use a temp projectsRoot whose parent
// has no plugins/guild, so the probe degrades to null (proving graceful
// off-repo behavior via the healthy-project assertion below).

test('detectGuildSkew: resolvable missing source verbs → warning naming them', () => {
  const issue = detectGuildSkew(
    ['derive-panel', 'whiteboard', 'compile', 'recipe'],
    ['derive-panel', 'whiteboard'],
  );
  expect(issue).not.toBeNull();
  expect(issue?.code).toBe('guild-cache-skew');
  expect(issue?.severity).toBe('warning');
  expect(issue?.detail).toContain('compile');
  expect(issue?.detail).toContain('recipe');
});

test('detectGuildSkew: resolvable covers source (equal) → null', () => {
  expect(detectGuildSkew(['a', 'b'], ['a', 'b'])).toBeNull();
});

test('detectGuildSkew: resolvable superset (extra dev-local verbs) is NOT skew → null', () => {
  expect(detectGuildSkew(['a', 'b'], ['a', 'b', 'c'])).toBeNull();
});

test('detectGuildSkew: empty source → null (nothing to lag behind)', () => {
  expect(detectGuildSkew([], ['a'])).toBeNull();
});

test('queryGuildVerbs: a non-runnable command degrades to null (never throws)', () => {
  expect(
    queryGuildVerbs('loom-doctor-definitely-not-a-real-binary', []),
  ).toBeNull();
});

test('doctor: guild-skew probe degrades to null off-repo (healthy temp project stays clean, exit 0)', () => {
  copyFileSync(
    join(FIXTURES, 'manifest-basic.toml'),
    join(projectPath, 'manifest.toml'),
  );
  const result = doctor(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  const report = JSON.parse(result.stdout as string);
  const codes = report.issues.map((i: { code: string }) => i.code);
  expect(codes).not.toContain('guild-cache-skew');
  expect(report.ok).toBe(true);
});
