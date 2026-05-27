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

import { LoomError } from './errors.ts';
import { parseToml } from './toml.ts';
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
