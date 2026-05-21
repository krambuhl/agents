#!/usr/bin/env node
/**
 * sync-shared — generates per-plugin `plugins/<plugin>/cli/` trees
 * from the top-level `cli/` source of truth.
 *
 * Registered as Category 4 `generated-from-upstream` per
 * `projects/CONVENTIONS.md`. The output is deterministically derived
 * from upstream input; concurrent runs against unchanged input
 * converge.
 *
 * Modes:
 *   - default (`sync`): copy upstream → per-plugin (writes files)
 *   - `--check`: read-only drift detection; exit 1 if any per-plugin
 *     file is missing OR diverges from its upstream source
 *
 * Sync rules:
 *   - Plugin <name> gets: `cli/lib/**` + `cli/verbs/<name>/**` +
 *     `cli/<name>.ts`
 *   - Test files (`*.test.ts`) are NOT copied — runtime code only.
 *   - Test fixtures (`cli/fixtures/`) are NOT copied.
 *   - Repo-tier tests at `cli/*.test.ts` are NOT copied either.
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

interface SyncSpec {
  /** Source path relative to repo root. */
  source: string;
  /** Destination path relative to repo root. */
  destination: string;
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

  // 1. Shared lib — every CLI-shipping plugin gets all of cli/lib/*.
  //    Skipped for skill-only plugins (no cli/ tree on disk for them).
  if (PLUGINS_WITH_CLI.includes(plugin as (typeof PLUGINS_WITH_CLI)[number])) {
    for (const rel of walkFiles(join(repoRoot, 'cli', 'lib'), repoRoot)) {
      files.push({
        source: rel,
        destination: join('plugins', plugin, rel),
      });
    }
  }

  // 2. Per-plugin verbs subtree (CLI-shipping plugins only)
  const verbsDir = join('cli', 'verbs', plugin);
  for (const rel of walkFiles(join(repoRoot, verbsDir), repoRoot)) {
    files.push({
      source: rel,
      destination: join('plugins', plugin, rel),
    });
  }

  // 3. Plugin entry point (CLI-shipping plugins only)
  const entry = join('cli', `${plugin}.ts`);
  if (existsSync(join(repoRoot, entry))) {
    files.push({
      source: entry,
      destination: join('plugins', plugin, entry),
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
      });
    }
  }

  return { plugin, files };
}

export function planAll(repoRoot = REPO_ROOT): PluginPlan[] {
  return PLUGINS.map((p) => planForPlugin(p, repoRoot));
}

interface DriftRecord {
  plugin: PluginName;
  kind: 'missing' | 'divergent' | 'orphan';
  source: string | null;
  destination: string;
  message: string;
}

export function detectDrift(repoRoot = REPO_ROOT): DriftRecord[] {
  const records: DriftRecord[] = [];
  const plans = planAll(repoRoot);

  for (const plan of plans) {
    const expectedDestinations = new Set(plan.files.map((f) => f.destination));

    // Forward check: every source must have a matching destination.
    for (const { source, destination } of plan.files) {
      const sourcePath = join(repoRoot, source);
      const destPath = join(repoRoot, destination);

      if (!existsSync(destPath)) {
        records.push({
          plugin: plan.plugin,
          kind: 'missing',
          source,
          destination,
          message: `${plan.plugin}: missing generated file ${destination} (expected to mirror ${source}). Run \`node scripts/sync-shared.ts\` to resync.`,
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
          message: `${plan.plugin}: ${destination} diverges from upstream ${source}. Run \`node scripts/sync-shared.ts\` to resync.`,
        });
      }
    }

    // Reverse check: every file under the SYNC-MANAGED subdirs of
    // plugins/<plugin>/ must have a matching source. Catches stale
    // files left after an upstream rename / delete. The .claude-plugin/
    // and bin/ subdirs are hand-authored substrate (not sync-managed)
    // and are intentionally excluded.
    for (const syncManagedDir of ['cli', 'skills', 'agents']) {
      const root = join(repoRoot, 'plugins', plan.plugin, syncManagedDir);
      if (!existsSync(root)) continue;
      for (const rel of walkFiles(root, repoRoot)) {
        if (!expectedDestinations.has(rel)) {
          records.push({
            plugin: plan.plugin,
            kind: 'orphan',
            source: null,
            destination: rel,
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
    // no longer have an upstream source). The .claude-plugin/ and
    // bin/ subdirs are hand-authored substrate and intentionally
    // excluded from orphan sweeping.
    for (const syncManagedDir of ['cli', 'skills', 'agents']) {
      const root = join(repoRoot, 'plugins', plan.plugin, syncManagedDir);
      if (!existsSync(root)) continue;
      for (const rel of walkFiles(root, repoRoot)) {
        if (!expectedDestinations.has(rel)) {
          rmSync(join(repoRoot, rel), { force: true });
          removed += 1;
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
