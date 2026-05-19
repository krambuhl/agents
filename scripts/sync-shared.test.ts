import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  applySync,
  detectDrift,
  PLUGINS_WITH_CLI,
  planForPlugin,
} from './sync-shared.ts';

/**
 * V10 — sync-shared drift-detection tripwire.
 *
 * Three cases per the marketplace-portable-install PLAN:
 *   (a) Pure logic: planForPlugin returns the expected source/dest
 *       pairs given a fixture tree.
 *   (b) End-to-end byte-for-byte: applySync produces files that
 *       byte-equal their upstream sources.
 *   (c) Drift detection: a mutated per-plugin file post-sync makes
 *       detectDrift report a `divergent` record; `--check` exits
 *       non-zero (covered by the script's CLI main, exercised here
 *       via detectDrift directly).
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sync-shared-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(path: string, body: string): void {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, body, 'utf8');
}

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

function buildMinimalSourceTree(): void {
  // Shared lib (all 3 plugins copy this)
  write('cli/lib/manifest.ts', 'export const MANIFEST = "fixture";\n');
  write('cli/lib/events.ts', 'export const EVENTS = "fixture";\n');
  // Per-plugin verb subtrees
  write('cli/verbs/griot/use.ts', 'export const useVerb = () => null;\n');
  write('cli/verbs/guild/derive-panel.ts', 'export const dp = () => null;\n');
  write('cli/verbs/loom/project.ts', 'export const PROJECT_VERBS = {};\n');
  // Plugin entries
  write('cli/griot.ts', '#!/usr/bin/env node\nconsole.log("griot");\n');
  write('cli/guild.ts', '#!/usr/bin/env node\nconsole.log("guild");\n');
  write('cli/loom.ts', '#!/usr/bin/env node\nconsole.log("loom");\n');
  // Excluded: test files + fixtures (should NOT be copied)
  write('cli/lib/manifest.test.ts', 'test stub');
  write('cli/verbs/griot/use.test.ts', 'test stub');
  write('cli/fixtures/manifest-basic.json', '{}');
  write('cli/griot.test.ts', 'test stub');
}

describe('V10 (a): planForPlugin returns expected source/dest pairs', () => {
  test('griot plan covers cli/lib + cli/verbs/griot + cli/griot.ts only', () => {
    buildMinimalSourceTree();
    const plan = planForPlugin('griot', root);

    const sources = plan.files.map((f) => f.source).sort();
    expect(sources).toEqual(
      [
        'cli/griot.ts',
        'cli/lib/events.ts',
        'cli/lib/manifest.ts',
        'cli/verbs/griot/use.ts',
      ].sort(),
    );

    // All destinations are namespaced under the plugin's source dir.
    for (const { destination } of plan.files) {
      expect(destination.startsWith('plugins/griot/')).toBe(true);
    }
  });

  test('plan excludes test files and fixtures', () => {
    buildMinimalSourceTree();
    const plan = planForPlugin('griot', root);
    const sources = plan.files.map((f) => f.source);
    expect(sources).not.toContain('cli/griot.test.ts');
    expect(sources).not.toContain('cli/lib/manifest.test.ts');
    expect(sources).not.toContain('cli/verbs/griot/use.test.ts');
    expect(sources.some((s) => s.includes('/fixtures/'))).toBe(false);
  });

  test('plan filters per-plugin verbs subtree (griot plan does not include guild or loom verbs)', () => {
    buildMinimalSourceTree();
    const plan = planForPlugin('griot', root);
    const sources = plan.files.map((f) => f.source);
    expect(sources.some((s) => s.startsWith('cli/verbs/guild/'))).toBe(false);
    expect(sources.some((s) => s.startsWith('cli/verbs/loom/'))).toBe(false);
  });

  test('every plugin gets the same shared lib subset', () => {
    buildMinimalSourceTree();
    const libFiles = ['cli/lib/events.ts', 'cli/lib/manifest.ts'];
    for (const plugin of PLUGINS_WITH_CLI) {
      const plan = planForPlugin(plugin, root);
      const sources = plan.files.map((f) => f.source);
      for (const lib of libFiles) {
        expect(sources).toContain(lib);
      }
    }
  });
});

describe('V10 (b): applySync end-to-end byte-for-byte match', () => {
  test('every generated file byte-equals its upstream source', () => {
    buildMinimalSourceTree();
    const cwd = process.cwd();
    try {
      process.chdir(root);
      applySync(root);
    } finally {
      process.chdir(cwd);
    }

    // Spot-check three files across all three plugins.
    expect(read('plugins/griot/cli/lib/manifest.ts')).toBe(
      read('cli/lib/manifest.ts'),
    );
    expect(read('plugins/guild/cli/verbs/guild/derive-panel.ts')).toBe(
      read('cli/verbs/guild/derive-panel.ts'),
    );
    expect(read('plugins/loom/cli/loom.ts')).toBe(read('cli/loom.ts'));
  });

  test('post-sync drift-check reports no drift on a clean tree', () => {
    buildMinimalSourceTree();
    applySync(root);
    const drift = detectDrift(root);
    expect(drift).toEqual([]);
  });

  test('test files do NOT land in the generated tree', () => {
    buildMinimalSourceTree();
    applySync(root);
    // The excluded files exist upstream but must not be copied.
    expect(() => read('plugins/griot/cli/griot.test.ts')).toThrow();
    expect(() => read('plugins/griot/cli/lib/manifest.test.ts')).toThrow();
    expect(() => read('plugins/griot/cli/verbs/griot/use.test.ts')).toThrow();
  });

  test('plugin entries land at plugins/<name>/cli/<name>.ts (matches W6 shim resolution path)', () => {
    buildMinimalSourceTree();
    applySync(root);
    expect(read('plugins/griot/cli/griot.ts')).toBe(read('cli/griot.ts'));
    expect(read('plugins/guild/cli/guild.ts')).toBe(read('cli/guild.ts'));
    expect(read('plugins/loom/cli/loom.ts')).toBe(read('cli/loom.ts'));
  });
});

describe('V10 (c): drift detection — false-green failure-mode tripwire', () => {
  test('mutated per-plugin file post-sync is reported as divergent', () => {
    buildMinimalSourceTree();
    applySync(root);

    // Mutate one per-plugin file post-sync — simulates a careless edit
    // to the generated tree instead of the upstream source.
    writeFileSync(
      join(root, 'plugins/griot/cli/lib/manifest.ts'),
      'export const MANIFEST = "tampered";\n',
      'utf8',
    );

    const drift = detectDrift(root);
    const griotDrift = drift.filter((d) => d.plugin === 'griot');
    expect(griotDrift.length).toBeGreaterThanOrEqual(1);
    const manifest = griotDrift.find(
      (d) => d.destination === 'plugins/griot/cli/lib/manifest.ts',
    );
    expect(manifest).toBeDefined();
    expect(manifest?.kind).toBe('divergent');
    expect(manifest?.message).toMatch(/diverges from upstream/);
    expect(manifest?.message).toMatch(/sync-shared\.ts/);
  });

  test('orphan file in plugin tree (no upstream source) is reported', () => {
    buildMinimalSourceTree();
    applySync(root);

    // Add a file in the generated tree that has no upstream source.
    write('plugins/griot/cli/lib/orphan.ts', 'export const ORPHAN = true;\n');

    const drift = detectDrift(root);
    const orphan = drift.find(
      (d) => d.destination === 'plugins/griot/cli/lib/orphan.ts',
    );
    expect(orphan).toBeDefined();
    expect(orphan?.kind).toBe('orphan');
    expect(orphan?.source).toBeNull();
  });

  test('missing file in plugin tree (upstream exists, dest does not) is reported', () => {
    buildMinimalSourceTree();
    applySync(root);

    // Delete a synced file; --check should flag it as missing.
    rmSync(join(root, 'plugins/griot/cli/lib/manifest.ts'));

    const drift = detectDrift(root);
    const missing = drift.find(
      (d) => d.destination === 'plugins/griot/cli/lib/manifest.ts',
    );
    expect(missing).toBeDefined();
    expect(missing?.kind).toBe('missing');
    expect(missing?.source).toBe('cli/lib/manifest.ts');
  });

  test('drift message names source path + plugin path + one-shot remedy', () => {
    buildMinimalSourceTree();
    applySync(root);
    writeFileSync(
      join(root, 'plugins/griot/cli/lib/manifest.ts'),
      'tampered',
      'utf8',
    );

    const drift = detectDrift(root);
    const record = drift.find(
      (d) => d.destination === 'plugins/griot/cli/lib/manifest.ts',
    );
    // The error message must name: source path, divergent plugin path,
    // and the one-shot remedy. These are the substrate convention for
    // loud-fail drift error messages.
    expect(record?.message).toContain('plugins/griot/cli/lib/manifest.ts');
    expect(record?.message).toContain('cli/lib/manifest.ts');
    expect(record?.message).toContain('sync-shared.ts');
  });
});
