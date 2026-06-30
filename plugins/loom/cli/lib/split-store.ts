// sync-shared: plugin-local
// Distributed project store (project 2026-06-30-distributed-project-store),
// Phase 1 Unit 1: the split storage format — in-memory decompose/recompose.
//
// ADDITIVE + DUAL-READ posture: nothing in readManifest / stringifyManifest
// changes. This module decomposes a ManifestToml into a PROJECT part
// (project.toml) + per-phase parts (phases/<N>/manifest.toml) and recomposes
// them, reusing the existing manifest serializer for each part so no record
// serialization is reimplemented.
//
// Bucketing (project decision 0010):
//   per-phase  — the phase descriptor + checkins (by checkin.phase.number) +
//                session retros (by retro.phase)
//   project    — meta, config, revisions, sessions (span phases via
//                phases_touched), events, replies, findings, the project retro
// Records with no direct phase number (replies / findings / events) stay
// project-level in this unit; tightening their phase association is later work.

import { readManifest, stringifyManifest } from './manifest-toml.ts';
import type { Checkin, ManifestToml, Retro } from './types.ts';

export type SplitStore = {
  // Project-level sections; phases/checkins/session-retros are empty here.
  project: ManifestToml;
  // Each phase part carries meta+config (so the file is independently valid)
  // plus exactly one phase descriptor and that phase's records.
  phases: Map<number, ManifestToml>;
};

function isSessionRetro(r: Retro): r is Extract<Retro, { type: 'session' }> {
  return r.type === 'session';
}

// Decompose a consolidated manifest into the split store.
export function splitManifest(m: ManifestToml): SplitStore {
  const sessionRetros = m.retros.filter(isSessionRetro);
  const projectRetros = m.retros.filter((r) => r.type === 'project');
  const phaseNums = new Set(m.phases.map((p) => p.number));

  // Orphans — a checkin/session-retro whose phase.number has no matching phase
  // descriptor — must NOT be dropped; they fall back to the project level so
  // the split is lossless. (Real archived manifests carry such records.)
  const project: ManifestToml = {
    meta: m.meta,
    config: m.config,
    phases: [],
    events: [...m.events],
    checkins: m.checkins.filter((c) => !phaseNums.has(c.phase.number)),
    sessions: [...m.sessions],
    revisions: [...m.revisions],
    retros: [...projectRetros, ...sessionRetros.filter((r) => !phaseNums.has(r.phase))],
    replies: [...m.replies],
    findings: [...m.findings],
  };

  const phases = new Map<number, ManifestToml>();
  for (const ph of m.phases) {
    phases.set(ph.number, {
      meta: m.meta,
      config: m.config,
      phases: [ph],
      checkins: m.checkins.filter((c) => c.phase.number === ph.number),
      retros: sessionRetros.filter((r) => r.phase === ph.number),
      events: [],
      sessions: [],
      revisions: [],
      replies: [],
      findings: [],
    });
  }
  return { project, phases };
}

// Recompose the split store back into a consolidated manifest. Project-level
// sections keep their order; per-phase records are concatenated in phase-number
// order (within a phase, order is preserved).
export function composeManifest(store: SplitStore): ManifestToml {
  const phases = [...store.phases.values()]
    .map((pm) => pm.phases[0])
    .filter((p): p is NonNullable<typeof p> => p !== undefined)
    .sort((a, b) => a.number - b.number);

  const checkins: Checkin[] = [];
  const sessionRetros: Retro[] = [];
  for (const p of phases) {
    const pm = store.phases.get(p.number);
    if (pm === undefined) continue;
    checkins.push(...pm.checkins);
    sessionRetros.push(...pm.retros);
  }

  return {
    meta: store.project.meta,
    config: store.project.config,
    phases,
    events: [...store.project.events],
    // project-level (orphan) checkins/retros first, then the per-phase ones
    checkins: [...store.project.checkins, ...checkins],
    sessions: [...store.project.sessions],
    revisions: [...store.project.revisions],
    retros: [...store.project.retros, ...sessionRetros],
    replies: [...store.project.replies],
    findings: [...store.project.findings],
  };
}

// File serialization reuses the existing manifest serializer: each split part
// IS a manifest.toml with only its sections populated, so project.toml and
// phases/<N>/manifest.toml validate and round-trip through the same code path.

export function stringifyProjectPart(store: SplitStore): string {
  return stringifyManifest(store.project);
}

export function stringifyPhasePart(store: SplitStore, phase: number): string {
  const pm = store.phases.get(phase);
  if (pm === undefined) throw new Error(`split-store: no phase ${phase}`);
  return stringifyManifest(pm);
}

export function readPart(raw: string): ManifestToml {
  return readManifest(raw);
}
