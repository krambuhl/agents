// Typed read path for the consolidated manifest.toml (Phase 2).
//
// readManifest(raw) parses a manifest.toml string via the generic
// parseToml lib (U1) and reconstructs the typed ManifestToml tree: a
// [meta] table, the [config] table, and the [[phases]] / [[events]] /
// [[checkins]] / [[sessions]] array-of-table sections. This is the
// READER half of Phase 2 — there is no writer here (U3 owns the atomic
// write path) and no verb wiring (U3/U5). It is additive: the legacy
// manifest.json / config.json / events.jsonl read paths are untouched
// until the U5 dogfood migration removes them.
//
// Validation posture — STRUCTURE strict, SEMANTICS lenient:
//   - Structure (is the key present? is it a string / a string-array / a
//     table?) is validated LOUDLY: a missing required key or a wrong-typed
//     value throws a LoomError naming the section + key. This is the
//     jelly-loom requireString/requireStringArray posture, adapted to the
//     generic TomlValue tree.
//   - Semantics (is `status` one of the allowed literals? does an event's
//     `detail` match its variant?) are TRUSTED, not re-validated. The
//     writer produced this file; string-literal-union fields are read as
//     strings and typed via cast, and Event.detail is kept as the parsed
//     record (the lenient narrowing the operator chose). A new event
//     variant requires zero change here.
//
// null fields (meta.current_branch, meta.latest_checkin, and the optional
// phase fields) are represented by ABSENCE of the key — TOML has no null
// literal. An absent nullable scalar reads back as null; an absent
// optional reads back as undefined (the key is simply omitted).

import { existsSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { LoomError } from './errors.ts';
import { parseToml, stringifyToml } from './toml.ts';
import type { TomlTable, TomlValue } from './toml.ts';
import type {
  Config,
  Event,
  EventName,
  Checkin,
  CheckinContract,
  CheckinExecution,
  CheckinVerdict,
  CheckinPhaseRef,
  CheckinVerdictResult,
  Session,
  ManifestMeta,
  ManifestPhase,
  ManifestStatus,
  ManifestToml,
  PhasePR,
  PhasePRState,
  PhaseStatus,
  SchemaVersion,
} from './types.ts';

const SCHEMA_VERSION = 1;

// ---------- Structural accessors (loud on wrong shape) ----------

function asTable(value: TomlValue, where: string): TomlTable {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LoomError('manifest-schema-invalid', `${where} must be a table`);
  }
  return value;
}

function requireTable(bag: TomlTable, key: string, where: string): TomlTable {
  const v = bag[key];
  if (v === undefined) {
    throw new LoomError(
      'manifest-schema-invalid',
      `${where} is missing required table [${key}]`,
    );
  }
  return asTable(v, `${where} [${key}]`);
}

function requireString(bag: TomlTable, key: string, where: string): string {
  const v = bag[key];
  if (v === undefined) {
    throw new LoomError(
      'manifest-schema-invalid',
      `${where} is missing required key '${key}'`,
    );
  }
  if (typeof v !== 'string') {
    throw new LoomError(
      'manifest-schema-invalid',
      `${where} key '${key}' must be a string`,
    );
  }
  return v;
}

function requireNumber(bag: TomlTable, key: string, where: string): number {
  const v = bag[key];
  if (v === undefined) {
    throw new LoomError(
      'manifest-schema-invalid',
      `${where} is missing required key '${key}'`,
    );
  }
  if (typeof v !== 'number') {
    throw new LoomError(
      'manifest-schema-invalid',
      `${where} key '${key}' must be an integer`,
    );
  }
  return v;
}

function requireStringArray(bag: TomlTable, key: string, where: string): string[] {
  const v = bag[key];
  if (v === undefined) {
    throw new LoomError(
      'manifest-schema-invalid',
      `${where} is missing required key '${key}'`,
    );
  }
  if (!Array.isArray(v)) {
    throw new LoomError(
      'manifest-schema-invalid',
      `${where} key '${key}' must be an array of strings`,
    );
  }
  return v.map((el, i) => {
    if (typeof el !== 'string') {
      throw new LoomError(
        'manifest-schema-invalid',
        `${where} key '${key}'[${i}] must be a string`,
      );
    }
    return el;
  });
}

function requireNumberArray(bag: TomlTable, key: string, where: string): number[] {
  const v = bag[key];
  if (v === undefined) {
    throw new LoomError(
      'manifest-schema-invalid',
      `${where} is missing required key '${key}'`,
    );
  }
  if (!Array.isArray(v)) {
    throw new LoomError(
      'manifest-schema-invalid',
      `${where} key '${key}' must be an array of integers`,
    );
  }
  return v.map((el, i) => {
    if (typeof el !== 'number') {
      throw new LoomError(
        'manifest-schema-invalid',
        `${where} key '${key}'[${i}] must be an integer`,
      );
    }
    return el;
  });
}

// An absent string key reads as null (the TOML null encoding: omission).
function nullableString(bag: TomlTable, key: string, where: string): string | null {
  const v = bag[key];
  if (v === undefined) return null;
  if (typeof v !== 'string') {
    throw new LoomError(
      'manifest-schema-invalid',
      `${where} key '${key}' must be a string when present`,
    );
  }
  return v;
}

function optionalString(bag: TomlTable, key: string, where: string): string | undefined {
  const v = bag[key];
  if (v === undefined) return undefined;
  if (typeof v !== 'string') {
    throw new LoomError(
      'manifest-schema-invalid',
      `${where} key '${key}' must be a string when present`,
    );
  }
  return v;
}

// Read an [[name]] array-of-table section. Absent → []. Present but not an
// array-of-tables → loud (a [name] single table where [[name]] was
// expected is a malformed manifest, not an empty section).
function sectionTables(root: TomlTable, key: string): TomlTable[] {
  const v = root[key];
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    throw new LoomError(
      'manifest-schema-invalid',
      `[[${key}]] must be an array-of-table section`,
    );
  }
  return v.map((el, i) => asTable(el, `[[${key}]] #${i + 1}`));
}

// ---------- Section reconstructors ----------

function reconstructMeta(root: TomlTable): ManifestMeta {
  const meta = requireTable(root, 'meta', 'manifest');
  const version = requireNumber(meta, 'schema_version', '[meta]');
  if (version !== SCHEMA_VERSION) {
    throw new LoomError(
      'manifest-unsupported-version',
      `[meta] schema_version ${version} is not supported (expected ${SCHEMA_VERSION})`,
    );
  }
  return {
    schema_version: SCHEMA_VERSION,
    title: requireString(meta, 'title', '[meta]'),
    slug: requireString(meta, 'slug', '[meta]'),
    started: requireString(meta, 'started', '[meta]'),
    // Trusted semantics: read as string, typed via cast (not set-validated).
    status: requireString(meta, 'status', '[meta]') as ManifestStatus,
    current_branch: nullableString(meta, 'current_branch', '[meta]'),
    latest_checkin: nullableString(meta, 'latest_checkin', '[meta]'),
    strategy: requireString(meta, 'strategy', '[meta]'),
  };
}

// [config] omits schema_version (it lives once in [meta]); synthesize it
// onto the returned Config so the existing Config type is satisfied.
function reconstructConfig(root: TomlTable, schemaVersion: SchemaVersion): Config {
  const config = requireTable(root, 'config', 'manifest');
  return {
    schema_version: schemaVersion,
    base_branch: requireString(config, 'base_branch', '[config]'),
    reviewers: requireStringArray(config, 'reviewers', '[config]'),
    labels: requireStringArray(config, 'labels', '[config]'),
    verification: requireStringArray(config, 'verification', '[config]'),
    worker_bindings: reconstructStringMap(config, 'worker_bindings', '[config]'),
  };
}

// worker_bindings is an inline table of string → string.
function reconstructStringMap(
  bag: TomlTable,
  key: string,
  where: string,
): Record<string, string> {
  const v = bag[key];
  if (v === undefined) {
    throw new LoomError(
      'manifest-schema-invalid',
      `${where} is missing required table '${key}'`,
    );
  }
  const table = asTable(v, `${where} '${key}'`);
  const out: Record<string, string> = {};
  for (const k of Object.keys(table)) {
    const val = table[k];
    if (typeof val !== 'string') {
      throw new LoomError(
        'manifest-schema-invalid',
        `${where} '${key}'.${k} must be a string`,
      );
    }
    out[k] = val;
  }
  return out;
}

function reconstructPhase(t: TomlTable, where: string): ManifestPhase {
  const phase: ManifestPhase = {
    number: requireNumber(t, 'number', where),
    name: requireString(t, 'name', where),
    // Trusted semantics: PhaseStatus literal via cast.
    status: requireString(t, 'status', where) as PhaseStatus,
  };
  const branch = optionalString(t, 'branch', where);
  if (branch !== undefined) phase.branch = branch;
  const latestCheckin = optionalString(t, 'latest_checkin', where);
  if (latestCheckin !== undefined) phase.latest_checkin = latestCheckin;
  const blockedReason = optionalString(t, 'blocked_reason', where);
  if (blockedReason !== undefined) phase.blocked_reason = blockedReason;
  if (t.pr !== undefined) {
    const pr = asTable(t.pr, `${where} pr`);
    const phasePr: PhasePR = {
      number: requireNumber(pr, 'number', `${where} pr`),
      url: requireString(pr, 'url', `${where} pr`),
      state: requireString(pr, 'state', `${where} pr`) as PhasePRState,
    };
    phase.pr = phasePr;
  }
  return phase;
}

// Lenient (operator decision): validate the common fields + that detail is
// a table; keep detail as the parsed record. The event discriminator and
// detail shape are TRUSTED, not re-validated arm-by-arm.
function reconstructEvent(t: TomlTable, where: string): Event {
  const at = requireString(t, 'at', where);
  const event = requireString(t, 'event', where);
  const detail = requireTable(t, 'detail', where);
  return { at, event: event as EventName, detail } as Event;
}

function reconstructCheckin(t: TomlTable, where: string): Checkin {
  const phaseRef = requireTable(t, 'phase', where);
  const phase: CheckinPhaseRef = {
    number: requireNumber(phaseRef, 'number', `${where} phase`),
    name: requireString(phaseRef, 'name', `${where} phase`),
  };
  const contractTable = requireTable(t, 'contract', where);
  const contract: CheckinContract = {
    goal: requireString(contractTable, 'goal', `${where} contract`),
    acceptance_criteria: requireStringArray(contractTable, 'acceptance_criteria', `${where} contract`),
    rules_applied: requireStringArray(contractTable, 'rules_applied', `${where} contract`),
    disqualifiers: requireStringArray(contractTable, 'disqualifiers', `${where} contract`),
    inputs: requireStringArray(contractTable, 'inputs', `${where} contract`),
  };
  const executionTable = requireTable(t, 'execution', where);
  const execution: CheckinExecution = {
    actions: requireStringArray(executionTable, 'actions', `${where} execution`),
    files_touched: requireStringArray(executionTable, 'files_touched', `${where} execution`),
    corrections: requireStringArray(executionTable, 'corrections', `${where} execution`),
  };
  const verdictTable = requireTable(t, 'verdict', where);
  const verdict: CheckinVerdict = {
    // Trusted semantics: CheckinVerdictResult literal via cast.
    result: requireString(verdictTable, 'result', `${where} verdict`) as CheckinVerdictResult,
    reasons: requireStringArray(verdictTable, 'reasons', `${where} verdict`),
  };
  return {
    schema_version: SCHEMA_VERSION,
    number: requireString(t, 'number', where),
    created: requireString(t, 'created', where),
    phase,
    branch: requireString(t, 'branch', where),
    unit: requireString(t, 'unit', where),
    contract,
    execution,
    scope: requireStringArray(t, 'scope', where),
    changes_since_previous: requireString(t, 'changes_since_previous', where),
    verdict,
    notes_for_pr: requireStringArray(t, 'notes_for_pr', where),
  };
}

function reconstructSession(t: TomlTable, where: string): Session {
  return {
    schema_version: SCHEMA_VERSION,
    date: requireString(t, 'date', where),
    letter: requireString(t, 'letter', where),
    phases_touched: requireNumberArray(t, 'phases_touched', where),
    checkins_written: requireStringArray(t, 'checkins_written', where),
    pr_activity: requireStringArray(t, 'pr_activity', where),
    what_happened: requireStringArray(t, 'what_happened', where),
    open_threads: requireStringArray(t, 'open_threads', where),
    notes: requireStringArray(t, 'notes', where),
  };
}

// ---------- Entry point ----------

export function readManifest(raw: string): ManifestToml {
  const root = parseToml(raw);
  const meta = reconstructMeta(root);
  return {
    meta,
    config: reconstructConfig(root, meta.schema_version),
    phases: sectionTables(root, 'phases').map((t, i) =>
      reconstructPhase(t, `[[phases]] #${i + 1}`),
    ),
    events: sectionTables(root, 'events').map((t, i) =>
      reconstructEvent(t, `[[events]] #${i + 1}`),
    ),
    checkins: sectionTables(root, 'checkins').map((t, i) =>
      reconstructCheckin(t, `[[checkins]] #${i + 1}`),
    ),
    sessions: sectionTables(root, 'sessions').map((t, i) =>
      reconstructSession(t, `[[sessions]] #${i + 1}`),
    ),
  };
}

// ---------- Write path (Phase 2 U3) ----------
//
// stringifyManifest is the inverse of readManifest: ManifestToml → the
// sectioned TOML string, via the generic stringifyToml. writeManifest adds
// the durability layer the verbs will eventually use (U5): a corruption
// guard (verify-before-rename) and an optimistic-concurrency guard
// (mtime/size re-check). This is the write LIB only — no verb is rewired
// here, and no real project's on-disk state is converted; both happen
// atomically in U5. Tested against temp-dir fixtures.
//
// null-by-absence (write side): TOML has no null literal, so the
// serializer OMITS any key whose value is null or undefined — meta's
// nullable scalars, the optional phase fields, and any null inside a
// lenient Event.detail (e.g. a research event's `topic: string | null`).
// [config] additionally omits schema_version (it lives once in [meta]).
// readManifest re-injects null for the KNOWN nullable meta fields, so they
// round-trip; an unknown null buried in a detail record round-trips as
// absence, which is why verify-before-rename compares null-STRIPPED trees.

export type WriteToken = { mtimeMs: number; size: number };

// Recursively drop keys whose value is null or undefined. Arrays recurse
// into elements (our arrays never hold null elements). The result is a
// clean TomlValue tree safe to hand to stringifyToml (which has no null
// encoding) and to compare for the round-trip verify.
function stripNullish(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripNullish);
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    const bag = value as Record<string, unknown>;
    for (const key of Object.keys(bag)) {
      const v = bag[key];
      if (v === null || v === undefined) continue;
      out[key] = stripNullish(v);
    }
    return out;
  }
  return value;
}

// Structural, order-independent deep-equal over the null-stripped trees.
function deepEqual(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((el, i) => deepEqual(el, b[i]));
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const ab = a as Record<string, unknown>;
    const bb = b as Record<string, unknown>;
    const ak = Object.keys(ab);
    const bk = Object.keys(bb);
    if (ak.length !== bk.length) return false;
    return ak.every(
      (k) => Object.prototype.hasOwnProperty.call(bb, k) && deepEqual(ab[k], bb[k]),
    );
  }
  return a === b;
}

// [config] without schema_version (deduped to [meta]).
function configToSection(config: Config): Record<string, unknown> {
  return {
    base_branch: config.base_branch,
    reviewers: config.reviewers,
    labels: config.labels,
    verification: config.verification,
    worker_bindings: config.worker_bindings,
  };
}

export function stringifyManifest(m: ManifestToml): string {
  // Build the root section structure, then strip null/undefined so the
  // generic serializer never sees a value it cannot encode. The typed
  // section records pass through structurally — they are plain objects of
  // strings / numbers / booleans / arrays / nested objects.
  const root = {
    meta: { ...m.meta },
    config: configToSection(m.config),
    phases: m.phases,
    events: m.events,
    checkins: m.checkins,
    sessions: m.sessions,
  };
  return stringifyToml(stripNullish(root) as TomlTable);
}

export function readManifestFile(path: string): {
  manifest: ManifestToml;
  token: WriteToken;
} {
  const raw = readFileSync(path, 'utf8');
  const stat = statSync(path);
  return {
    manifest: readManifest(raw),
    token: { mtimeMs: stat.mtimeMs, size: stat.size },
  };
}

// Write a manifest atomically. Two guards before the rename:
//   1. verify-before-rename — re-parse the serialized string and confirm it
//      round-trips back to `m` (null-stripped); throw rather than rename if
//      a serializer bug dropped/mangled a field. Atomic rename otherwise
//      guarantees we cleanly overwrite good state with corrupt state.
//   2. optimistic concurrency — when the caller passes the `expect` token it
//      read the file with, re-stat the target and abort loudly if it changed
//      under us (single-writer-per-project; deliberate best-effort guard,
//      the regression from events.jsonl's OS-serialized append).
// Returns the post-write token so a caller can chain another write.
export function writeManifest(
  path: string,
  m: ManifestToml,
  opts?: { expect?: WriteToken },
): WriteToken {
  const serialized = stringifyManifest(m);

  if (!deepEqual(stripNullish(readManifest(serialized)), stripNullish(m))) {
    throw new LoomError(
      'manifest-write-verify-failed',
      `refusing to write ${path}: serialized manifest does not round-trip back to the in-memory value`,
    );
  }

  if (opts?.expect !== undefined && existsSync(path)) {
    const current = statSync(path);
    if (current.mtimeMs !== opts.expect.mtimeMs || current.size !== opts.expect.size) {
      throw new LoomError(
        'manifest-changed-under-write',
        `refusing to write ${path}: it changed under write ` +
          `(expected size ${opts.expect.size}, found ${current.size}) — ` +
          `single-writer-per-project is assumed`,
      );
    }
  }

  const tmp = `${path}.tmp`;
  writeFileSync(tmp, serialized, 'utf8');
  renameSync(tmp, path);
  const stat = statSync(path);
  return { mtimeMs: stat.mtimeMs, size: stat.size };
}

// ---------- Section mutators (Phase 2 U4) ----------
//
// The verb-facing mutation API the U5 verb-flip will call. Each is a PURE
// immutable update: it returns a new ManifestToml and never mutates the
// input, so a verb's read-modify-write cycle is `m2 = mutate(m1); write(m2)`.
// These are lib functions, not verbs — no verb is rewired here, no project
// is converted (both U5). The shared harness (manifest-toml.harness.ts)
// proves a mutation touches only its own section.

// Append an event, idempotently. A no-op when an existing event has the
// same `event` name and deep-equal `detail` (ignoring `at`) — so re-running
// e.g. `pr merged 71` does not append a second pr-merged event. Idempotency
// is APPEND-TIME ONLY: historical duplicates already in the log (the real
// events.jsonl carries repeated phase-started events) are untouched, and
// U5's conversion bulk-loads history rather than re-appending it.
export function appendEvent(m: ManifestToml, event: Event): ManifestToml {
  const duplicate = m.events.some(
    (e) => e.event === event.event && deepEqual(e.detail, event.detail),
  );
  if (duplicate) return m;
  return { ...m, events: [...m.events, event] };
}

// Append a checkin, rejecting a duplicate (branch, number) loudly — the
// create-once guarantee today's writeCheckin enforces at the filesystem.
export function appendCheckin(m: ManifestToml, checkin: Checkin): ManifestToml {
  const exists = m.checkins.some(
    (c) => c.branch === checkin.branch && c.number === checkin.number,
  );
  if (exists) {
    throw new LoomError(
      'checkin-already-exists',
      `checkin ${checkin.number} on ${checkin.branch} already exists`,
    );
  }
  return { ...m, checkins: [...m.checkins, checkin] };
}

// Append a session, rejecting a duplicate (date, letter) loudly.
export function appendSession(m: ManifestToml, session: Session): ManifestToml {
  const exists = m.sessions.some(
    (s) => s.date === session.date && s.letter === session.letter,
  );
  if (exists) {
    throw new LoomError(
      'session-already-exists',
      `session ${session.date}-${session.letter} already exists`,
    );
  }
  return { ...m, sessions: [...m.sessions, session] };
}

// Merge a patch into the matching phase (status / branch / pr /
// latest_checkin / blocked_reason). pr-state transitions go through here as
// `updatePhase(m, n, { pr })`. Throws if the phase number is not present.
export function updatePhase(
  m: ManifestToml,
  phaseNumber: number,
  patch: Partial<ManifestPhase>,
): ManifestToml {
  const index = m.phases.findIndex((p) => p.number === phaseNumber);
  if (index === -1) {
    throw new LoomError('phase-not-found', `phase ${phaseNumber} not found`);
  }
  const phases = m.phases.map((p, i) => (i === index ? { ...p, ...patch } : p));
  return { ...m, phases };
}

// Merge a patch into [meta] (current_branch / latest_checkin / status / …).
export function updateMeta(
  m: ManifestToml,
  patch: Partial<ManifestMeta>,
): ManifestToml {
  return { ...m, meta: { ...m.meta, ...patch } };
}
