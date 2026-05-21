#!/usr/bin/env node
/**
 * sync-shared — syncs canonical content into consumer plugin trees.
 *
 * Two source-of-truth directions, distinguished by SyncSpec.origin:
 *
 *   1. `root-canonical` — content authored at the repo root, narrowing
 *      over time. As of PR3 of the repo-compartmentalize project, root-
 *      canonical claims: cli/verbs/, cli/(plugin-name).ts,
 *      skills/(plugin-prefix), and agents/(plugin-prefix).md.
 *      (cli/lib was moved to commons-canonical in PR3; root cli/lib
 *      stays as an inert duplicate until PR9 deletion.)
 *
 *   2. `commons-canonical` — content authored inside `plugins/commons/`
 *      (cli/lib, docs) mirrored into each consumer plugin's tree per
 *      the `COMMONS_CONSUMERS` table. Lib goes to PLUGINS_WITH_CLI;
 *      docs go to every plugin that cites docs/X.md in its skill bodies.
 *
 * PR4 dissolves root-canonical for skills/agents/per-plugin CLI. PR9
 * deletes root cli/, skills/, agents/, docs/ entirely. After that
 * sequence completes, commons-canonical is the only direction.
 *
 * Registered as Category 4 `generated-from-upstream` per
 * `projects/CONVENTIONS.md`. The output is deterministically derived
 * from upstream input; concurrent runs against unchanged input
 * converge.
 *
 * Modes:
 *   - default (`sync`): copy upstream → per-plugin (writes files)
 *   - `--check`: read-only drift detection; exit 1 on missing /
 *     divergent / orphan / conflicting destinations
 *
 * Invariants:
 *   - Test files (`*.test.ts`) are NOT copied — runtime code only.
 *   - Test fixtures (`cli/fixtures/`) are NOT copied.
 *   - Every sync destination has EXACTLY ONE upstream source. If a
 *     destination is claimed by both root-canonical and commons-canonical
 *     for the same file, detectDrift returns a `conflict` record and
 *     --check exits non-zero (the dual-write tripwire that survives
 *     Phase 1's transition window).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');

/** All plugins the sync script handles. Order is sync-iteration order.
 *  `commons` listed first because it's the substrate-source for the
 *  forthcoming commons→consumer sync direction (PR2 lands the planner
 *  extension; PR3 starts moving content in). At PR1 it's a content-empty
 *  placeholder. */
export const PLUGINS = [
  'commons',
  'griot',
  'guild',
  'loom',
  'ev',
  'review-skill',
  'agent-loop-full',
] as const;
export type PluginName = (typeof PLUGINS)[number];

/** Subset that ships a CLI (lib + verbs + entrypoint). Kept as a
 *  named export because tests still differentiate plugins-with-cli
 *  from skill-only plugins (e.g. ev/review-skill/agent-loop-full). */
export const PLUGINS_WITH_CLI = ['griot', 'guild', 'loom'] as const;

/** Per-flow consumer rules for the `commons-canonical` sync direction.
 *
 *  The doc-consumer set and lib-consumer set are intentionally separate
 *  arrays — even when they happen to overlap, the shape accommodates
 *  divergence. Today:
 *   - `lib`: which plugins receive a synced copy of `plugins/commons/cli/lib/`.
 *     Matches PLUGINS_WITH_CLI — only CLI-shipping plugins have an
 *     `cli/lib/` destination to receive into.
 *   - `docs`: which plugins receive a synced copy of `plugins/commons/docs/`.
 *     Wider — includes `ev` (skill-only, no cli/ tree) because ev's skill
 *     bodies cite `docs/X.md` paths that must resolve at install-time.
 *
 *  `commons`, `review-skill`, and `agent-loop-full` are excluded from
 *  both. Commons IS the source, not a consumer. review-skill folds into
 *  commons in a future PR. agent-loop-full is zero-content.
 */
export const COMMONS_CONSUMERS = {
  lib: ['griot', 'guild', 'loom'] as ReadonlyArray<PluginName>,
  docs: ['griot', 'guild', 'loom', 'ev'] as ReadonlyArray<PluginName>,
} as const;

/** Per-plugin content rules. Defines which top-level skills/<dir>/
 *  and agents/<file>.md belong to each plugin. The CLI subset is
 *  implicit: cli/verbs/<plugin>/ + cli/<plugin>.ts (handled below). */
interface PluginContentRule {
  /** Skill directories whose names start with one of these prefixes
   *  belong to this plugin. e.g. 'griot-' matches 'griot-load'. */
  skillPrefixes: ReadonlyArray<string>;
  /** Skill directories with these EXACT names belong to this plugin.
   *  Use for the unprefixed catch-alls (currently just 'review-skill'). */
  skillExacts: ReadonlyArray<string>;
  /** Agent files whose names start with one of these prefixes belong
   *  to this plugin. e.g. 'whiteboard-' matches 'whiteboard-a11y.md'. */
  agentPrefixes: ReadonlyArray<string>;
}

const PLUGIN_CONTENT_RULES: Record<PluginName, PluginContentRule> = {
  commons: {
    // Substrate-source plugin. Content moves in via PR3 (cli/lib/ + docs/)
    // and PR5 (grill-me + find-skills); at PR1 it's a content-empty
    // placeholder so the marketplace cascade has a target. Skill+agent
    // ownership prefixes will populate as content lands.
    skillPrefixes: [],
    skillExacts: [],
    agentPrefixes: [],
  },
  griot: {
    skillPrefixes: ['griot-'],
    skillExacts: [],
    agentPrefixes: ['griot-'],
  },
  guild: {
    skillPrefixes: ['guild-'],
    skillExacts: [],
    agentPrefixes: ['whiteboard-', 'evaluator-', 'generator-'],
  },
  loom: {
    skillPrefixes: ['loom-'],
    skillExacts: [],
    agentPrefixes: [],
  },
  ev: {
    skillPrefixes: ['ev-'],
    skillExacts: [],
    agentPrefixes: [],
  },
  'review-skill': {
    skillPrefixes: [],
    skillExacts: ['review-skill'],
    agentPrefixes: [],
  },
  'agent-loop-full': {
    // Zero-content meta-bundle — cascade-installs the other 5 via
    // marketplace dependencies. Owns no skills + no agents.
    skillPrefixes: [],
    skillExacts: [],
    agentPrefixes: [],
  },
};

/** Which direction this spec was generated from.
 *  - `root-canonical`: source is at the repo root (cli/, skills/, agents/).
 *  - `commons-canonical`: source is inside plugins/commons/ (cli/lib/, docs/).
 *  Used for drift attribution + conflict detection during Phase 1's
 *  dual-direction window. */
export type SyncOrigin = 'root-canonical' | 'commons-canonical';

interface SyncSpec {
  /** Source path relative to repo root. */
  source: string;
  /** Destination path relative to repo root. */
  destination: string;
  /** Which sync direction generated this spec. */
  origin: SyncOrigin;
}

interface PluginPlan {
  plugin: PluginName;
  files: SyncSpec[];
}

/** True for files that should NOT be copied (tests, fixtures). */
function isExcluded(relativePath: string): boolean {
  if (relativePath.endsWith('.test.ts')) return true;
  if (relativePath.includes('/fixtures/')) return true;
  return false;
}

/** Walk a directory and return all file paths (recursive). */
function walkFiles(root: string, repoRoot: string): string[] {
  const out: string[] = [];
  if (!existsSync(root)) return out;
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkFiles(full, repoRoot));
    } else if (stat.isFile()) {
      const rel = relative(repoRoot, full);
      if (!isExcluded(rel)) {
        out.push(rel);
      }
    }
  }
  return out;
}

/** Does this skill-dir name belong to the plugin? */
function skillBelongsToPlugin(skillName: string, rule: PluginContentRule): boolean {
  if (rule.skillExacts.includes(skillName)) return true;
  return rule.skillPrefixes.some((p) => skillName.startsWith(p));
}

/** Does this agent file name belong to the plugin? */
function agentBelongsToPlugin(agentName: string, rule: PluginContentRule): boolean {
  return rule.agentPrefixes.some((p) => agentName.startsWith(p));
}

export function planForPlugin(plugin: PluginName, repoRoot = REPO_ROOT): PluginPlan {
  const files: SyncSpec[] = [];
  const rule = PLUGIN_CONTENT_RULES[plugin];

  // === root-canonical direction (legacy; dissolves at PR3-PR4) ===

  // 1. Shared lib — historically root-canonical, cut over to
  //    commons-canonical in PR3. The lib content now lives at
  //    plugins/commons/cli/lib/ and reaches consumer plugins via the
  //    commons-canonical branch below. Root cli/lib/ is kept as an
  //    inert duplicate during the PR3→PR4 window so that root
  //    cli/verbs/<plugin>/'s `../../lib/X.ts` imports continue to
  //    resolve. PR9 deletes root cli/lib/ outright; PR4 dissolves
  //    root cli/verbs/, removing the dependency on root cli/lib/ at
  //    edit time.

  // 2. Per-plugin verbs subtree (CLI-shipping plugins only)
  const verbsDir = join('cli', 'verbs', plugin);
  for (const rel of walkFiles(join(repoRoot, verbsDir), repoRoot)) {
    files.push({
      source: rel,
      destination: join('plugins', plugin, rel),
      origin: 'root-canonical',
    });
  }

  // 3. Plugin entry point (CLI-shipping plugins only)
  const entry = join('cli', `${plugin}.ts`);
  if (existsSync(join(repoRoot, entry))) {
    files.push({
      source: entry,
      destination: join('plugins', plugin, entry),
      origin: 'root-canonical',
    });
  }

  // 4. Skills — walk top-level skills/<dir>/, include all files under
  //    any dir whose name belongs to this plugin per PLUGIN_CONTENT_RULES.
  const skillsRoot = join(repoRoot, 'skills');
  if (existsSync(skillsRoot)) {
    for (const skillName of readdirSync(skillsRoot)) {
      const skillDir = join(skillsRoot, skillName);
      if (!statSync(skillDir).isDirectory()) continue;
      if (!skillBelongsToPlugin(skillName, rule)) continue;
      for (const rel of walkFiles(skillDir, repoRoot)) {
        files.push({
          source: rel,
          destination: join('plugins', plugin, rel),
          origin: 'root-canonical',
        });
      }
    }
  }

  // 5. Agents — walk top-level agents/, include each file whose name
  //    belongs to this plugin per PLUGIN_CONTENT_RULES.
  const agentsRoot = join(repoRoot, 'agents');
  if (existsSync(agentsRoot)) {
    for (const agentEntry of readdirSync(agentsRoot)) {
      const agentPath = join(agentsRoot, agentEntry);
      if (!statSync(agentPath).isFile()) continue;
      if (!agentBelongsToPlugin(agentEntry, rule)) continue;
      const rel = relative(repoRoot, agentPath);
      if (isExcluded(rel)) continue;
      files.push({
        source: rel,
        destination: join('plugins', plugin, rel),
        origin: 'root-canonical',
      });
    }
  }

  // === commons-canonical direction (forthcoming; no-op while commons is empty) ===
  //
  // The substrate-source plugin (`commons`) is never a consumer of these
  // flows — it's the source. Skipping consumer logic for commons itself
  // keeps the loop simple and prevents the planner from accidentally
  // proposing `plugins/commons/cli/lib/foo.ts → plugins/commons/cli/lib/foo.ts`.
  if (plugin !== 'commons') {
    // 6. Lib flow: plugins/commons/cli/lib/** → plugins/<consumer>/cli/lib/**
    //    Only lib-consumers receive (PLUGINS_WITH_CLI today).
    if (COMMONS_CONSUMERS.lib.includes(plugin)) {
      const commonsLibDir = join('plugins', 'commons', 'cli', 'lib');
      for (const rel of walkFiles(join(repoRoot, commonsLibDir), repoRoot)) {
        // Translate the destination from plugins/commons/cli/lib/<f>
        // to plugins/<consumer>/cli/lib/<f>.
        const fileTail = relative(commonsLibDir, rel);
        files.push({
          source: rel,
          destination: join('plugins', plugin, 'cli', 'lib', fileTail),
          origin: 'commons-canonical',
        });
      }
    }

    // 7. Docs flow: plugins/commons/docs/** → plugins/<consumer>/docs/**
    //    Doc-consumers include skill-only plugins like `ev` that cite
    //    docs/X.md in their skill bodies but have no cli/ tree.
    if (COMMONS_CONSUMERS.docs.includes(plugin)) {
      const commonsDocsDir = join('plugins', 'commons', 'docs');
      for (const rel of walkFiles(join(repoRoot, commonsDocsDir), repoRoot)) {
        const fileTail = relative(commonsDocsDir, rel);
        files.push({
          source: rel,
          destination: join('plugins', plugin, 'docs', fileTail),
          origin: 'commons-canonical',
        });
      }
    }
  }

  return { plugin, files };
}

export function planAll(repoRoot = REPO_ROOT): PluginPlan[] {
  return PLUGINS.map((p) => planForPlugin(p, repoRoot));
}

interface DriftRecord {
  plugin: PluginName;
  kind: 'missing' | 'divergent' | 'orphan' | 'conflict';
  source: string | null;
  destination: string;
  message: string;
  /** Which sync direction this drift came from. For `conflict` records
   *  this is the origin of one of the colliding sources (the message
   *  names both). For `orphan` records this is `null` — orphans have
   *  no upstream source by definition. */
  origin: SyncOrigin | null;
}

export function detectDrift(repoRoot = REPO_ROOT): DriftRecord[] {
  const records: DriftRecord[] = [];
  const plans = planAll(repoRoot);

  // === Conflict-detection guard (per skeptic whiteboard finding) ===
  //
  // Build a map of destination → list of (plugin, source, origin) claimants.
  // If any destination has more than one claimant, the dual-write window's
  // invariant ("every destination has exactly one upstream source") is
  // violated. Emit a conflict record before the per-plan checks run, so
  // CI fails loudly on the highest-impact drift class.
  const claimants = new Map<string, Array<{ plugin: PluginName; source: string; origin: SyncOrigin }>>();
  for (const plan of plans) {
    for (const { source, destination, origin } of plan.files) {
      const existing = claimants.get(destination) ?? [];
      existing.push({ plugin: plan.plugin, source, origin });
      claimants.set(destination, existing);
    }
  }
  for (const [destination, claims] of claimants) {
    if (claims.length > 1) {
      const sources = claims.map((c) => `${c.source} (${c.origin})`).join(' AND ');
      records.push({
        plugin: claims[0].plugin,
        kind: 'conflict',
        source: claims.map((c) => c.source).join(', '),
        destination,
        origin: claims[0].origin,
        message: `${claims[0].plugin}: destination ${destination} is claimed by multiple upstream sources (${sources}). This violates the one-source-per-destination invariant. Resolve by removing one of the conflicting sources.`,
      });
    }
  }

  for (const plan of plans) {
    const expectedDestinations = new Set(plan.files.map((f) => f.destination));

    // Forward check: every source must have a matching destination.
    for (const { source, destination, origin } of plan.files) {
      const sourcePath = join(repoRoot, source);
      const destPath = join(repoRoot, destination);

      if (!existsSync(destPath)) {
        records.push({
          plugin: plan.plugin,
          kind: 'missing',
          source,
          destination,
          origin,
          message: `${plan.plugin}: missing generated file ${destination} (expected to mirror ${source}, ${origin}). Run \`node scripts/sync-shared.ts\` to resync.`,
        });
        continue;
      }

      const sourceBytes = readFileSync(sourcePath);
      const destBytes = readFileSync(destPath);
      if (!sourceBytes.equals(destBytes)) {
        records.push({
          plugin: plan.plugin,
          kind: 'divergent',
          source,
          destination,
          origin,
          message: `${plan.plugin}: ${destination} diverges from upstream ${source} (${origin}). Run \`node scripts/sync-shared.ts\` to resync.`,
        });
      }
    }

    // Reverse check: every file under the SYNC-MANAGED subdirs of
    // plugins/<plugin>/ must have a matching source. Catches stale
    // files left after an upstream rename / delete.
    //
    // - `.claude-plugin/` and `bin/` are hand-authored substrate
    //   (intentionally excluded; never sync-managed).
    // - `commons` is the substrate-source plugin — its entire tree is
    //   hand-authored (or future-content). We never orphan-sweep
    //   commons; doing so would delete the very files that commons is
    //   meant to source out to other plugins.
    if (plan.plugin === 'commons') continue;

    for (const syncManagedDir of ['cli', 'skills', 'agents', 'docs']) {
      const root = join(repoRoot, 'plugins', plan.plugin, syncManagedDir);
      if (!existsSync(root)) continue;
      for (const rel of walkFiles(root, repoRoot)) {
        if (!expectedDestinations.has(rel)) {
          records.push({
            plugin: plan.plugin,
            kind: 'orphan',
            source: null,
            destination: rel,
            origin: null,
            message: `${plan.plugin}: orphan generated file ${rel} has no upstream source. Run \`node scripts/sync-shared.ts\` to resync (the script removes orphans).`,
          });
        }
      }
    }
  }

  return records;
}

export function applySync(repoRoot = REPO_ROOT): { copied: number; removed: number } {
  const plans = planAll(repoRoot);
  let copied = 0;
  let removed = 0;

  for (const plan of plans) {
    const expectedDestinations = new Set(plan.files.map((f) => f.destination));

    // Remove orphans first (files in the SYNC-MANAGED subdirs that
    // no longer have an upstream source). Excluded:
    // - `.claude-plugin/` and `bin/` are hand-authored substrate.
    // - `commons` is the substrate-SOURCE plugin: its entire tree is
    //   hand-authored content that other plugins consume; never
    //   orphan-sweep here or applySync would delete the very files
    //   it's meant to source out.
    if (plan.plugin !== 'commons') {
      for (const syncManagedDir of ['cli', 'skills', 'agents', 'docs']) {
        const root = join(repoRoot, 'plugins', plan.plugin, syncManagedDir);
        if (!existsSync(root)) continue;
        for (const rel of walkFiles(root, repoRoot)) {
          if (!expectedDestinations.has(rel)) {
            rmSync(join(repoRoot, rel), { force: true });
            removed += 1;
          }
        }
      }
    }

    // Copy every planned source → destination.
    for (const { source, destination } of plan.files) {
      const destPath = join(repoRoot, destination);
      const destDir = dirname(destPath);
      mkdirSync(destDir, { recursive: true });
      copyFileSync(join(repoRoot, source), destPath);
      copied += 1;
    }
  }

  return { copied, removed };
}

function main(argv: string[]): number {
  const checkMode = argv.includes('--check');

  if (checkMode) {
    const drift = detectDrift();
    if (drift.length === 0) {
      const planned = planAll();
      const withFiles = planned.filter((p) => p.files.length > 0).length;
      process.stdout.write(
        `sync-shared --check: ok (${withFiles} plugin${withFiles === 1 ? '' : 's'} synced)\n`,
      );
      return 0;
    }
    for (const record of drift) {
      process.stderr.write(`sync-shared-error: ${record.message}\n`);
    }
    process.stderr.write(`sync-shared --check: drift detected (${drift.length} record${drift.length === 1 ? '' : 's'}); see above\n`);
    return 1;
  }

  const { copied, removed } = applySync();
  process.stdout.write(`sync-shared: ${copied} file${copied === 1 ? '' : 's'} synced`);
  if (removed > 0) {
    process.stdout.write(`, ${removed} orphan${removed === 1 ? '' : 's'} removed`);
  }
  process.stdout.write('\n');
  return 0;
}

const isEntry = (() => {
  try {
    const entry = process.argv[1] ? resolve(process.argv[1]) : '';
    return entry === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isEntry) {
  process.exit(main(process.argv.slice(2)));
}
