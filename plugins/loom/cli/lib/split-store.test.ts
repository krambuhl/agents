import { describe, expect, test } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifest, stringifyManifest } from './manifest-toml.ts';
import {
  composeManifest,
  isSplitStore,
  readPart,
  readProjectStore,
  readSplitStore,
  splitManifest,
  stringifyPhasePart,
  stringifyProjectPart,
  writeSplitStore,
} from './split-store.ts';

// lib -> cli -> loom -> plugins -> repo root
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const PROJECTS = join(REPO_ROOT, 'projects');

// Round-tripping over REAL manifests (active + archived) is a stronger test
// than a hand-built fixture: it exercises the split against whatever record
// shapes actually ship, including checkin-heavy archived projects.
function realManifests(): string[] {
  const out: string[] = [];
  const scan = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const mp = join(dir, e.name, 'manifest.toml');
      if (existsSync(mp)) out.push(mp);
      else scan(join(dir, e.name)); // descend (e.g. projects/archive/<slug>)
    }
  };
  scan(PROJECTS);
  return out;
}

// Order across phases is reconstructed, not preserved, for the regrouped
// per-phase collections — so compare those as multisets.
const asMultiset = (arr: unknown[]): string[] =>
  arr.map((x) => JSON.stringify(x)).sort();

const MANIFESTS = realManifests();

describe('split-store: compose(split(m)) preserves every record', () => {
  test('the manifest inventory is non-empty (no vacuous pass)', () => {
    expect(MANIFESTS.length).toBeGreaterThan(0);
  });

  for (const mp of MANIFESTS) {
    const rel = mp.replace(`${REPO_ROOT}/`, '');
    test(rel, () => {
      const m = readManifest(readFileSync(mp, 'utf8'));
      const back = composeManifest(splitManifest(m));

      // project-level sections keep their order
      expect(back.meta).toEqual(m.meta);
      expect(back.config).toEqual(m.config);
      expect(back.events).toEqual(m.events);
      expect(back.sessions).toEqual(m.sessions);
      expect(back.revisions).toEqual(m.revisions);
      expect(back.replies).toEqual(m.replies);
      expect(back.findings).toEqual(m.findings);

      // regrouped-by-phase collections compared as multisets
      expect(asMultiset(back.phases)).toEqual(asMultiset(m.phases));
      expect(asMultiset(back.checkins)).toEqual(asMultiset(m.checkins));
      expect(asMultiset(back.retros)).toEqual(asMultiset(m.retros));
    });
  }
});

describe('split-store: parts serialize through the existing manifest serializer', () => {
  test('project + phase parts stringify -> read round-trip', () => {
    const m = readManifest(readFileSync(MANIFESTS[0], 'utf8'));
    const store = splitManifest(m);

    const project = readPart(stringifyProjectPart(store));
    expect(project.meta).toEqual(store.project.meta);
    expect(project.config).toEqual(store.project.config);

    for (const [num, pm] of store.phases) {
      const back = readPart(stringifyPhasePart(store, num));
      expect(asMultiset(back.phases)).toEqual(asMultiset(pm.phases));
      expect(asMultiset(back.checkins)).toEqual(asMultiset(pm.checkins));
      expect(asMultiset(back.retros)).toEqual(asMultiset(pm.retros));
    }
  });
});

describe('split-store: fs layer + dual-read resolver', () => {
  test('write -> readSplitStore -> compose round-trips through disk', () => {
    const m = readManifest(readFileSync(MANIFESTS[0], 'utf8'));
    const dir = mkdtempSync(join(tmpdir(), 'split-store-'));
    try {
      writeSplitStore(dir, splitManifest(m));
      expect(isSplitStore(dir)).toBe(true);
      const back = composeManifest(readSplitStore(dir));
      expect(back.meta).toEqual(m.meta);
      expect(asMultiset(back.phases)).toEqual(asMultiset(m.phases));
      expect(asMultiset(back.checkins)).toEqual(asMultiset(m.checkins));
      expect(back.events).toEqual(m.events);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('readProjectStore reads a split-format project dir', () => {
    const m = readManifest(readFileSync(MANIFESTS[0], 'utf8'));
    const dir = mkdtempSync(join(tmpdir(), 'split-store-'));
    try {
      writeSplitStore(dir, splitManifest(m));
      const back = readProjectStore(dir);
      expect(back.meta).toEqual(m.meta);
      expect(asMultiset(back.checkins)).toEqual(asMultiset(m.checkins));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('readProjectStore falls back to legacy single manifest.toml', () => {
    const raw = readFileSync(MANIFESTS[0], 'utf8');
    const m = readManifest(raw);
    const dir = mkdtempSync(join(tmpdir(), 'split-store-legacy-'));
    try {
      // legacy layout: a single manifest.toml, no project.toml
      writeFileSync(join(dir, 'manifest.toml'), stringifyManifest(m), 'utf8');
      expect(isSplitStore(dir)).toBe(false);
      const back = readProjectStore(dir);
      expect(back.meta).toEqual(m.meta);
      expect(asMultiset(back.checkins)).toEqual(asMultiset(m.checkins));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
