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
  planForPlugin,
  COMMONS_CONSUMERS,
  PLUGINS_WITH_CLI,
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

function buildOldDirectionTree(): void {
  // Post-PR3, root-canonical NO LONGER claims cli/lib/ (commons-canonical
  // owns it). Old direction now covers: cli/verbs/, cli/(plugin).ts,
  // skills/(plugin-prefix), agents/(plugin-prefix).md only.
  //
  // Per-plugin verb subtrees (still root-canonical until PR4)
  write('cli/verbs/griot/use.ts', 'export const useVerb = () => null;\n');
  write('cli/verbs/guild/derive-panel.ts', 'export const dp = () => null;\n');
  write('cli/verbs/loom/project.ts', 'export const PROJECT_VERBS = {};\n');
  // Plugin entries (still root-canonical until PR4)
  write('cli/griot.ts', '#!/usr/bin/env node\nconsole.log("griot");\n');
  write('cli/guild.ts', '#!/usr/bin/env node\nconsole.log("guild");\n');
  write('cli/loom.ts', '#!/usr/bin/env node\nconsole.log("loom");\n');
  // Skills — one per plugin under its prefix (still root-canonical until PR4)
  write('skills/griot-load/SKILL.md', '---\nname: griot-load\n---\nfixture\n');
  write('skills/guild-validate/SKILL.md', '---\nname: guild-validate\n---\nfixture\n');
  write('skills/loom-plan/SKILL.md', '---\nname: loom-plan\n---\nfixture\n');
  write('skills/ev-run/SKILL.md', '---\nname: ev-run\n---\nfixture\n');
  // Agents — one per agent-namespace (still root-canonical until PR4)
  write('agents/griot-judge.md', '---\nname: griot-judge\n---\nfixture\n');
  write('agents/whiteboard-skeptic.md', '---\nname: whiteboard-skeptic\n---\nfixture\n');
  write('agents/evaluator-contract-fit.md', '---\nname: evaluator-contract-fit\n---\nfixture\n');
  write('agents/generator-base.md', '---\nname: generator-base\n---\nfixture\n');
  // Excluded: test files + fixtures (should NOT be copied to consumers).
  write('cli/verbs/griot/use.test.ts', 'test stub');
  write('cli/fixtures/manifest-basic.json', '{}');
  write('cli/griot.test.ts', 'test stub');
}

/**
 * PR2/PR3 fixture: commons-canonical source content only.
 * Populates `plugins/commons/cli/lib/` and `plugins/commons/docs/` with
 * the lib + docs content consumer plugins receive via sync-shared.ts.
 * No root-canonical content. Defends the commons→consumer direction in
 * isolation.
 */
function buildCommonsDirectionTree(): void {
  write('plugins/commons/cli/lib/manifest.ts', 'export const MANIFEST = "fixture";\n');
  write('plugins/commons/cli/lib/events.ts', 'export const EVENTS = "fixture";\n');
  write('plugins/commons/cli/lib/helpers.ts', 'export const HELPERS = "commons-fixture";\n');
  write('plugins/commons/cli/lib/manifest.test.ts', 'test stub');
  write('plugins/commons/docs/AGENT-CONVENTIONS.md', '# Agent conventions fixture\n');
  write('plugins/commons/docs/PANEL-COMPOSITION.md', '# Panel composition fixture\n');
}

/**
 * PR2 fixture: both directions populated — root-canonical AND
 * commons-canonical. Defends the interaction (the actual risk Phase 1
 * introduces). Uses non-overlapping destinations by default; tests
 * that want to exercise the conflict guard write a colliding file
 * after this builder runs.
 */
function buildBothDirectionsTree(): void {
  buildOldDirectionTree();
  buildCommonsDirectionTree();
}

describe('V10 (a): planForPlugin returns expected source/dest pairs', () => {
  test('griot plan covers only commons-canonical lib + docs (post-PR4: root claims nothing)', () => {
    buildBothDirectionsTree();
    const plan = planForPlugin('griot', root);

    const sources = plan.files.map((f) => f.source).sort();
    // Post-PR4: root-canonical claims NOTHING. Each plugin's
    // skills/agents/verbs/entry are authoritative in its own tree
    // (not sync-managed). The planner only emits commons-canonical
    // specs — lib for PLUGINS_WITH_CLI consumers, docs for
    // doc-consumers.
    expect(sources).toEqual(
      [
        'plugins/commons/cli/lib/events.ts',
        'plugins/commons/cli/lib/helpers.ts',
        'plugins/commons/cli/lib/manifest.ts',
        'plugins/commons/docs/AGENT-CONVENTIONS.md',
        'plugins/commons/docs/PANEL-COMPOSITION.md',
      ].sort(),
    );

    // All destinations are namespaced under the plugin's tree.
    for (const { destination } of plan.files) {
      expect(destination.startsWith('plugins/griot/')).toBe(true);
    }
  });

  test('plan excludes test files and fixtures (commons-canonical exclusion still holds)', () => {
    buildBothDirectionsTree();
    const plan = planForPlugin('griot', root);
    const sources = plan.files.map((f) => f.source);
    expect(sources).not.toContain('plugins/commons/cli/lib/manifest.test.ts');
    expect(sources.some((s) => s.includes('/fixtures/'))).toBe(false);
  });

  test('full lib-consumers (griot, guild) get the same shared lib subset (post-PR3: from commons)', () => {
    buildBothDirectionsTree();
    const libFiles = [
      'plugins/commons/cli/lib/events.ts',
      'plugins/commons/cli/lib/manifest.ts',
    ];
    // loom is a PARTIAL consumer (LIB_MIRROR_ALLOWLIST) — it does NOT
    // mirror events.ts/manifest.ts (it consolidated them into its TOML
    // manifest stack). Its restricted plan is covered by the
    // "loom is a partial lib-consumer" block below.
    for (const plugin of ['griot', 'guild'] as const) {
      const plan = planForPlugin(plugin, root);
      const sources = plan.files.map((f) => f.source);
      for (const lib of libFiles) {
        expect(sources).toContain(lib);
      }
    }
  });
});

describe('V10 (b): applySync end-to-end byte-for-byte match (commons-canonical only post-PR4)', () => {
  test('lib file synced from commons byte-equals its commons source', () => {
    buildBothDirectionsTree();
    const cwd = process.cwd();
    try {
      process.chdir(root);
      applySync(root);
    } finally {
      process.chdir(cwd);
    }

    // Post-PR4: only commons-canonical content is synced. Lib content
    // flows from plugins/commons/cli/lib/ → each consumer's
    // plugins/<consumer>/cli/lib/. Docs flow similarly.
    expect(read('plugins/griot/cli/lib/manifest.ts')).toBe(
      read('plugins/commons/cli/lib/manifest.ts'),
    );
    expect(read('plugins/loom/docs/AGENT-CONVENTIONS.md')).toBe(
      read('plugins/commons/docs/AGENT-CONVENTIONS.md'),
    );
  });

  test('post-sync drift-check reports no drift on a clean tree', () => {
    buildBothDirectionsTree();
    applySync(root);
    const drift = detectDrift(root);
    expect(drift).toEqual([]);
  });

  test('commons-canonical test files do NOT land in consumer generated trees', () => {
    buildBothDirectionsTree();
    applySync(root);
    // commons lib test files (e.g. plugins/commons/cli/lib/manifest.test.ts)
    // must not be copied into consumer plugin trees — the isExcluded()
    // rule still keeps *.test.ts out of the sync.
    expect(() => read('plugins/griot/cli/lib/manifest.test.ts')).toThrow();
  });
});

describe('P5 D2: --only / --exclude-lib scope the sync (copy-only, no orphan delete)', () => {
  test('--exclude-lib syncs docs but not lib', () => {
    buildCommonsDirectionTree();
    applySync(root, { excludeLib: true });
    expect(read('plugins/loom/docs/PANEL-COMPOSITION.md')).toBe(
      read('plugins/commons/docs/PANEL-COMPOSITION.md'),
    );
    expect(() => read('plugins/griot/cli/lib/manifest.ts')).toThrow();
  });

  test('--only=<one doc> syncs only that doc — other docs + all lib untouched', () => {
    buildCommonsDirectionTree();
    applySync(root, { only: 'plugins/commons/docs/PANEL-COMPOSITION.md' });
    expect(read('plugins/ev/docs/PANEL-COMPOSITION.md')).toBe(
      read('plugins/commons/docs/PANEL-COMPOSITION.md'),
    );
    expect(() => read('plugins/ev/docs/AGENT-CONVENTIONS.md')).toThrow();
    expect(() => read('plugins/griot/cli/lib/manifest.ts')).toThrow();
  });

  test('--only supports a single-star basename glob that does not cross into cli/lib', () => {
    buildCommonsDirectionTree();
    applySync(root, { only: 'plugins/commons/docs/*.md' });
    expect(read('plugins/loom/docs/PANEL-COMPOSITION.md')).toBe(
      read('plugins/commons/docs/PANEL-COMPOSITION.md'),
    );
    expect(read('plugins/loom/docs/AGENT-CONVENTIONS.md')).toBe(
      read('plugins/commons/docs/AGENT-CONVENTIONS.md'),
    );
    expect(() => read('plugins/griot/cli/lib/manifest.ts')).toThrow();
  });

  test('--only with ** crosses path segments where a single * would not', () => {
    buildCommonsDirectionTree();
    // `**` collapses the leading plugins/commons/docs/ segments; a single `*`
    // could not (it stops at the first `/`). Proves the two are distinct.
    applySync(root, { only: '**/PANEL-COMPOSITION.md' });
    expect(read('plugins/loom/docs/PANEL-COMPOSITION.md')).toBe(
      read('plugins/commons/docs/PANEL-COMPOSITION.md'),
    );
    expect(() => read('plugins/loom/docs/AGENT-CONVENTIONS.md')).toThrow();
  });

  test('a scoped run never deletes orphans even with strictOrphan; a full run still does', () => {
    buildCommonsDirectionTree();
    applySync(root); // full sync populates consumer trees
    write('plugins/griot/cli/lib/orphan.ts', 'export const ORPHAN = 1;\n');
    // Scoped + strictOrphan: copy-only, the orphan survives (overreach guard).
    applySync(root, { excludeLib: true, strictOrphan: true });
    expect(read('plugins/griot/cli/lib/orphan.ts')).toBe('export const ORPHAN = 1;\n');
    // Contrast: a FULL strictOrphan run sweeps the unmarked orphan as before.
    applySync(root, { strictOrphan: true });
    expect(() => read('plugins/griot/cli/lib/orphan.ts')).toThrow();
  });
});

describe('V10 (c): drift detection — false-green failure-mode tripwire', () => {
  test('mutated per-plugin file post-sync is reported as divergent', () => {
    buildBothDirectionsTree();
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
    buildOldDirectionTree();
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
    buildBothDirectionsTree();
    applySync(root);

    // Delete a synced file; --check should flag it as missing.
    rmSync(join(root, 'plugins/griot/cli/lib/manifest.ts'));

    const drift = detectDrift(root);
    const missing = drift.find(
      (d) => d.destination === 'plugins/griot/cli/lib/manifest.ts',
    );
    expect(missing).toBeDefined();
    expect(missing?.kind).toBe('missing');
    // Post-PR3: lib is sourced from plugins/commons/cli/lib/.
    expect(missing?.source).toBe('plugins/commons/cli/lib/manifest.ts');
  });

  test('drift message names source path + plugin path + one-shot remedy', () => {
    buildBothDirectionsTree();
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
    expect(record?.message).toContain('plugins/commons/cli/lib/manifest.ts');
    expect(record?.message).toMatch(/sync-shared\.ts/);
  });
});

describe('skills + agents: post-PR4 plugin-authoritative', () => {
  // Pre-PR4, this describe block defended the root-canonical sync of
  // skills/<dir>/ and agents/<file>.md into per-plugin trees. PR4
  // dissolved that direction — each plugin's skills/agents are
  // authoritative in its own tree, not synced from root. So the old
  // tests are moot. The block stays as a regression check that the
  // planner does NOT spuriously claim plugin-authoritative content.

  test('planForPlugin emits zero specs for plugins/<plugin>/skills/ (authoritative)', () => {
    buildBothDirectionsTree();
    // No matter what's at root skills/, the planner doesn't claim skills.
    for (const plugin of ['griot', 'guild', 'loom', 'ev'] as const) {
      const plan = planForPlugin(plugin, root);
      const skillSpecs = plan.files.filter((f) => f.destination.includes('/skills/'));
      expect(skillSpecs).toEqual([]);
    }
  });

  test('planForPlugin emits zero specs for plugins/<plugin>/agents/ (authoritative)', () => {
    buildBothDirectionsTree();
    for (const plugin of ['griot', 'guild', 'loom', 'ev'] as const) {
      const plan = planForPlugin(plugin, root);
      const agentSpecs = plan.files.filter((f) => f.destination.includes('/agents/'));
      expect(agentSpecs).toEqual([]);
    }
  });

  test('planForPlugin emits zero specs for plugins/<plugin>/cli/verbs/ (authoritative)', () => {
    buildBothDirectionsTree();
    for (const plugin of ['griot', 'guild', 'loom'] as const) {
      const plan = planForPlugin(plugin, root);
      const verbSpecs = plan.files.filter((f) => f.destination.includes('/cli/verbs/'));
      expect(verbSpecs).toEqual([]);
    }
  });

  test('planForPlugin emits zero specs for plugins/<plugin>/cli/<plugin>.ts (authoritative)', () => {
    buildBothDirectionsTree();
    for (const plugin of ['griot', 'guild', 'loom'] as const) {
      const plan = planForPlugin(plugin, root);
      const entrySpecs = plan.files.filter(
        (f) => f.destination === `plugins/${plugin}/cli/${plugin}.ts`,
      );
      expect(entrySpecs).toEqual([]);
    }
  });

  test('agent-loop-full meta-bundle plans zero files', () => {
    buildBothDirectionsTree();
    const plan = planForPlugin('agent-loop-full', root);
    expect(plan.files).toEqual([]);
  });
});

// Trailing artifact from the original drift-message test; kept for
// the structural close-out of the original describe-block above.
describe('V10 (c) closure: drift-message format coverage (already asserted above)', () => {
  test('drift message format also names the script name', () => {
    buildBothDirectionsTree();
    applySync(root);
    writeFileSync(join(root, 'plugins/griot/cli/lib/manifest.ts'), 'x', 'utf8');
    const drift = detectDrift(root);
    const record = drift.find(
      (d) => d.destination === 'plugins/griot/cli/lib/manifest.ts',
    );
    expect(record?.message).toContain('sync-shared.ts');
  });
});

// ============================================================
// PR2 — commons-canonical sync direction
// ============================================================

describe('PR2 (a): commons-source planner — empty-commons no-op invariant', () => {
  test('with no commons content, planForPlugin emits zero commons-canonical specs', () => {
    buildOldDirectionTree();
    for (const plugin of COMMONS_CONSUMERS.lib) {
      const plan = planForPlugin(plugin, root);
      const commonsSpecs = plan.files.filter((f) => f.origin === 'commons-canonical');
      expect(commonsSpecs).toEqual([]);
    }
    for (const plugin of COMMONS_CONSUMERS.docs) {
      const plan = planForPlugin(plugin, root);
      const commonsSpecs = plan.files.filter((f) => f.origin === 'commons-canonical');
      expect(commonsSpecs).toEqual([]);
    }
  });

  test('with no commons content, applySync writes only root-canonical files', () => {
    buildOldDirectionTree();
    applySync(root);
    const drift = detectDrift(root);
    expect(drift).toEqual([]);
  });

  test('every root-canonical SyncSpec carries origin: "root-canonical"', () => {
    buildOldDirectionTree();
    for (const plugin of PLUGINS_WITH_CLI) {
      const plan = planForPlugin(plugin, root);
      const wrongOrigin = plan.files.find((f) => f.origin !== 'root-canonical');
      expect(wrongOrigin).toBeUndefined();
    }
  });
});

describe('PR2 (b): commons-source planner — populated commons fixture', () => {
  test('full lib-consumers (griot, guild) receive commons/cli/lib/* mirror', () => {
    buildBothDirectionsTree();
    // loom is a PARTIAL consumer (LIB_MIRROR_ALLOWLIST) and may mirror zero
    // of a given fixture's lib files; its behavior is covered by the
    // "loom is a partial lib-consumer" block below.
    for (const plugin of ['griot', 'guild'] as const) {
      const plan = planForPlugin(plugin, root);
      const libSpecs = plan.files.filter(
        (f) =>
          f.origin === 'commons-canonical' &&
          f.source.startsWith('plugins/commons/cli/lib/'),
      );
      expect(libSpecs.length).toBeGreaterThan(0);
      // Destinations land under each consumer's own cli/lib/
      for (const spec of libSpecs) {
        expect(spec.destination.startsWith(`plugins/${plugin}/cli/lib/`)).toBe(true);
      }
    }
  });

  test('doc-consumers receive commons/docs/* mirror; lib-only-consumers do not get docs', () => {
    buildBothDirectionsTree();

    // ev is a doc-consumer but NOT a lib-consumer (it has no cli/).
    const evPlan = planForPlugin('ev', root);
    const evDocs = evPlan.files.filter(
      (f) => f.origin === 'commons-canonical' && f.source.startsWith('plugins/commons/docs/'),
    );
    expect(evDocs.length).toBeGreaterThan(0);
    const evLib = evPlan.files.filter(
      (f) => f.origin === 'commons-canonical' && f.source.startsWith('plugins/commons/cli/lib/'),
    );
    expect(evLib).toEqual([]);

    // ev's doc destinations land at plugins/ev/docs/*
    for (const spec of evDocs) {
      expect(spec.destination.startsWith('plugins/ev/docs/')).toBe(true);
    }
  });

  test('plugins NOT in either consumer set get zero commons-canonical specs', () => {
    buildBothDirectionsTree();
    // agent-loop-full is excluded from both lib and docs consumer sets.
    for (const plugin of ['agent-loop-full'] as const) {
      const plan = planForPlugin(plugin, root);
      const commonsSpecs = plan.files.filter((f) => f.origin === 'commons-canonical');
      expect(commonsSpecs).toEqual([]);
    }
  });

  test('commons plugin itself is never a sync DESTINATION for commons-canonical flows', () => {
    buildBothDirectionsTree();
    const commonsPlan = planForPlugin('commons', root);
    // commons IS the source; it should never receive synced files from itself.
    const commonsSelfSinks = commonsPlan.files.filter(
      (f) => f.origin === 'commons-canonical',
    );
    expect(commonsSelfSinks).toEqual([]);
  });

  test('end-to-end byte-equal: commons-canonical files mirror correctly', () => {
    buildBothDirectionsTree();
    applySync(root);
    // The fixture's helpers.ts and AGENT-CONVENTIONS.md should land at
    // each consumer's tree byte-equal to the commons source.
    expect(read('plugins/griot/cli/lib/helpers.ts')).toBe(
      read('plugins/commons/cli/lib/helpers.ts'),
    );
    expect(read('plugins/loom/docs/AGENT-CONVENTIONS.md')).toBe(
      read('plugins/commons/docs/AGENT-CONVENTIONS.md'),
    );
    expect(read('plugins/ev/docs/PANEL-COMPOSITION.md')).toBe(
      read('plugins/commons/docs/PANEL-COMPOSITION.md'),
    );
  });
});

describe('PR2 (c): conflict-detection guard — dual-write tripwire', () => {
  // Post-PR3: the natural cli/lib/-vs-cli/lib/ conflict that PR2's FIRES
  // test exercised is no longer possible — root-canonical no longer
  // claims cli/lib/ destinations. The guard still defends against any
  // FUTURE case where two directions overlap on a destination, but
  // exercising it requires either (a) a contrived synthetic input
  // (planner-bypass test), or (b) a regression that re-introduces an
  // overlapping claim. PR3 removes the FIRES test as moot and keeps
  // the disjoint test as a regression check against accidental
  // re-introduction of the cli/lib/-overlap claim.

  test('no conflict reported when destinations are disjoint (post-PR3 baseline)', () => {
    buildBothDirectionsTree();
    // Root-canonical claims cli/verbs/, cli/(plugin).ts, skills/, agents/.
    // Commons-canonical claims cli/lib/, docs/. Disjoint claim sets.
    const drift = detectDrift(root);
    const conflicts = drift.filter((d) => d.kind === 'conflict');
    expect(conflicts).toEqual([]);
  });

  // Coverage gap acknowledged: post-PR3 there is no natural-input test
  // of the guard's positive-fire path (the cli/lib/-overlap scenario PR2
  // exercised is structurally impossible now). Restoring positive
  // coverage requires either:
  //   (a) Extracting the conflict-detection block of detectDrift() into
  //       a separately-exported function and testing it with synthetic
  //       PluginPlan[] inputs, OR
  //   (b) A future direction change that re-introduces overlapping
  //       destinations (e.g. PR4 might shift cli/verbs/ such that root
  //       and commons could each claim it during a brief mixed window),
  //       at which point a natural-input FIRES test re-emerges.
  // Tracked for a future cleanup PR; the disjoint-baseline test above
  // catches regressions that re-introduce a spurious-fire bug.
});

describe('PR2: commons is leaf-source-only — substrate invariant', () => {
  test('COMMONS_CONSUMERS excludes commons from both lib and docs lists', () => {
    // commons IS the source, never a consumer. If a future edit
    // accidentally adds commons to either list, the planner would
    // attempt commons → commons sync (recursive smell).
    expect(COMMONS_CONSUMERS.lib).not.toContain('commons');
    expect(COMMONS_CONSUMERS.docs).not.toContain('commons');
  });

  test('planForPlugin("commons") emits zero specs against fixture trees', () => {
    // commons has no skills, no agents, no cli/<commons>.ts entry, and
    // no cli/verbs/commons/. Even with both source trees populated, it
    // plans nothing because it's the source, not a consumer.
    buildBothDirectionsTree();
    const plan = planForPlugin('commons', root);
    expect(plan.files).toEqual([]);
  });
});

describe('PR2: wall-clock budget — catches catastrophic O(n^2) regressions', () => {
  test('applySync against the minimal fixture runs in under 1000ms', () => {
    buildOldDirectionTree();
    const start = Date.now();
    applySync(root);
    const elapsed = Date.now() - start;
    // Loose budget — the actual fixture syncs ~15 small files in single-digit
    // milliseconds on a modern laptop. 1000ms catches accidents (e.g., a
    // glob that walks node_modules or projects/archive/) without flaking
    // on slow CI runners.
    expect(elapsed).toBeLessThan(1000);
  });
});

// ============================================================
// ADR-0005 — plugin-local orphan preservation
//
// An "orphan" is a file in a sync-managed subdir (cli/lib or docs)
// with no upstream commons source. Pre-ADR-0005 the sync deleted them
// unconditionally; that ate loom's own lib (manifest-toml.ts etc.).
// New policy: the default never deletes (fail-safe-preserve);
// --strict-orphan deletes UNMARKED orphans only; a top-of-file marker
// (`// sync-shared: plugin-local` for code, `<!-- sync-shared:
// plugin-local -->` for Markdown) exempts a file even under strict.
// Tests exercise behavior through applySync/detectDrift — the empty
// commons fixture makes every written consumer file an orphan, which
// isolates the orphan policy from the copy/divergence paths.
// ============================================================

describe('ADR-0005: applySync orphan preservation', () => {
  test('default sync preserves orphans (deletes nothing)', () => {
    write('plugins/griot/cli/lib/orphan.ts', 'export const ORPHAN = true;\n');

    const result = applySync(root);
    expect(result.removed).toBe(0);
    expect(result.preserved).toBeGreaterThanOrEqual(1);
    expect(read('plugins/griot/cli/lib/orphan.ts')).toContain('ORPHAN');
  });

  test('--strict-orphan removes an UNMARKED orphan', () => {
    write('plugins/griot/cli/lib/orphan.ts', 'export const ORPHAN = true;\n');

    const result = applySync(root, { strictOrphan: true });
    expect(result.removed).toBe(1);
    expect(() => read('plugins/griot/cli/lib/orphan.ts')).toThrow();
  });

  test('--strict-orphan PRESERVES a MARKED plugin-local code file', () => {
    write(
      'plugins/loom/cli/lib/manifest-toml.ts',
      '// sync-shared: plugin-local\nexport const LOCAL = true;\n',
    );

    const result = applySync(root, { strictOrphan: true });
    expect(result.removed).toBe(0);
    expect(result.preserved).toBeGreaterThanOrEqual(1);
    expect(read('plugins/loom/cli/lib/manifest-toml.ts')).toContain('LOCAL');
  });

  test('--strict-orphan PRESERVES a MARKED .md doc (HTML-comment form)', () => {
    write(
      'plugins/guild/docs/AGENT-CODEGEN.md',
      '<!-- sync-shared: plugin-local -->\n# Guild-local doc\n',
    );

    const result = applySync(root, { strictOrphan: true });
    expect(result.removed).toBe(0);
    expect(read('plugins/guild/docs/AGENT-CODEGEN.md')).toContain('Guild-local doc');
  });

  test('--strict-orphan removes the unmarked file but keeps a marked sibling', () => {
    write(
      'plugins/loom/cli/lib/marked.ts',
      '// sync-shared: plugin-local\nexport const A = 1;\n',
    );
    write('plugins/loom/cli/lib/unmarked.ts', 'export const B = 2;\n');

    const result = applySync(root, { strictOrphan: true });
    expect(result.removed).toBe(1);
    expect(result.preserved).toBe(1);
    expect(read('plugins/loom/cli/lib/marked.ts')).toContain('A = 1');
    expect(() => read('plugins/loom/cli/lib/unmarked.ts')).toThrow();
  });

  test('a marker BEYOND the head-scan window does not count (removed under strict)', () => {
    // Marker on a line past MARKER_SCAN_LINES is data, not a marker.
    const padding = Array.from({ length: 25 }, (_, i) => `// line ${i}`).join('\n');
    write(
      'plugins/loom/cli/lib/late-marker.ts',
      `${padding}\n// sync-shared: plugin-local\nexport const C = 3;\n`,
    );

    const result = applySync(root, { strictOrphan: true });
    expect(result.removed).toBe(1);
    expect(() => read('plugins/loom/cli/lib/late-marker.ts')).toThrow();
  });
});

describe('ADR-0005: detectDrift orphan reporting respects the marker', () => {
  test('an UNMARKED orphan is reported with the mark-or-remove remedy', () => {
    write('plugins/griot/cli/lib/orphan.ts', 'export const ORPHAN = true;\n');

    const drift = detectDrift(root);
    const orphan = drift.find(
      (d) => d.destination === 'plugins/griot/cli/lib/orphan.ts',
    );
    expect(orphan).toBeDefined();
    expect(orphan?.kind).toBe('orphan');
    expect(orphan?.source).toBeNull();
    // The remedy names BOTH options: mark it, or --strict-orphan.
    expect(orphan?.message).toContain('// sync-shared: plugin-local');
    expect(orphan?.message).toContain('--strict-orphan');
  });

  test('a MARKED plugin-local code file is NOT reported as drift', () => {
    write(
      'plugins/loom/cli/lib/manifest-toml.ts',
      '// sync-shared: plugin-local\nexport const LOCAL = true;\n',
    );

    const drift = detectDrift(root);
    const record = drift.find(
      (d) => d.destination === 'plugins/loom/cli/lib/manifest-toml.ts',
    );
    expect(record).toBeUndefined();
  });

  test('a MARKED .md doc is NOT reported as drift (HTML-comment form)', () => {
    write(
      'plugins/guild/docs/AGENT-CODEGEN.md',
      '<!-- sync-shared: plugin-local -->\n# doc\n',
    );

    const drift = detectDrift(root);
    const record = drift.find(
      (d) => d.destination === 'plugins/guild/docs/AGENT-CODEGEN.md',
    );
    expect(record).toBeUndefined();
  });

  test('an unmarked .md orphan suggests the HTML-comment marker form', () => {
    write('plugins/guild/docs/local.md', '# unmarked doc\n');

    const drift = detectDrift(root);
    const orphan = drift.find(
      (d) => d.destination === 'plugins/guild/docs/local.md',
    );
    expect(orphan?.kind).toBe('orphan');
    expect(orphan?.message).toContain('<!-- sync-shared: plugin-local -->');
  });
});

// ============================================================
// Phase 2 (D1) — loom is a PARTIAL lib-consumer (LIB_MIRROR_ALLOWLIST)
//
// loom forked ahead of commons (TOML manifest stack, PR-state-derived),
// so it mirrors only the stable shared utilities and OWNS the rest of its
// cli/lib as plugin-local. The planner excludes the non-allowlisted files
// from loom's plan; phase-1's marker preserves loom's forked files (now
// orphans) from the sweep. Fixture uses real allowlisted basenames
// (errors.ts/gh.ts are in loom's allowlist; manifest.ts is not).
// ============================================================

describe('Phase 2: loom is a partial lib-consumer (LIB_MIRROR_ALLOWLIST)', () => {
  function buildPartialFixture(): void {
    write('plugins/commons/cli/lib/errors.ts', 'export const E = "shared";\n'); // in loom's allowlist
    write('plugins/commons/cli/lib/gh.ts', 'export const G = "shared";\n'); // in loom's allowlist
    write('plugins/commons/cli/lib/manifest.ts', 'export const M = "shared";\n'); // NOT in loom's allowlist
  }

  test('loom mirrors only its allowlisted lib files', () => {
    buildPartialFixture();
    const libSources = planForPlugin('loom', root)
      .files.filter((f) => f.source.startsWith('plugins/commons/cli/lib/'))
      .map((f) => f.source);
    expect(libSources).toContain('plugins/commons/cli/lib/errors.ts');
    expect(libSources).toContain('plugins/commons/cli/lib/gh.ts');
    // manifest.ts is loom's own (consolidated) — not mirrored from commons.
    expect(libSources).not.toContain('plugins/commons/cli/lib/manifest.ts');
  });

  test('full consumers (griot, guild) still mirror ALL commons lib', () => {
    buildPartialFixture();
    for (const plugin of ['griot', 'guild'] as const) {
      const libSources = planForPlugin(plugin, root)
        .files.filter((f) => f.source.startsWith('plugins/commons/cli/lib/'))
        .map((f) => f.source);
      expect(libSources).toContain('plugins/commons/cli/lib/errors.ts');
      expect(libSources).toContain('plugins/commons/cli/lib/gh.ts');
      expect(libSources).toContain('plugins/commons/cli/lib/manifest.ts');
    }
  });

  test('a commons lib file loom does not mirror produces NO missing record for loom', () => {
    buildPartialFixture();
    applySync(root); // syncs errors.ts + gh.ts to loom; never manifest.ts
    const loomMissing = detectDrift(root).filter(
      (d) => d.plugin === 'loom' && d.kind === 'missing',
    );
    expect(loomMissing).toEqual([]);
  });

  test("loom's forked file (in commons, excluded from plan, marked) is neither divergent nor orphan", () => {
    buildPartialFixture();
    applySync(root);
    // commons has manifest.ts; loom excludes it and owns a divergent,
    // marked copy. It must be neither 'divergent' (not planned → not
    // compared) nor 'orphan' (marked → preserved).
    write(
      'plugins/loom/cli/lib/manifest.ts',
      '// sync-shared: plugin-local\nexport const M = "loom-forked";\n',
    );
    const loomManifest = detectDrift(root).filter(
      (d) => d.destination === 'plugins/loom/cli/lib/manifest.ts',
    );
    expect(loomManifest).toEqual([]);
  });
});
