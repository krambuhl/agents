// Shared parallel-safe test harness for the manifest.toml verb migration.
//
// Test-time only (the `.harness` segment groups it with `.test` / `.smoke`):
// it is imported by manifest-toml-helpers.test.ts now and by U5's verb tests
// later, never by runtime verbs. The whiteboard's §5 mandate — ONE shared
// harness, not per-verb bespoke — because every migrated verb read-modify-
// writes the SAME manifest.toml, so the scary consolidation bug is one verb
// trampling another verb's section. The defense:
//
//   const before = readManifestFile(path).manifest;
//   ... run the mutation + writeManifest ...
//   const after = readManifestFile(path).manifest;
//   assertSectionsUnchanged(before, after, ['events']); // only events moved
//
// Parallel-safety is the load-bearing property: vitest runs files in
// parallel, so two tests sharing a hardcoded fixture path would race into
// flakiness. makeProject mints a UNIQUE temp dir per call (mkdtempSync), and
// every caller pairs it with cleanup() in a finally block.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeManifest } from './manifest-toml.ts';
import type { ManifestToml } from './types.ts';

export type Project = { dir: string; path: string };

const SECTIONS = ['meta', 'config', 'phases', 'events', 'checkins', 'sessions'] as const;

// The section names, as a union — so assertSectionsUnchanged's `changed`
// argument rejects a typo ('event' vs 'events') at compile time rather than
// silently asserting nothing changed in the misspelled name.
export type SectionName = (typeof SECTIONS)[number];

// A minimal valid manifest to seed from; tests spread over it to add the
// section content a given case needs.
export function baseManifest(): ManifestToml {
  return {
    meta: {
      schema_version: 1,
      title: 'Harness Project',
      slug: 'harness',
      started: '2026-05-27',
      status: 'active',
      current_branch: null,
      latest_checkin: null,
      strategy: 'interactive',
    },
    config: {
      schema_version: 1,
      base_branch: 'main',
      reviewers: [],
      labels: [],
      verification: [],
      worker_bindings: {},
    },
    phases: [],
    events: [],
    checkins: [],
    sessions: [],
  };
}

// Mint a unique temp project dir and seed it with a manifest.toml.
export function makeProject(seed: ManifestToml): Project {
  const dir = mkdtempSync(join(tmpdir(), 'loom-harness-'));
  const path = join(dir, 'manifest.toml');
  writeManifest(path, seed);
  return { dir, path };
}

export function cleanup(project: Project): void {
  rmSync(project.dir, { recursive: true, force: true });
}

// Throw if any section NOT named in `changed` differs between two manifests.
// Comparison is structural via JSON.stringify, which is reliable here because
// both inputs come from readManifest, whose reconstructors build each section
// with deterministic key order. This is the "every other section untouched"
// assertion — the cheapest defense against a verb trampling a sibling section.
export function assertSectionsUnchanged(
  before: ManifestToml,
  after: ManifestToml,
  changed: SectionName[],
): void {
  for (const section of SECTIONS) {
    if (changed.includes(section)) continue;
    const a = JSON.stringify(before[section]);
    const b = JSON.stringify(after[section]);
    if (a !== b) {
      throw new Error(
        `section '${section}' changed but was expected untouched (changed: [${changed.join(', ')}])`,
      );
    }
  }
}
