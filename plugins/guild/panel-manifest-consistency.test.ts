import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTomlTable, parseToml, type TomlTable } from './cli/lib/toml.ts';

// Real-artifact consistency guard for the Phase 4 wiring.
//
// panel.manifest.toml names the (personality x domain x phase)
// combinations Phase 5 codegen will emit; tools-map.toml supplies the
// tool grants. Both reference axis fragments by name. This test pins
// that every name the manifest references resolves to a real source
// file, and that tools-map declares every phase the manifest uses — the
// "manifest-total over tools-map" invariant the no-permissive-default
// contract depends on. It catches a typo'd domain, a personality the
// codegen can't find, or a phase missing from tools-map BEFORE Phase 5
// tries to generate from these files.
//
// Extraction goes through guild's own minimal TOML reader (the same one
// `guild generate` folds with), so this guard and the codegen share one
// parser rather than this test re-deriving the data with regex.

const here = dirname(fileURLToPath(import.meta.url)); // plugins/guild
const manifest = parseToml(readFileSync(join(here, 'panel.manifest.toml'), 'utf8'));
const toolsMap = parseToml(readFileSync(join(here, 'tools-map.toml'), 'utf8'));

// Both [[combinations]] and [[recipes]] reference axis fragments by name
// and must resolve. Collect them as a single set of reference rows.
function referenceRows(doc: TomlTable): TomlTable[] {
  const rows: TomlTable[] = [];
  for (const key of ['combinations', 'recipes']) {
    const arr = doc[key];
    if (Array.isArray(arr)) {
      for (const entry of arr) if (isTomlTable(entry)) rows.push(entry);
    }
  }
  return rows;
}

function domainsReferenced(doc: TomlTable): string[] {
  const found = new Set<string>();
  for (const row of referenceRows(doc)) {
    const domains = row.domains;
    if (Array.isArray(domains)) {
      for (const d of domains) if (typeof d === 'string') found.add(d);
    }
  }
  return [...found];
}

// All values of a scalar key (`personality = "x"`, `phase = "y"`) across
// the reference rows.
function scalarValues(doc: TomlTable, key: string): string[] {
  const found = new Set<string>();
  for (const row of referenceRows(doc)) {
    const value = row[key];
    if (typeof value === 'string') found.add(value);
  }
  return [...found];
}

describe('panel.manifest.toml references resolve', () => {
  it('every referenced domain has a domain mode file', () => {
    const domains = domainsReferenced(manifest);
    expect(domains.length).toBeGreaterThan(0);
    const missing = domains.filter(
      (d) => !existsSync(join(here, 'modes', 'domains', `${d}.md`)),
    );
    expect(missing).toEqual([]);
  });

  it('every referenced personality has a personality fragment', () => {
    const personalities = scalarValues(manifest, 'personality');
    expect(personalities.length).toBeGreaterThan(0);
    const missing = personalities.filter(
      (p) => !existsSync(join(here, 'agents', 'personalities', `${p}.md`)),
    );
    expect(missing).toEqual([]);
  });

  it('every referenced phase has a phase mode file', () => {
    const phases = scalarValues(manifest, 'phase');
    expect(phases.length).toBeGreaterThan(0);
    const missing = phases.filter(
      (p) => !existsSync(join(here, 'modes', 'phases', `${p}.md`)),
    );
    expect(missing).toEqual([]);
  });

  it('tools-map declares every phase the manifest uses (no-permissive-default totality)', () => {
    const phases = scalarValues(manifest, 'phase');
    // Self-contained guard: a silently-empty extraction must not pass
    // this vacuously (don't lean on a sibling test's guard).
    expect(phases.length).toBeGreaterThan(0);
    const phaseSection = toolsMap.phase;
    const missing = phases.filter(
      (p) => !(isTomlTable(phaseSection) && isTomlTable(phaseSection[p])),
    );
    expect(missing).toEqual([]);
  });

  it('the retained hand-authored agent exists', () => {
    expect(
      existsSync(join(here, 'agents', 'evaluator-contract-fit.md')),
    ).toBe(true);
  });
});
