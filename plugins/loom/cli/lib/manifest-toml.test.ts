// Unit + real-artifact tests for the manifest.toml typing layer.
//
// Three tiers:
//   1. Real-artifact regression — readManifest against the hand-authored
//      genuine manifest.toml fixture (mirrors this project's state), the
//      regression target the testing-strategy plan called for. A
//      glob-floor test over a real corpus is deferred to post-migration
//      (no manifest.toml corpus exists during Phase 2).
//   2. Unit — section reconstruction, null-via-absence, empty sections,
//      config schema_version synthesis, lenient event detail, and loud
//      rejection of malformed structure (typed LoomError, naming the key).
//   3. Strip-only smoke — the typing layer loads + runs under real Node's
//      type-stripping loader, shelled via spawnSync('node').

import { test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifest } from './manifest-toml.ts';
import { LoomError } from './errors.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '..', 'fixtures', 'manifest-real.toml');
const SMOKE = join(__dirname, 'manifest-toml.smoke.ts');

// ---------- Real-artifact regression ----------

test('reads the real-artifact fixture into the full typed shape', () => {
  const m = readManifest(readFileSync(FIXTURE, 'utf8'));

  expect(m.meta.schema_version).toBe(1);
  expect(m.meta.slug).toBe('2026-05-26-substrate-consolidation');
  expect(m.meta.status).toBe('active');
  expect(m.meta.current_branch).toBe('ev-agent.substrate-consolidation.manifest-toml-read');
  expect(m.meta.latest_checkin).toBe('06');

  expect(m.config.schema_version).toBe(1); // synthesized from meta
  expect(m.config.base_branch).toBe('main');
  expect(m.config.reviewers).toEqual([]);
  expect(m.config.worker_bindings).toEqual({ default: 'ev-loop-interactive' });

  expect(m.phases.map((p) => p.number)).toEqual([1, 2]);
  // A pre-(d) `pr` table on a phase is tolerantly ignored: PR state is derived
  // via `loom pr discover`, never read from or stored in the manifest. The
  // `in` check sidesteps the now-removed `pr` field on the ManifestPhase type.
  // GUARD COUPLING: this assertion is only meaningful while the fixture's first
  // phase carries a populated `pr = {…}` table (manifest-real.toml). If that
  // table is ever removed from the fixture, phase[0] passes trivially and the
  // tolerant-ignore regression is no longer covered — keep the fixture's pr.
  expect('pr' in m.phases[0]).toBe(false);
  expect('pr' in m.phases[1]).toBe(false);

  expect(m.events).toHaveLength(2);
  expect(m.events[0].event).toBe('project-initialized');
  expect(m.events[0].detail).toEqual({}); // empty detail survives
  expect(m.events[1].detail).toEqual({
    pr: 72,
    url: 'https://github.com/krambuhl/agents/pull/72',
  });

  expect(m.sessions[0].phases_touched).toEqual([1, 2]);
});

test('the torture checkin survives the round-trip through readManifest intact', () => {
  const m = readManifest(readFileSync(FIXTURE, 'utf8'));
  const checkin = m.checkins[0];

  expect(checkin.number).toBe('05');
  expect(checkin.phase).toEqual({ number: 2, name: 'Single-file TOML state' });
  // The torture characters survive byte-for-byte: # / embedded quote /
  // */ close sequence / commas, all inside one string value.
  expect(checkin.contract.goal).toBe(
    'torture: a # hash, a "quoted" phrase, a */ close sequence, and commas, all in one goal',
  );
  expect(checkin.contract.acceptance_criteria).toHaveLength(2);
  expect(checkin.contract.disqualifiers).toEqual(['parameter properties or */-in-JSDoc']);
  expect(checkin.execution.corrections).toEqual([]);
  expect(checkin.verdict).toEqual({ result: 'approved', reasons: [] });
});

test('a pre-consolidation fixture (no retros/replies/findings sections) parses them as empty arrays', () => {
  // The real-artifact fixture predates the [[retros]]/[[replies]]/[[findings]]
  // sections, so reading it exercises the forward-compatible default: an absent
  // array-of-table section reconstructs to []. This is the back-compat guarantee
  // for every manifest written before the schema addition.
  const raw = readFileSync(FIXTURE, 'utf8');
  expect(raw).not.toContain('[[retros]]');
  expect(raw).not.toContain('[[replies]]');
  expect(raw).not.toContain('[[findings]]');

  const m = readManifest(raw);
  expect(m.retros).toEqual([]);
  expect(m.replies).toEqual([]);
  expect(m.findings).toEqual([]);
});

// ---------- Unit: shaping rules ----------

const MINIMAL = [
  '[meta]',
  'schema_version = 1',
  'title = "T"',
  'slug = "s"',
  'started = "2026-05-27"',
  'status = "active"',
  'strategy = "interactive"',
  '',
  '[config]',
  'base_branch = "main"',
  'reviewers = []',
  'labels = []',
  'verification = []',
  'worker_bindings = {}',
  '',
].join('\n');

test('null-via-absence: omitted current_branch / latest_checkin read as null', () => {
  const m = readManifest(MINIMAL);
  expect(m.meta.current_branch).toBeNull();
  expect(m.meta.latest_checkin).toBeNull();
});

test('absent array-of-table sections read as empty arrays', () => {
  const m = readManifest(MINIMAL);
  expect(m.phases).toEqual([]);
  expect(m.events).toEqual([]);
  expect(m.checkins).toEqual([]);
  expect(m.sessions).toEqual([]);
  expect(m.retros).toEqual([]);
  expect(m.replies).toEqual([]);
  expect(m.findings).toEqual([]);
});

test('present nullable scalar reads as its string value', () => {
  const raw = MINIMAL.replace(
    'strategy = "interactive"\n',
    'strategy = "interactive"\ncurrent_branch = "feat-x"\nlatest_checkin = "03"\n',
  );
  const m = readManifest(raw);
  expect(m.meta.current_branch).toBe('feat-x');
  expect(m.meta.latest_checkin).toBe('03');
});

test('optional phase fields: absent branch reads as undefined', () => {
  const raw = MINIMAL + ['[[phases]]', 'number = 1', 'name = "P"', 'status = "not-started"', ''].join('\n');
  const m = readManifest(raw);
  expect(m.phases[0].branch).toBeUndefined();
});

test('lenient event detail: arbitrary detail record is kept, not re-validated', () => {
  const raw =
    MINIMAL +
    ['[[events]]', 'at = "t"', 'event = "made-up-future-event"', 'detail = { anything = "goes", n = 7 }', ''].join('\n');
  const m = readManifest(raw);
  expect(m.events[0].event).toBe('made-up-future-event');
  expect(m.events[0].detail).toEqual({ anything: 'goes', n: 7 });
});

// ---------- Unit: loud rejection ----------

function expectReject(raw: string, code: string, fragment: string): void {
  let thrown: unknown;
  try {
    readManifest(raw);
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(LoomError);
  expect((thrown as LoomError).code).toBe(code);
  expect((thrown as LoomError).message).toContain(fragment);
}

test('rejects a manifest missing the [meta] table', () => {
  expectReject('[config]\nbase_branch = "main"\nreviewers = []\nlabels = []\nverification = []\nworker_bindings = {}\n', 'manifest-schema-invalid', '[meta]');
});

test('rejects [meta] missing a required key, naming the key', () => {
  const raw = MINIMAL.replace('slug = "s"\n', '');
  expectReject(raw, 'manifest-schema-invalid', "'slug'");
});

test('rejects a wrong-typed schema_version', () => {
  const raw = MINIMAL.replace('schema_version = 1', 'schema_version = "one"');
  expectReject(raw, 'manifest-schema-invalid', 'schema_version');
});

test('rejects an unsupported schema_version', () => {
  const raw = MINIMAL.replace('schema_version = 1', 'schema_version = 2');
  expectReject(raw, 'manifest-unsupported-version', 'schema_version 2');
});

test('rejects a missing [config] table', () => {
  const metaOnly = MINIMAL.slice(0, MINIMAL.indexOf('[config]'));
  expectReject(metaOnly, 'manifest-schema-invalid', '[config]');
});

test('rejects a retro with an unknown type, naming the expected variants', () => {
  const raw =
    MINIMAL +
    ['[[retros]]', 'type = "weekly"', 'created = "t"', 'findings = []', ''].join('\n');
  expectReject(raw, 'manifest-schema-invalid', "unknown retro type 'weekly'");
});

test('rejects an event missing its detail table', () => {
  const raw = MINIMAL + ['[[events]]', 'at = "t"', 'event = "note"', ''].join('\n');
  expectReject(raw, 'manifest-schema-invalid', 'detail');
});

test('rejects a [events] single table where [[events]] array-of-table is expected', () => {
  const raw = MINIMAL + ['[events]', 'at = "t"', 'event = "note"', 'detail = {}', ''].join('\n');
  expectReject(raw, 'manifest-schema-invalid', '[[events]]');
});

test('rejects a checkin missing a required contract sub-array, naming the path', () => {
  const raw =
    MINIMAL +
    [
      '[[checkins]]',
      'number = "01"',
      'created = "t"',
      'branch = "b"',
      'unit = "u"',
      'changes_since_previous = "c"',
      'phase = { number = 1, name = "P" }',
      'contract = { goal = "g", acceptance_criteria = ["a"], rules_applied = ["r"], disqualifiers = ["d"] }',
      'execution = { actions = [], files_touched = [], corrections = [] }',
      'verdict = { result = "approved", reasons = [] }',
      'scope = []',
      'notes_for_pr = []',
      '',
    ].join('\n');
  // contract is missing `inputs`.
  expectReject(raw, 'manifest-schema-invalid', "'inputs'");
});

// ---------- Strip-only smoke via subprocess ----------

test('manifest-toml.ts loads and runs under the real node strip-only loader', () => {
  const result = spawnSync('node', [SMOKE], { encoding: 'utf8' });
  expect(result.status, `stderr: ${result.stderr}`).toBe(0);
  expect(result.stdout).toContain('manifest-toml.smoke ok');
});
