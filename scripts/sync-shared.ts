#!/usr/bin/env node
/**
 * sync-shared — mirrors the canonical cross-cutting docs into consumer
 * plugin trees.
 *
 * Single source of truth: the repo-root `docs/` directory holds the
 * cross-cutting convention docs (AGENT-CONVENTIONS, LOOM-CONVENTIONS,
 * PANEL-COMPOSITION, SUBSTRATE-COMPOSITIONS). A skill that cites
 * `docs/X.md` reads it from its OWN plugin directory at install time —
 * plugins are self-contained — so each consuming plugin needs a physical
 * copy shipped inside it. This script is the fan-out: `docs/**` →
 * `plugins/<consumer>/docs/**` for every plugin in DOC_CONSUMERS.
 *
 * History: earlier revisions also synced a shared CLI lib out of
 * `plugins/commons/cli/lib/` and supported a now-dissolved root-canonical
 * direction for skills/agents/verbs. Both are gone — commons is now
 * skills-only, loom owns its former-shared lib outright, and each plugin's
 * skills/agents/cli are authoritative in its own tree. Docs are the only
 * thing left that legitimately needs duplication, so they're the only
 * thing this script touches.
 *
 * Modes:
 *   - default (`sync`): copy `docs/**` → each consumer's `docs/` (writes
 *     files). Fail-safe-preserve (ADR-0005): orphans — sync-managed files
 *     with no upstream source — are NEVER deleted in this mode.
 *   - `--strict-orphan` (with `sync`): additionally delete UNMARKED
 *     orphans. Files carrying the plugin-local marker survive even here.
 *   - `--only=<glob>`: restrict the sync to sources matching the glob.
 *     Copy-only — never deletes orphans (the bare-run overreach guard).
 *   - `--check`: read-only drift detection; exit 1 on missing / divergent
 *     / unmarked-orphan destinations.
 *
 * Plugin-local marker (ADR-0005):
 *   A consumer plugin's `docs/` tree may legitimately hold its OWN doc
 *   with no repo-root counterpart (e.g. guild's `docs/AGENT-CODEGEN.md`).
 *   A top-of-file marker — `<!-- sync-shared: plugin-local -->` for
 *   Markdown, `// sync-shared: plugin-local` for code — declares such a
 *   file intentional so the orphan-sweep preserves it. Unmarked orphans
 *   stay ambiguous: the operator either marks them (plugin-local) or
 *   removes them (`--strict-orphan`).
 *
 * Invariants:
 *   - Test files (`*.test.ts`) and fixtures (`/fixtures/`) are NOT copied.
 *   - Every sync destination has EXACTLY ONE upstream source (guaranteed
 *     structurally: one source dir, one destination per consumer).
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

/** All plugins the sync script iterates. Order is sync-iteration order. */
export const PLUGINS = [
  'commons',
  'griot',
  'guild',
  'loom',
  'ev',
  'agent-loop-full',
] as const;
export type PluginName = (typeof PLUGINS)[number];

/** Plugins that receive a synced copy of the repo-root `docs/` tree —
 *  those whose skill bodies cite `docs/X.md` and therefore need the file
 *  shipped inside their own plugin directory at install time. Today: `ev`
 *  (loop skills) and `loom` (plan/research/archive skills). griot and
 *  guild ship no skills that cite the shared convention docs, so they are
 *  not consumers. */
export const DOC_CONSUMERS: ReadonlyArray<PluginName> = ['ev', 'loom'];

/** The canonical docs source, repo-root-relative. */
const DOCS_SOURCE_DIR = 'docs';

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

/** Marker that exempts a consumer-tree file from the orphan-sweep
 *  (ADR-0005). `.md` uses the HTML-comment form; everything else
 *  (`.ts`, `.js`) uses the line-comment form. */
const PLUGIN_LOCAL_MARKER_TS = '// sync-shared: plugin-local';
const PLUGIN_LOCAL_MARKER_MD = '<!-- sync-shared: plugin-local -->';

/** The marker form a given path should carry, keyed by extension. */
function pluginLocalMarkerFor(path: string): string {
  return path.endsWith('.md') ? PLUGIN_LOCAL_MARKER_MD : PLUGIN_LOCAL_MARKER_TS;
}

/** Leading lines scanned for the plugin-local marker. The marker is a
 *  top-of-file convention; scanning only the head avoids matching the
 *  literal string where it appears as DATA lower in a file (this
 *  script's own source, a test fixture, or a doc quoting the
 *  convention). */
const MARKER_SCAN_LINES = 20;

/** True if the file at `absPath` carries the plugin-local marker in its
 *  head region. A missing file is not plugin-local. */
function isPluginLocal(absPath: string): boolean {
  if (!existsSync(absPath)) return false;
  const head = readFileSync(absPath, 'utf8')
    .split('\n', MARKER_SCAN_LINES)
    .join('\n');
  return head.includes(pluginLocalMarkerFor(absPath));
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

  // Docs flow: docs/** → plugins/<consumer>/docs/**. Consumers are the
  // plugins whose skill bodies cite docs/X.md (DOC_CONSUMERS).
  if (DOC_CONSUMERS.includes(plugin)) {
    for (const rel of walkFiles(join(repoRoot, DOCS_SOURCE_DIR), repoRoot)) {
      const fileTail = relative(DOCS_SOURCE_DIR, rel);
      files.push({
        source: rel,
        destination: join('plugins', plugin, 'docs', fileTail),
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

/** The only sync-managed subtree in a consumer plugin: `docs/`. Files
 *  here without an upstream source are orphans (unless marked
 *  plugin-local). Everything else in a plugin tree — skills/, agents/,
 *  cli/, bin/, .claude-plugin/ — is authoritative and never swept. */
const SYNC_MANAGED_SUBDIR = 'docs';

export function detectDrift(repoRoot = REPO_ROOT): DriftRecord[] {
  const records: DriftRecord[] = [];
  const plans = planAll(repoRoot);

  for (const plan of plans) {
    const expectedDestinations = new Set(plan.files.map((f) => f.destination));

    // Forward check: every planned source must have a matching destination.
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

    // Reverse check: every file under a plugin's sync-managed `docs/`
    // subtree must have a matching source. Catches stale copies left after
    // an upstream rename/delete, or a doc shipped into a plugin that is no
    // longer a consumer. A marked plugin-local file (e.g. guild's
    // AGENT-CODEGEN.md) has no upstream BY DESIGN and is skipped.
    for (const rel of walkFiles(
      join(repoRoot, 'plugins', plan.plugin, SYNC_MANAGED_SUBDIR),
      repoRoot,
    )) {
      if (expectedDestinations.has(rel)) continue;
      if (isPluginLocal(join(repoRoot, rel))) continue;
      records.push({
        plugin: plan.plugin,
        kind: 'orphan',
        source: null,
        destination: rel,
        message: `${plan.plugin}: orphan ${rel} has no upstream source. Either mark it plugin-local (add \`${pluginLocalMarkerFor(rel)}\` near the top of the file) or remove it (\`node scripts/sync-shared.ts --strict-orphan\`).`,
      });
    }
  }

  return records;
}

/** Minimal glob → RegExp for --only: `*` matches within a path segment,
 *  `**` across segments, matched against the repo-relative source path. */
function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      re += '.*';
      i += 1;
    } else if (c === '*') {
      re += '[^/]*';
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += `\\${c}`;
    } else {
      re += c;
    }
  }
  return new RegExp(`^${re}$`);
}

type ScopeOpts = { only?: string };

/** Whether a spec is in scope this run. --only keeps specs whose SOURCE
 *  matches the glob — the canonical file the operator edited, whose
 *  propagation to consumers is what they want synced. */
function specInScope(spec: SyncSpec, opts: ScopeOpts): boolean {
  if (opts.only !== undefined && !globToRegExp(opts.only).test(spec.source)) {
    return false;
  }
  return true;
}

export function applySync(
  repoRoot = REPO_ROOT,
  opts: { strictOrphan?: boolean; only?: string } = {},
): { copied: number; removed: number; preserved: number } {
  const scoped = opts.only !== undefined;
  const plans = planAll(repoRoot).map((plan) => ({
    plugin: plan.plugin,
    files: plan.files.filter((f) => specInScope(f, opts)),
  }));
  let copied = 0;
  let removed = 0;
  let preserved = 0;

  for (const plan of plans) {
    const expectedDestinations = new Set(plan.files.map((f) => f.destination));

    // Orphan handling. ADR-0005 fail-safe-preserve: the DEFAULT never
    // deletes — orphans are preserved. `--strict-orphan` opts back into
    // deleting UNMARKED orphans; a marked plugin-local file survives even
    // then. A scoped run (--only) is copy-only and never deletes: files
    // outside the scope are intentionally unmanaged this run, and treating
    // them as orphans is exactly the bare-run overreach the flag prevents.
    if (!scoped) {
      for (const rel of walkFiles(
        join(repoRoot, 'plugins', plan.plugin, SYNC_MANAGED_SUBDIR),
        repoRoot,
      )) {
        if (expectedDestinations.has(rel)) continue;
        if (!opts.strictOrphan || isPluginLocal(join(repoRoot, rel))) {
          preserved += 1;
          continue;
        }
        rmSync(join(repoRoot, rel), { force: true });
        removed += 1;
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

  return { copied, removed, preserved };
}

function main(argv: string[]): number {
  const checkMode = argv.includes('--check');
  const strictOrphan = argv.includes('--strict-orphan');
  const onlyArg = argv.find((a) => a.startsWith('--only='));
  const only = onlyArg ? onlyArg.slice('--only='.length) : undefined;

  // --only scopes the SYNC (write) path only. --check stays a full-tree
  // drift gate by design — a narrow sync is a convenience, but the
  // pre-commit / CI check must still verify the whole tree is consistent.
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

  const { copied, removed, preserved } = applySync(REPO_ROOT, {
    strictOrphan,
    only,
  });
  process.stdout.write(`sync-shared: ${copied} file${copied === 1 ? '' : 's'} synced`);
  if (only !== undefined) {
    process.stdout.write(` (scoped: --only=${only}; orphans untouched)`);
  }
  if (removed > 0) {
    process.stdout.write(`, ${removed} orphan${removed === 1 ? '' : 's'} removed`);
  }
  if (preserved > 0) {
    process.stdout.write(
      strictOrphan
        ? `, ${preserved} plugin-local file${preserved === 1 ? '' : 's'} preserved`
        : `, ${preserved} orphan${preserved === 1 ? '' : 's'} preserved (run --check to review, or --strict-orphan to remove unmarked)`,
    );
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
