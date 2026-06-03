// Tests for the section-mutation helpers (Phase 2 U4), exercised both as
// pure functions and through the shared harness's read-modify-write cycle.
//
// The marquee test is "other sections untouched": a mutation to one section,
// driven through the real writeManifest → readManifestFile cycle, must leave
// every other section's parsed content identical. That is the consolidation
// bug the single-file model risks (verb A trampling verb B's section), and
// the cheapest defense against it.

import { test, expect } from 'vitest';
import {
  appendCheckin,
  appendEvent,
  appendFinding,
  appendRetro,
  appendReply,
  appendSession,
  backfillPhases,
  readManifestFile,
  updateMeta,
  updatePhase,
  writeManifest,
} from './manifest-toml.ts';
import {
  assertSectionsUnchanged,
  baseManifest,
  cleanup,
  makeProject,
} from './manifest-toml.harness.ts';
import type {
  Checkin,
  Event,
  GuildFinding,
  ManifestToml,
  Retro,
  ReviewReply,
  Session,
} from './types.ts';
import { LoomError } from './errors.ts';

function event(name: string, detail: Record<string, unknown>, at = 't'): Event {
  return { at, event: name, detail } as Event;
}

function checkin(number: string, branch: string): Checkin {
  return {
    schema_version: 1,
    number,
    created: 't',
    phase: { number: 1, name: 'P' },
    branch,
    unit: 'u',
    contract: {
      goal: 'g',
      acceptance_criteria: [],
      rules_applied: [],
      disqualifiers: [],
      inputs: [],
    },
    execution: { actions: [], files_touched: [], corrections: [] },
    scope: [],
    changes_since_previous: 'c',
    verdict: { result: 'approved', reasons: [] },
    notes_for_pr: [],
  };
}

function session(date: string, letter: string): Session {
  return {
    schema_version: 1,
    date,
    letter,
    phases_touched: [],
    checkins_written: [],
    pr_activity: [],
    what_happened: [],
    open_threads: [],
    notes: [],
  };
}

function retro(phase: number, tier: number): Retro {
  return {
    schema_version: 1,
    type: 'session',
    created: 't',
    phase,
    tier,
    findings: [{ category: 'kept-well', description: 'd' }],
  };
}

function reviewReply(comment_id: number): ReviewReply {
  return { comment_id, body: 'b', branch: 'br', created: 't' };
}

function finding(signature: string): GuildFinding {
  return {
    evaluator: 'evaluator-test-unit',
    code: 'c',
    evidence: 'e',
    severity: 'advisory',
    signature,
    harvested_at: 't',
  };
}

// ---------- appendEvent: idempotent, pure ----------

test('appendEvent is a no-op when the same (event, detail) already exists', () => {
  const m: ManifestToml = { ...baseManifest(), events: [event('pr-merged', { pr: 71 })] };
  // Same name + detail, different timestamp — still a duplicate.
  const next = appendEvent(m, event('pr-merged', { pr: 71 }, 'a-later-timestamp'));
  expect(next.events).toHaveLength(1);
  expect(next).toBe(m); // unchanged manifest returned as-is
});

test('appendEvent appends an event with distinct detail', () => {
  const m: ManifestToml = { ...baseManifest(), events: [event('pr-merged', { pr: 71 })] };
  const next = appendEvent(m, event('pr-merged', { pr: 72 }));
  expect(next.events).toHaveLength(2);
});

test('appendEvent does not mutate its input', () => {
  const m: ManifestToml = { ...baseManifest(), events: [] };
  appendEvent(m, event('note', { text: 'hi' }));
  expect(m.events).toHaveLength(0);
});

// ---------- appendCheckin / appendSession: dup rejection ----------

test('appendCheckin rejects a duplicate (branch, number) loudly', () => {
  const m: ManifestToml = { ...baseManifest(), checkins: [checkin('01', 'b')] };
  let thrown: unknown;
  try {
    appendCheckin(m, checkin('01', 'b'));
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(LoomError);
  expect((thrown as LoomError).code).toBe('checkin-already-exists');
});

test('appendCheckin appends a checkin with a distinct (branch, number)', () => {
  const m: ManifestToml = { ...baseManifest(), checkins: [checkin('01', 'b')] };
  expect(appendCheckin(m, checkin('02', 'b')).checkins).toHaveLength(2);
  expect(appendCheckin(m, checkin('01', 'other')).checkins).toHaveLength(2);
});

test('appendSession rejects a duplicate (date, letter) loudly', () => {
  const m: ManifestToml = { ...baseManifest(), sessions: [session('2026-05-27', 'a')] };
  let thrown: unknown;
  try {
    appendSession(m, session('2026-05-27', 'a'));
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(LoomError);
  expect((thrown as LoomError).code).toBe('session-already-exists');
});

// ---------- appendRetro / appendReply / appendFinding: plain append, pure ----------

test('appendRetro appends to [[retros]] and does not mutate its input', () => {
  const m: ManifestToml = { ...baseManifest(), retros: [retro(1, 1)] };
  const next = appendRetro(m, retro(2, 1));
  expect(next.retros).toHaveLength(2);
  expect(next.retros[1].type === 'session' && next.retros[1].phase).toBe(2);
  expect(m.retros).toHaveLength(1); // input untouched
});

test('appendRetro is a plain append — no dedup guard (policy lives in the Phase-2 verb)', () => {
  const m: ManifestToml = { ...baseManifest(), retros: [retro(1, 1)] };
  // Same (type, phase, tier) appends a second time rather than throwing.
  expect(appendRetro(m, retro(1, 1)).retros).toHaveLength(2);
});

test('appendReply appends to [[replies]] and does not mutate its input', () => {
  const m: ManifestToml = { ...baseManifest(), replies: [reviewReply(1)] };
  const next = appendReply(m, reviewReply(2));
  expect(next.replies).toHaveLength(2);
  expect(next.replies[1].comment_id).toBe(2);
  expect(m.replies).toHaveLength(1); // input untouched
});

test('appendFinding appends to [[findings]] and does not mutate its input', () => {
  const m: ManifestToml = { ...baseManifest(), findings: [finding('sig-a')] };
  const next = appendFinding(m, finding('sig-b'));
  expect(next.findings).toHaveLength(2);
  expect(next.findings[1].signature).toBe('sig-b');
  expect(m.findings).toHaveLength(1); // input untouched
});

test('appendFinding is a plain append — duplicate signatures are NOT deduped here (the harvester owns dedup)', () => {
  const m: ManifestToml = { ...baseManifest(), findings: [finding('sig-a')] };
  expect(appendFinding(m, finding('sig-a')).findings).toHaveLength(2);
});

// ---------- updatePhase / updateMeta ----------

test('updatePhase merges a patch into the matching phase', () => {
  const m: ManifestToml = {
    ...baseManifest(),
    phases: [{ number: 1, name: 'P', status: 'not-started' }],
  };
  const next = updatePhase(m, 1, {
    status: 'in-progress',
    branch: 'feature/x',
  });
  expect(next.phases[0].status).toBe('in-progress');
  expect(next.phases[0].branch).toBe('feature/x');
  expect(m.phases[0].status).toBe('not-started'); // input untouched
});

test('updatePhase throws when the phase number is not present', () => {
  const m: ManifestToml = {
    ...baseManifest(),
    phases: [{ number: 1, name: 'P', status: 'not-started' }],
  };
  let thrown: unknown;
  try {
    updatePhase(m, 99, { status: 'completed' });
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(LoomError);
  expect((thrown as LoomError).code).toBe('phase-not-found');
});

test('updateMeta merges a patch into [meta]', () => {
  const m = baseManifest();
  const next = updateMeta(m, { current_branch: 'feat-x', latest_checkin: '08' });
  expect(next.meta.current_branch).toBe('feat-x');
  expect(next.meta.latest_checkin).toBe('08');
  expect(m.meta.current_branch).toBeNull(); // input untouched
});

// ---------- backfillPhases ----------

test('backfillPhases reconciles the placeholder: renames phase 1, adds the rest', () => {
  const m: ManifestToml = {
    ...baseManifest(),
    phases: [{ number: 1, name: 'Phase 1', status: 'in-progress', branch: 'feat-x' }],
  };
  const next = backfillPhases(m, [
    { id: '1', name: 'Setup' },
    { id: '2', name: 'Migrate' },
    { id: '3', name: 'Cleanup' },
  ]);
  expect(next.phases.map((p) => p.number)).toEqual([1, 2, 3]);
  expect(next.phases.map((p) => p.name)).toEqual(['Setup', 'Migrate', 'Cleanup']);
  // Phase 1's in-progress status + branch are preserved (only the name changed).
  expect(next.phases[0].status).toBe('in-progress');
  expect(next.phases[0].branch).toBe('feat-x');
  // Newly added phases default to not-started.
  expect(next.phases[1].status).toBe('not-started');
  expect(next.phases[2].status).toBe('not-started');
  expect(m.phases).toHaveLength(1); // input untouched
});

test('backfillPhases is idempotent — re-running with the same plan is a no-op', () => {
  const m: ManifestToml = {
    ...baseManifest(),
    phases: [{ number: 1, name: 'Phase 1', status: 'not-started' }],
  };
  const plan = [
    { id: '1', name: 'Setup' },
    { id: '2', name: 'Migrate' },
  ];
  const once = backfillPhases(m, plan);
  const twice = backfillPhases(once, plan);
  expect(twice.phases).toEqual(once.phases);
  expect(twice.phases).toHaveLength(2);
});

test('backfillPhases skips non-integer plan ids (manifest keys on integers)', () => {
  const m: ManifestToml = {
    ...baseManifest(),
    phases: [{ number: 1, name: 'Phase 1', status: 'not-started' }],
  };
  const next = backfillPhases(m, [
    { id: '1', name: 'Setup' },
    { id: '1.1', name: 'Dotted sub-phase' },
    { id: '2', name: 'Migrate' },
  ]);
  expect(next.phases.map((p) => p.number)).toEqual([1, 2]);
  expect(next.phases.map((p) => p.name)).toEqual(['Setup', 'Migrate']);
});

// ---------- Harness: other-sections-untouched through a real write cycle ----------

function seededManifest(): ManifestToml {
  return {
    ...baseManifest(),
    phases: [
      { number: 1, name: 'P1', status: 'completed', branch: 'b1' },
      { number: 2, name: 'P2', status: 'in-progress', branch: 'b2' },
    ],
    events: [event('project-initialized', {}), event('pr-merged', { pr: 1 })],
    checkins: [checkin('01', 'b1')],
  };
}

test('appending an event through the write cycle leaves other sections untouched', () => {
  const project = makeProject(seededManifest());
  try {
    const before = readManifestFile(project.path).manifest;
    const mutated = appendEvent(before, event('note', { text: 'new' }));
    writeManifest(project.path, mutated);

    const after = readManifestFile(project.path).manifest;
    // events grew by one; every other section is content-identical.
    expect(after.events).toHaveLength(before.events.length + 1);
    assertSectionsUnchanged(before, after, ['events']);
  } finally {
    cleanup(project);
  }
});

test('updatePhase through the write cycle leaves non-phase sections untouched', () => {
  const project = makeProject(seededManifest());
  try {
    const before = readManifestFile(project.path).manifest;
    const mutated = updatePhase(before, 2, { status: 'completed' });
    writeManifest(project.path, mutated);

    const after = readManifestFile(project.path).manifest;
    expect(after.phases[1].status).toBe('completed');
    assertSectionsUnchanged(before, after, ['phases']);
  } finally {
    cleanup(project);
  }
});

test('appendFinding through the write cycle leaves other sections untouched', () => {
  const project = makeProject(seededManifest());
  try {
    const before = readManifestFile(project.path).manifest;
    const mutated = appendFinding(before, finding('sig-x'));
    writeManifest(project.path, mutated);

    const after = readManifestFile(project.path).manifest;
    expect(after.findings).toHaveLength(before.findings.length + 1);
    // The marquee defense, now covering a Phase-1-added section: a [[findings]]
    // append must not trample checkins/events/phases/etc through the real
    // write → read cycle.
    assertSectionsUnchanged(before, after, ['findings']);
  } finally {
    cleanup(project);
  }
});

test('assertSectionsUnchanged itself throws when an unexpected section changed', () => {
  const before = seededManifest();
  const after = updatePhase(before, 1, { status: 'in-progress' });
  // We claim only events changed, but phases changed — the harness must catch it.
  expect(() => assertSectionsUnchanged(before, after, ['events'])).toThrow(/phases/);
});
