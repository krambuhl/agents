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
  // Skills — one per plugin under its prefix
  write('skills/griot-load/SKILL.md', '---\nname: griot-load\n---\nfixture\n');
  write('skills/guild-validate/SKILL.md', '---\nname: guild-validate\n---\nfixture\n');
  write('skills/loom-plan/SKILL.md', '---\nname: loom-plan\n---\nfixture\n');
  write('skills/ev-run/SKILL.md', '---\nname: ev-run\n---\nfixture\n');
  write('skills/review-skill/SKILL.md', '---\nname: review-skill\n---\nfixture\n');
  // Agents — one per agent-namespace
  write('agents/griot-judge.md', '---\nname: griot-judge\n---\nfixture\n');
  write('agents/whiteboard-skeptic.md', '---\nname: whiteboard-skeptic\n---\nfixture\n');
  write('agents/evaluator-contract-fit.md', '---\nname: evaluator-contract-fit\n---\nfixture\n');
  write('agents/generator-base.md', '---\nname: generator-base\n---\nfixture\n');
  // Excluded: test files + fixtures (should NOT be copied)
  write('cli/lib/manifest.test.ts', 'test stub');
  write('cli/verbs/griot/use.test.ts', 'test stub');
  write('cli/fixtures/manifest-basic.json', '{}');
  write('cli/griot.test.ts', 'test stub');
}

/**
 * PR2 fixture: commons-canonical source content only.
 * Populates `plugins/commons/cli/lib/` and `plugins/commons/docs/` with
 * a small file each. No root-canonical content. Defends the new
 * commons→consumer direction in isolation.
 */
function buildCommonsDirectionTree(): void {
  write('plugins/commons/cli/lib/helpers.ts', 'export const HELPERS = "commons-fixture";\n');
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
  test('griot plan covers cli/lib + cli/verbs/griot + cli/griot.ts + griot-* skills + griot-* agents', () => {
    buildOldDirectionTree();
    const plan = planForPlugin('griot', root);

    const sources = plan.files.map((f) => f.source).sort();
    expect(sources).toEqual(
      [
        'agents/griot-judge.md',
        'cli/griot.ts',
        'cli/lib/events.ts',
        'cli/lib/manifest.ts',
        'cli/verbs/griot/use.ts',
        'skills/griot-load/SKILL.md',
      ].sort(),
    );

    // All destinations are namespaced under the plugin's source dir.
    for (const { destination } of plan.files) {
      expect(destination.startsWith('plugins/griot/')).toBe(true);
    }
  });

  test('plan excludes test files and fixtures', () => {
    buildOldDirectionTree();
    const plan = planForPlugin('griot', root);
    const sources = plan.files.map((f) => f.source);
    expect(sources).not.toContain('cli/griot.test.ts');
    expect(sources).not.toContain('cli/lib/manifest.test.ts');
    expect(sources).not.toContain('cli/verbs/griot/use.test.ts');
    expect(sources.some((s) => s.includes('/fixtures/'))).toBe(false);
  });

  test('plan filters per-plugin verbs subtree (griot plan does not include guild or loom verbs)', () => {
    buildOldDirectionTree();
    const plan = planForPlugin('griot', root);
    const sources = plan.files.map((f) => f.source);
    expect(sources.some((s) => s.startsWith('cli/verbs/guild/'))).toBe(false);
    expect(sources.some((s) => s.startsWith('cli/verbs/loom/'))).toBe(false);
  });

  test('every plugin gets the same shared lib subset', () => {
    buildOldDirectionTree();
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
    buildOldDirectionTree();
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
    buildOldDirectionTree();
    applySync(root);
    const drift = detectDrift(root);
    expect(drift).toEqual([]);
  });

  test('test files do NOT land in the generated tree', () => {
    buildOldDirectionTree();
    applySync(root);
    // The excluded files exist upstream but must not be copied.
    expect(() => read('plugins/griot/cli/griot.test.ts')).toThrow();
    expect(() => read('plugins/griot/cli/lib/manifest.test.ts')).toThrow();
    expect(() => read('plugins/griot/cli/verbs/griot/use.test.ts')).toThrow();
  });

  test('plugin entries land at plugins/<name>/cli/<name>.ts (matches W6 shim resolution path)', () => {
    buildOldDirectionTree();
    applySync(root);
    expect(read('plugins/griot/cli/griot.ts')).toBe(read('cli/griot.ts'));
    expect(read('plugins/guild/cli/guild.ts')).toBe(read('cli/guild.ts'));
    expect(read('plugins/loom/cli/loom.ts')).toBe(read('cli/loom.ts'));
  });
});

describe('V10 (c): drift detection — false-green failure-mode tripwire', () => {
  test('mutated per-plugin file post-sync is reported as divergent', () => {
    buildOldDirectionTree();
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
    buildOldDirectionTree();
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
    buildOldDirectionTree();
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
    expect(record?.message).toMatch(/sync-shared\.ts/);
  });
});

describe('skills + agents: per-plugin sync (gap caught by V6 smoke test)', () => {
  test('skills are filtered by plugin prefix', () => {
    buildOldDirectionTree();
    const griotPlan = planForPlugin('griot', root);
    const guildPlan = planForPlugin('guild', root);
    const loomPlan = planForPlugin('loom', root);

    const griotSkills = griotPlan.files
      .map((f) => f.source)
      .filter((s) => s.startsWith('skills/'));
    const guildSkills = guildPlan.files
      .map((f) => f.source)
      .filter((s) => s.startsWith('skills/'));
    const loomSkills = loomPlan.files
      .map((f) => f.source)
      .filter((s) => s.startsWith('skills/'));

    expect(griotSkills).toEqual(['skills/griot-load/SKILL.md']);
    expect(guildSkills).toEqual(['skills/guild-validate/SKILL.md']);
    expect(loomSkills).toEqual(['skills/loom-plan/SKILL.md']);
  });

  test('skill-only plugins (ev, review-skill) get their skills with no CLI', () => {
    buildOldDirectionTree();
    const evPlan = planForPlugin('ev', root);
    const reviewPlan = planForPlugin('review-skill', root);

    // ev gets its skill, no cli/, no agents/
    expect(evPlan.files.map((f) => f.source)).toEqual(['skills/ev-run/SKILL.md']);
    // review-skill matches via exact name (not prefix) since it has no '-' suffix.
    expect(reviewPlan.files.map((f) => f.source)).toEqual([
      'skills/review-skill/SKILL.md',
    ]);
  });

  test('agent-loop-full meta-bundle plans zero files', () => {
    buildOldDirectionTree();
    const plan = planForPlugin('agent-loop-full', root);
    expect(plan.files).toEqual([]);
  });

  test('agents are namespaced: griot-* → griot; whiteboard-/evaluator-/generator-* → guild', () => {
    buildOldDirectionTree();
    const griotAgents = planForPlugin('griot', root)
      .files.map((f) => f.source)
      .filter((s) => s.startsWith('agents/'));
    const guildAgents = planForPlugin('guild', root)
      .files.map((f) => f.source)
      .filter((s) => s.startsWith('agents/'));

    expect(griotAgents).toEqual(['agents/griot-judge.md']);
    // guild gets all three agent-namespace prefixes.
    expect([...guildAgents].sort()).toEqual([
      'agents/evaluator-contract-fit.md',
      'agents/generator-base.md',
      'agents/whiteboard-skeptic.md',
    ]);
  });

  test('end-to-end byte-equal: synced skill SKILL.md matches its source', () => {
    buildOldDirectionTree();
    applySync(root);

    expect(read('plugins/griot/skills/griot-load/SKILL.md')).toBe(
      read('skills/griot-load/SKILL.md'),
    );
    expect(read('plugins/guild/agents/whiteboard-skeptic.md')).toBe(
      read('agents/whiteboard-skeptic.md'),
    );
    expect(read('plugins/ev/skills/ev-run/SKILL.md')).toBe(
      read('skills/ev-run/SKILL.md'),
    );
  });

  test('drift detection: mutated skill SKILL.md flagged as divergent', () => {
    buildOldDirectionTree();
    applySync(root);

    writeFileSync(
      join(root, 'plugins/griot/skills/griot-load/SKILL.md'),
      'tampered\n',
      'utf8',
    );

    const drift = detectDrift(root);
    const griotSkill = drift.find(
      (d) => d.destination === 'plugins/griot/skills/griot-load/SKILL.md',
    );
    expect(griotSkill?.kind).toBe('divergent');
    expect(griotSkill?.source).toBe('skills/griot-load/SKILL.md');
  });

  test('drift detection: orphan agent file in plugin tree flagged', () => {
    buildOldDirectionTree();
    applySync(root);

    write('plugins/guild/agents/orphan.md', '---\nname: orphan\n---\nstale\n');

    const drift = detectDrift(root);
    const orphan = drift.find(
      (d) => d.destination === 'plugins/guild/agents/orphan.md',
    );
    expect(orphan?.kind).toBe('orphan');
  });
});

// Trailing artifact from the original drift-message test; kept for
// the structural close-out of the original describe-block above.
describe('V10 (c) closure: drift-message format coverage (already asserted above)', () => {
  test('drift message format also names the script name', () => {
    buildOldDirectionTree();
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
  test('lib-consumers (griot/guild/loom) receive commons/cli/lib/* mirror', () => {
    buildBothDirectionsTree();
    for (const plugin of COMMONS_CONSUMERS.lib) {
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
    // review-skill and agent-loop-full are excluded from both lib and docs consumer sets.
    for (const plugin of ['review-skill', 'agent-loop-full'] as const) {
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
  test('a destination claimed by both root-canonical AND commons-canonical fires a conflict record', () => {
    buildBothDirectionsTree();
    // Force a conflict: commons declares `plugins/commons/cli/lib/manifest.ts`
    // as a source for plugins/griot/cli/lib/manifest.ts. Root canonical
    // already claims the same destination via cli/lib/manifest.ts. Two
    // sources, one destination = conflict.
    write('plugins/commons/cli/lib/manifest.ts', 'export const MANIFEST = "commons-version";\n');

    const drift = detectDrift(root);
    const conflict = drift.find(
      (d) =>
        d.kind === 'conflict' &&
        d.destination === 'plugins/griot/cli/lib/manifest.ts',
    );
    expect(conflict).toBeDefined();
    expect(conflict?.message).toMatch(/claimed by multiple upstream sources/);
    expect(conflict?.message).toMatch(/root-canonical/);
    expect(conflict?.message).toMatch(/commons-canonical/);
  });

  test('no conflict reported when destinations are disjoint', () => {
    buildBothDirectionsTree();
    // Fixture's commons content (helpers.ts, docs/*) doesn't collide with
    // root-canonical's content (manifest.ts, events.ts). No conflicts.
    const drift = detectDrift(root);
    const conflicts = drift.filter((d) => d.kind === 'conflict');
    expect(conflicts).toEqual([]);
  });
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
