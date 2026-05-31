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
import {
  doctor,
  detectGuildSkew,
  queryGuildVerbs,
  probeResolvableGuild,
  detectCodegenDrift,
  runCodegenCheck,
} from './doctor.ts';

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
  expect(codes).not.toContain('guild-codegen-drift');
  expect(report.ok).toBe(true);
});

// --- resolvable-guild probe trichotomy (shared-insights P1·D1) ---
//
// The gap this closes: the old queryGuildVerbs collapsed "no guild on PATH"
// and "a guild ran but its output didn't parse" into the same null, so a
// present-but-stale guild reported green. probeResolvableGuild distinguishes
// absent / unqueryable / ok. Each state is exercised with a real spawn whose
// stderr shape is controlled via `node -e`, so no real guild install needed.

test('probeResolvableGuild: a command not on PATH → absent (ENOENT, skip silently)', () => {
  expect(probeResolvableGuild('loom-doctor-definitely-not-a-real-binary')).toEqual(
    { state: 'absent' },
  );
});

test('probeResolvableGuild: ran but stderr is not JSON → unqueryable (NOT green)', () => {
  const probe = probeResolvableGuild('node', [
    '-e',
    'process.stderr.write("plain text, not a JSON error payload")',
  ]);
  expect(probe.state).toBe('unqueryable');
});

test('probeResolvableGuild: JSON stderr without a candidates array → unqueryable', () => {
  const probe = probeResolvableGuild('node', [
    '-e',
    'process.stderr.write(JSON.stringify({ error: "unknown-verb" }))',
  ]);
  expect(probe.state).toBe('unqueryable');
});

test('probeResolvableGuild: JSON stderr with candidates[] → ok with the verb list', () => {
  const probe = probeResolvableGuild('node', [
    '-e',
    'process.stderr.write(JSON.stringify({ candidates: ["derive-panel", "compile"] }))',
  ]);
  expect(probe).toEqual({ state: 'ok', verbs: ['derive-panel', 'compile'] });
});

// --- guild codegen-drift (shared-insights P1·D1) ---
//
// detectCodegenDrift is the pure classifier; runCodegenCheck is the effectful
// spawn-and-parse half. The pure tests cover both directions with injected
// CheckResults; the effectful test proves the source-bootstrap parse-contract
// seam against the REAL repo without asserting on its (churny) cleanliness.

const cleanCheck = () => ({
  ok: true,
  drift: {
    cells_with_source_drift: [] as { id: string; axis: string }[],
    cells_with_output_drift: [] as string[],
    cells_with_prompt_drift: [] as string[],
    cells_missing_cache_entry: [] as string[],
    cells_missing_on_disk: [] as string[],
    stale_cache_entries: [] as string[],
  },
});

test('detectCodegenDrift: null result (check could not run) → null', () => {
  expect(detectCodegenDrift(null)).toBeNull();
});

test('detectCodegenDrift: a clean check (no drift) → null', () => {
  expect(detectCodegenDrift(cleanCheck())).toBeNull();
});

test('detectCodegenDrift: output drift → warning naming the cell + the recompile command', () => {
  const result = cleanCheck();
  result.ok = false;
  result.drift.cells_with_output_drift = ['evaluator-a11y'];
  const issue = detectCodegenDrift(result);
  expect(issue).not.toBeNull();
  expect(issue?.code).toBe('guild-codegen-drift');
  expect(issue?.severity).toBe('warning');
  expect(issue?.detail).toContain('evaluator-a11y');
  expect(issue?.detail).toContain('node plugins/guild/cli/guild.ts compile');
});

test('detectCodegenDrift: dedupes a cell flagged by multiple axes; counts distinct cells', () => {
  const result = cleanCheck();
  result.ok = false;
  result.drift.cells_with_source_drift = [{ id: 'whiteboard-a11y', axis: 'domain' }];
  result.drift.cells_with_output_drift = ['whiteboard-a11y']; // same cell, second axis
  result.drift.cells_with_prompt_drift = ['evaluator-nextjs'];
  const issue = detectCodegenDrift(result);
  // 2 distinct cells (whiteboard-a11y counted once), not 3.
  expect(issue?.detail).toMatch(/^2 guild agents/);
  expect(issue?.detail).toContain('whiteboard-a11y');
  expect(issue?.detail).toContain('evaluator-nextjs');
});

test('detectCodegenDrift: more than 6 drifted cells truncates with a "+N more" tail', () => {
  const result = cleanCheck();
  result.ok = false;
  result.drift.cells_with_output_drift = Array.from(
    { length: 9 },
    (_, i) => `cell-${i}`,
  );
  const issue = detectCodegenDrift(result);
  expect(issue?.detail).toMatch(/9 guild agents/);
  expect(issue?.detail).toContain('+3 more');
});

test('runCodegenCheck: off-repo (no guild source entry) → null, never throws', () => {
  // repoRoot = the temp projectsRoot's parent, which has no plugins/guild.
  // Proves the verdict keys off the SOURCE entry's existence, not a cached
  // `guild` on PATH.
  expect(runCodegenCheck(tmpdir())).toBeNull();
});

test('runCodegenCheck: against the real repo, runs from source and parses the contract', () => {
  // Up from plugins/loom/cli/verbs/loom → marketplace root.
  const repoRoot = join(__dirname, '..', '..', '..', '..', '..');
  const result = runCodegenCheck(repoRoot);
  // Don't assert ok===true (couples to repo cleanliness / churns); assert the
  // source-bootstrap parse-contract seam: it ran the real source guild and
  // got back a shaped CheckResult.
  expect(result).not.toBeNull();
  expect(typeof result?.ok).toBe('boolean');
  expect(result?.drift).toBeTypeOf('object');
  expect(Array.isArray(result?.drift.cells_with_output_drift)).toBe(true);
});
