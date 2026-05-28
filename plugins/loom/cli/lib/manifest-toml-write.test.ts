// Write-path tests for the manifest.toml layer (Phase 2 U3).
//
// The pure round-trip (parse∘stringify) is asserted here against both the
// real-artifact fixture and synthetic manifests. The durability behavior —
// atomic temp+rename, verify-before-rename, the mtime/size concurrency
// guard, and append-only preservation — is filesystem behavior, so those
// tests use a unique temp dir per test (the loom.test.ts makeCtx idiom:
// mkdtempSync + rmSync) to stay parallel-safe.

import { test, expect } from 'vitest';
import { appendFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readManifest,
  readManifestFile,
  stringifyManifest,
  writeManifest,
} from './manifest-toml.ts';
import type { Event, ManifestToml } from './types.ts';
import { LoomError } from './errors.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '..', 'fixtures', 'manifest-real.toml');

function fixtureManifest(): ManifestToml {
  return readManifest(readFileSync(FIXTURE, 'utf8'));
}

// A synthetic manifest exercising the null/empty edges the fixture does
// not: null nullable scalars, a phase without `pr`, an empty-detail event.
function syntheticManifest(): ManifestToml {
  return {
    meta: {
      schema_version: 1,
      title: 'Synthetic',
      slug: 'syn',
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
    phases: [{ number: 1, name: 'P', status: 'in-progress' }],
    events: [{ at: 't', event: 'project-initialized', detail: {} } as Event],
    checkins: [],
    sessions: [],
    revisions: [],
  };
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'manifest-toml-write-'));
}

// ---------- Pure round-trip ----------

test('stringifyManifest round-trips the real fixture through readManifest', () => {
  const m = fixtureManifest();
  expect(readManifest(stringifyManifest(m))).toEqual(m);
});

test('stringifyManifest round-trips a synthetic manifest (null scalars, empty detail, no pr)', () => {
  const m = syntheticManifest();
  const back = readManifest(stringifyManifest(m));
  // null-by-absence: omitted on write, re-injected as null on read.
  expect(back.meta.current_branch).toBeNull();
  expect(back.meta.latest_checkin).toBeNull();
  expect(back).toEqual(m);
});

test('stringifyManifest round-trips a manifest with [[revisions]] entries', () => {
  const m: ManifestToml = {
    ...syntheticManifest(),
    revisions: [
      { timestamp: '2026-05-27T08:00:00Z', target: 'PLAN.md', seq: 1 },
      { timestamp: '2026-05-27T09:00:00Z', target: 'PLAN.md', seq: 2 },
    ],
  };
  const back = readManifest(stringifyManifest(m));
  expect(back.revisions).toEqual(m.revisions);
  expect(back).toEqual(m);
});

test('stringifyManifest omits schema_version from [config] (deduped to [meta])', () => {
  const s = stringifyManifest(syntheticManifest());
  // [config] section must not repeat schema_version; [meta] carries it once.
  const configSection = s.slice(s.indexOf('[config]'));
  expect(configSection).not.toContain('schema_version');
  expect(s).toContain('schema_version = 1'); // present once, in [meta]
});

// ---------- Atomic write ----------

test('writeManifest atomically writes a readable manifest and leaves no .tmp', () => {
  const dir = tempDir();
  try {
    const target = join(dir, 'manifest.toml');
    const m = fixtureManifest();
    const token = writeManifest(target, m);

    expect(token.size).toBeGreaterThan(0);
    // No leftover temp file from the temp+rename.
    expect(readdirSync(dir)).toEqual(['manifest.toml']);
    // Bytes on disk are exactly the serialized form.
    expect(readFileSync(target, 'utf8')).toBe(stringifyManifest(m));
    // And they round-trip back.
    expect(readManifestFile(target).manifest).toEqual(m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a fresh write (no existing file, no expect token) succeeds', () => {
  const dir = tempDir();
  try {
    const target = join(dir, 'manifest.toml');
    expect(() => writeManifest(target, syntheticManifest())).not.toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- Optimistic concurrency (mtime/size re-check) ----------

test('writeManifest aborts loudly when the file changed under a stale expect token', () => {
  const dir = tempDir();
  try {
    const target = join(dir, 'manifest.toml');
    const m = fixtureManifest();
    writeManifest(target, m);
    const { token: stale } = readManifestFile(target);

    // A concurrent writer changes the file (size differs).
    appendFileSync(target, '\n# a concurrent writer touched this\n');

    let thrown: unknown;
    try {
      writeManifest(target, m, { expect: stale });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(LoomError);
    expect((thrown as LoomError).code).toBe('manifest-changed-under-write');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeManifest with a current expect token succeeds', () => {
  const dir = tempDir();
  try {
    const target = join(dir, 'manifest.toml');
    const m = fixtureManifest();
    writeManifest(target, m);
    const { token } = readManifestFile(target);
    expect(() => writeManifest(target, m, { expect: token })).not.toThrow();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- Append-only preservation ----------

test('appending an event preserves prior events in order through a rewrite', () => {
  const dir = tempDir();
  try {
    const target = join(dir, 'manifest.toml');
    const m = fixtureManifest();
    const priorEvents = m.events.map((e) => ({ ...e }));
    expect(priorEvents.length).toBeGreaterThanOrEqual(2);

    const next: ManifestToml = {
      ...m,
      events: [...m.events, { at: 'later', event: 'note', detail: { text: 'hi' } } as Event],
    };
    writeManifest(target, next);

    const back = readManifestFile(target).manifest;
    expect(back.events).toHaveLength(priorEvents.length + 1);
    // Prior events survive in order, byte-for-byte in content.
    expect(back.events.slice(0, priorEvents.length)).toEqual(priorEvents);
    expect(back.events[priorEvents.length]).toEqual({
      at: 'later',
      event: 'note',
      detail: { text: 'hi' },
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- Strip-only smoke via subprocess ----------

test('manifest-toml.ts write path loads + runs under the real node strip-only loader', () => {
  const SMOKE = join(__dirname, 'manifest-toml.smoke.ts');
  const result = spawnSync('node', [SMOKE], { encoding: 'utf8' });
  expect(result.status, `stderr: ${result.stderr}`).toBe(0);
  expect(result.stdout).toContain('manifest-toml.smoke ok');
});
