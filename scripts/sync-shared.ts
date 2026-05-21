#!/usr/bin/env node
/**
 * sync-shared — syncs canonical content into consumer plugin trees.
 *
 * Two source-of-truth directions, distinguished by SyncSpec.origin:
 *
 *   1. `root-canonical` — historically claimed cli/lib, cli/verbs/,
 *      cli/(plugin-name).ts, skills/(plugin-prefix), and
 *      agents/(plugin-prefix).md at the repo root. PR3 cut cli/lib
 *      over to commons-canonical; PR4 dissolved the rest. As of PR4,
 *      root-canonical claims NOTHING — the SyncOrigin variant is
 *      kept in the type system so existing DriftRecord/SyncSpec
 *      shapes survive the transition window. PR9 deletes the root
 *      directories outright (they're currently inert duplicates).
 *
 *   2. `commons-canonical` — content authored inside `plugins/commons/`
 *      (cli/lib, docs) mirrored into each consumer plugin's tree per
 *      the `COMMONS_CONSUMERS` table. Lib goes to PLUGINS_WITH_CLI;
 *      docs go to every plugin that cites docs/X.md in its skill bodies.
 *      Post-PR4, this is the ONLY direction emitting specs.
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
  'agent-loop-full',
] as const;
export type PluginName = (typeof PLUGINS)[number];

/** Subset that ships a CLI (lib + verbs + entrypoint). Kept as a
 *  named export because tests still differentiate plugins-with-cli
 *  from skill-only plugins (e.g. ev/agent-loop-full). */
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
 *  `commons` and `agent-loop-full` are excluded from both. Commons IS
 *  the source, not a consumer. agent-loop-full is zero-content.
 */
export const COMMONS_CONSUMERS = {
  lib: ['griot', 'guild', 'loom'] as ReadonlyArray<PluginName>,
  docs: ['griot', 'guild', 'loom', 'ev'] as ReadonlyArray<PluginName>,
} as const;

// PR4 removed the PluginContentRule type and PLUGIN_CONTENT_RULES
// table. Pre-PR4 they filtered root skills/<dir>/ and root agents/<file>
// into per-plugin trees; post-PR4 each plugin owns its skills/agents
// authoritatively (no root-canonical claims), so the rules table has
// no consumer. If a future sync direction needs per-plugin filtering,
// reconstitute the shape near its use.

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

export function planForPlugin(plugin: PluginName, repoRoot = REPO_ROOT): PluginPlan {
  const files: SyncSpec[] = [];

  // === root-canonical direction (FULLY DISSOLVED in PR4) ===
  //
  // Pre-PR3, root-canonical claimed: cli/lib/, cli/verbs/<plugin>/,
  // cli/(plugin).ts, skills/(plugin-prefix), agents/(plugin-prefix).md.
  //
  // PR3 cut cli/lib/ over to commons-canonical (and root cli/lib/ stays
  // as an inert duplicate until PR9). PR4 dissolves the remaining root
  // claims — each plugin's own `plugins/<plugin>/cli/verbs/<plugin>/`,
  // `plugins/<plugin>/cli/<plugin>.ts`, `plugins/<plugin>/skills/`, and
  // `plugins/<plugin>/agents/` subtrees become AUTHORITATIVE; they are
  // no longer mirrored from root.
  //
  // Root `cli/verbs/`, `cli/<plugin>.ts`, `skills/`, and `agents/` stay
  // as inert duplicates during the PR4→PR9 window; PR9 deletes them.

  // === commons-canonical direction ===
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
    // Post-PR4, only the commons-canonical direction writes into
    // consumer plugin trees, so only its destination subtrees are
    // sync-managed:
    //   - plugins/<consumer>/cli/lib/   (commons-canonical lib mirror)
    //   - plugins/<consumer>/docs/      (commons-canonical docs mirror)
    //
    // Excluded from orphan-sweep:
    // - plugins/<plugin>/skills/, plugins/<plugin>/agents/,
    //   plugins/<plugin>/cli/verbs/, plugins/<plugin>/cli/<plugin>.ts
    //   are AUTHORITATIVE plugin content as of PR4 (no upstream source;
    //   orphan-sweeping would delete the very files the plugin owns).
    // - `.claude-plugin/` and `bin/` are hand-authored substrate.
    // - The `commons` plugin's tree is itself the substrate-source
    //   (never a destination).
    if (plan.plugin === 'commons') continue;

    for (const syncManagedSubdir of [join('cli', 'lib'), 'docs']) {
      const root = join(repoRoot, 'plugins', plan.plugin, syncManagedSubdir);
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

    // Remove orphans first (files in the SYNC-MANAGED subdirs that no
    // longer have an upstream source). Post-PR4, sync-managed subdirs
    // are exactly the commons-canonical destinations: `cli/lib/` and
    // `docs/`. Everything else in the plugin tree (`cli/verbs/`,
    // `cli/<plugin>.ts`, `skills/`, `agents/`, `.claude-plugin/`,
    // `bin/`) is plugin-authoritative and never orphan-swept. The
    // `commons` plugin itself is never orphan-swept either (it's the
    // substrate source, not a destination).
    if (plan.plugin !== 'commons') {
      for (const syncManagedSubdir of [join('cli', 'lib'), 'docs']) {
        const root = join(repoRoot, 'plugins', plan.plugin, syncManagedSubdir);
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
