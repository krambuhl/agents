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

export const PLUGINS_WITH_CLI = ['griot', 'guild', 'loom'] as const;
export type PluginName = (typeof PLUGINS_WITH_CLI)[number];

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

export function planForPlugin(plugin: PluginName, repoRoot = REPO_ROOT): PluginPlan {
  const files: SyncSpec[] = [];

  // 1. Shared lib — every CLI-shipping plugin gets all of cli/lib/*
  for (const rel of walkFiles(join(repoRoot, 'cli', 'lib'), repoRoot)) {
    files.push({
      source: rel,
      destination: join('plugins', plugin, rel),
    });
  }

  // 2. Per-plugin verbs subtree
  const verbsDir = join('cli', 'verbs', plugin);
  for (const rel of walkFiles(join(repoRoot, verbsDir), repoRoot)) {
    files.push({
      source: rel,
      destination: join('plugins', plugin, rel),
    });
  }

  // 3. Plugin entry point
  const entry = join('cli', `${plugin}.ts`);
  if (existsSync(join(repoRoot, entry))) {
    files.push({
      source: entry,
      destination: join('plugins', plugin, entry),
    });
  }

  return { plugin, files };
}

export function planAll(repoRoot = REPO_ROOT): PluginPlan[] {
  return PLUGINS_WITH_CLI.map((p) => planForPlugin(p, repoRoot));
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

    // Reverse check: every file under plugins/<plugin>/cli/ must
    // have a matching source. Catches stale files left after an
    // upstream rename / delete.
    const pluginCliRoot = join(repoRoot, 'plugins', plan.plugin, 'cli');
    if (existsSync(pluginCliRoot)) {
      for (const rel of walkFiles(pluginCliRoot, repoRoot)) {
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
    const pluginCliRoot = join(repoRoot, 'plugins', plan.plugin, 'cli');

    // Remove orphans first (files in the generated tree that no
    // longer have an upstream source).
    if (existsSync(pluginCliRoot)) {
      for (const rel of walkFiles(pluginCliRoot, repoRoot)) {
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
      process.stdout.write(`sync-shared --check: ok (3 plugins synced)\n`);
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
