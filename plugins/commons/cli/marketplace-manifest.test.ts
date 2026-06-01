import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/**
 * Marketplace-manifest tripwire (V9 from the
 * marketplace-portable-install plan).
 *
 * Reads `.claude-plugin/marketplace.json` at the repo root and the
 * per-plugin `plugins/<name>/.claude-plugin/plugin.json` files, then
 * asserts the registry-vs-reality contract. Catches the "manifest is
 * malformed and `claude plugin install` rejects it silently" failure
 * class before it ships.
 *
 * Same flavor as `parallel-work-invariant.test.ts`: a static set of
 * structural assertions on a hand-authored substrate file.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const MARKETPLACE_PATH = join(REPO_ROOT, '.claude-plugin/marketplace.json');

interface MarketplaceEntry {
  readonly name: string;
  readonly source: string;
  readonly description?: string;
  readonly dependencies?: ReadonlyArray<string | { name: string; marketplace?: string }>;
}

interface MarketplaceManifest {
  readonly name: string;
  readonly owner: { readonly name: string; readonly email?: string };
  readonly description?: string;
  readonly plugins: ReadonlyArray<MarketplaceEntry>;
}

interface PluginManifest {
  readonly name: string;
  /**
   * `version` is intentionally OPTIONAL. Per Claude Code docs:
   *   "If you omit `version` and host this marketplace in git,
   *    every commit automatically counts as a new version."
   * The krambuhl marketplace adopted that posture so high-velocity
   * dev doesn't require a version-bump ritual on every content
   * change. If a plugin re-adds the field, it pins itself and
   * users only get updates when the field changes.
   */
  readonly version?: string;
  readonly description?: string;
}

const EXPECTED_PLUGIN_NAMES = [
  'commons',
  'griot',
  'guild',
  'loom',
  'ev',
  'agent-loop-full',
] as const;

function readMarketplace(): MarketplaceManifest {
  const raw = readFileSync(MARKETPLACE_PATH, 'utf8');
  return JSON.parse(raw) as MarketplaceManifest;
}

function readPluginManifest(source: string): PluginManifest {
  const path = join(REPO_ROOT, source, '.claude-plugin/plugin.json');
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as PluginManifest;
}

describe('marketplace manifest: file existence', () => {
  test('.claude-plugin/marketplace.json exists at repo root', () => {
    expect(existsSync(MARKETPLACE_PATH)).toBe(true);
  });
});

describe('marketplace manifest: top-level shape', () => {
  const m = readMarketplace();

  test('declares marketplace name "krambuhl"', () => {
    expect(m.name).toBe('krambuhl');
  });

  test('declares owner.name as a non-empty string', () => {
    expect(m.owner?.name).toMatch(/.+/);
  });

  test('plugins[] is an array', () => {
    expect(Array.isArray(m.plugins)).toBe(true);
  });
});

describe('marketplace manifest: plugin entries', () => {
  const m = readMarketplace();

  test('declares exactly the expected set of plugins', () => {
    const declared = m.plugins.map((p) => p.name).sort();
    const expected = [...EXPECTED_PLUGIN_NAMES].sort();
    expect(declared).toEqual(expected);
  });

  for (const expectedName of EXPECTED_PLUGIN_NAMES) {
    describe(`entry: ${expectedName}`, () => {
      const entry = m.plugins.find((p) => p.name === expectedName);

      test('has a name field', () => {
        expect(entry?.name).toBe(expectedName);
      });

      test('has a source field', () => {
        expect(typeof entry?.source).toBe('string');
        expect(entry?.source).toMatch(/^\.\//);
      });

      test('source path resolves to an existing directory on disk', () => {
        const sourceDir = join(REPO_ROOT, entry!.source);
        expect(existsSync(sourceDir)).toBe(true);
        expect(statSync(sourceDir).isDirectory()).toBe(true);
      });

      test('per-plugin .claude-plugin/plugin.json exists', () => {
        const pluginManifestPath = join(REPO_ROOT, entry!.source, '.claude-plugin/plugin.json');
        expect(existsSync(pluginManifestPath)).toBe(true);
      });

      test('plugin.json name matches marketplace entry name', () => {
        const pluginManifest = readPluginManifest(entry!.source);
        expect(pluginManifest.name).toBe(expectedName);
      });

      test('plugin.json version field, if present, is a non-empty string', () => {
        // Version is intentionally optional in this marketplace
        // (every-commit auto-versions). When it IS set, it must be
        // a non-empty string — empty/whitespace pins to a bogus
        // version that the updater would silently honor.
        const pluginManifest = readPluginManifest(entry!.source);
        if (pluginManifest.version !== undefined) {
          expect(pluginManifest.version).toMatch(/.+/);
        }
      });
    });
  }
});

describe('marketplace manifest: intra-marketplace dependencies resolve', () => {
  const m = readMarketplace();
  const declaredNames = new Set(m.plugins.map((p) => p.name));

  for (const entry of m.plugins) {
    if (!entry.dependencies || entry.dependencies.length === 0) {
      continue;
    }

    for (const dep of entry.dependencies) {
      // Cross-marketplace deps are out of scope for this tripwire; if a
      // future entry adds one, add an explicit describe block for it.
      if (typeof dep !== 'string' && dep.marketplace) {
        continue;
      }
      const depName = typeof dep === 'string' ? dep : dep.name;

      test(`${entry.name} depends on ${depName} — resolves within marketplace`, () => {
        expect(declaredNames.has(depName)).toBe(true);
      });
    }
  }
});

describe('marketplace manifest: declared dependency edges (per PLAN)', () => {
  const m = readMarketplace();
  const byName = new Map(m.plugins.map((p) => [p.name, p] as const));

  function depsOf(name: string): ReadonlyArray<string> {
    const entry = byName.get(name);
    if (!entry?.dependencies) return [];
    return entry.dependencies.map((d) => (typeof d === 'string' ? d : d.name));
  }

  test('commons has no dependencies (foundation; depends on nothing)', () => {
    expect(depsOf('commons')).toEqual([]);
  });

  test('griot depends on commons (and only commons)', () => {
    expect([...depsOf('griot')].sort()).toEqual(['commons']);
  });

  test('guild depends on commons (and only commons)', () => {
    expect([...depsOf('guild')].sort()).toEqual(['commons']);
  });

  test('loom depends on commons, guild, griot', () => {
    expect([...depsOf('loom')].sort()).toEqual(['commons', 'griot', 'guild']);
  });

  test('ev depends on commons, loom, guild, griot', () => {
    expect([...depsOf('ev')].sort()).toEqual(['commons', 'griot', 'guild', 'loom']);
  });

  test('agent-loop-full depends on all five family plugins (including commons)', () => {
    expect([...depsOf('agent-loop-full')].sort()).toEqual([
      'commons',
      'ev',
      'griot',
      'guild',
      'loom',
    ]);
  });
});

describe('marketplace manifest: substrate-first dependency ordering', () => {
  // Substrate-kind dependencies (commons) precede peer-kind dependencies
  // (guild, griot, loom) in each consumer's `dependencies` array. This
  // encodes the semantic distinction so the JSON read order makes
  // "depends on the foundation" visually distinct from "depends on a
  // peer." If a future re-order alphabetizes the array for tidiness,
  // this test catches the drift.
  //
  // From the design-systems plan finding (Phase 1, round 1):
  // "Order the dependency array by kind: substrate first, peer second."

  const m = readMarketplace();
  const byName = new Map(m.plugins.map((p) => [p.name, p] as const));

  function rawDepsOf(name: string): ReadonlyArray<string> {
    const entry = byName.get(name);
    if (!entry?.dependencies) return [];
    return entry.dependencies.map((d) => (typeof d === 'string' ? d : d.name));
  }

  for (const pluginName of ['griot', 'guild', 'loom', 'ev', 'agent-loop-full'] as const) {
    test(`${pluginName} lists commons as its first dependency`, () => {
      const deps = rawDepsOf(pluginName);
      expect(deps.length).toBeGreaterThan(0);
      expect(deps[0]).toBe('commons');
    });
  }
});
