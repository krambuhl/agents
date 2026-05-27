import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
// Extraction is lightweight (regex over the TOML text) deliberately, to
// keep this guard self-contained rather than coupling guild's tests to
// loom's TOML parser.

const here = dirname(fileURLToPath(import.meta.url)); // plugins/guild
const manifest = readFileSync(join(here, 'panel.manifest.toml'), 'utf8');
const toolsMap = readFileSync(join(here, 'tools-map.toml'), 'utf8');

// All quoted strings inside every `domains = [ ... ]` array (each array
// is single-line in the manifest).
function domainsReferenced(text: string): string[] {
  const found = new Set<string>();
  const arrayRe = /domains\s*=\s*\[([^\]]*)\]/g;
  let arrayMatch: RegExpExecArray | null = arrayRe.exec(text);
  while (arrayMatch !== null) {
    const itemRe = /"([^"]+)"/g;
    let itemMatch: RegExpExecArray | null = itemRe.exec(arrayMatch[1]);
    while (itemMatch !== null) {
      found.add(itemMatch[1]);
      itemMatch = itemRe.exec(arrayMatch[1]);
    }
    arrayMatch = arrayRe.exec(text);
  }
  return [...found];
}

// All values of a scalar key (`personality = "x"`, `phase = "y"`).
function scalarValues(text: string, key: string): string[] {
  const found = new Set<string>();
  const re = new RegExp(`${key}\\s*=\\s*"([^"]+)"`, 'g');
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    found.add(m[1]);
    m = re.exec(text);
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
    const missing = phases.filter(
      (p) => !toolsMap.includes(`[phase.${p}]`),
    );
    expect(missing).toEqual([]);
  });

  it('the retained hand-authored agent exists', () => {
    expect(
      existsSync(join(here, 'agents', 'evaluator-contract-fit.md')),
    ).toBe(true);
  });
});
