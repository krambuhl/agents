// One-shot, throwaway converter: per-file JSON loom state → single
// manifest.toml (Phase 2 cutover). DELETE this script in Phase 7.
//
// Reads a project's legacy stores (manifest.json + config.json +
// events.jsonl + checkins/**/NN.json + sessions/*.json), folds them into a
// ManifestToml, writes manifest.toml via the new serializer, and removes the
// old files. It does NOT touch retros/ or checkins/<branch>/responses/ —
// those stay file-per-record (outside the six manifest sections).
//
// This is not a shipped verb: loom holds a no-backwards-compat posture, so
// the conversion lives here in scripts/ (run once, by hand, via real node)
// and never inside the CLI. The marker flip (project.ts LOOM_MARKER ->
// manifest.toml) lands in the same commit as running this, so the repo is
// never half-migrated.
//
// Usage:
//   node scripts/convert-loom-state-to-toml.ts                 # all projects
//   node scripts/convert-loom-state-to-toml.ts <project-dir>   # one project

import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  manifestPath,
  writeManifest,
} from '../plugins/loom/cli/lib/manifest-toml.ts';
import type {
  Checkin,
  Config,
  Event,
  ManifestToml,
  Session,
} from '../plugins/loom/cli/lib/types.ts';

const SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*[a-z0-9]$/;
const CHECKIN_FILE_RE = /^\d+\.json$/;
const SESSION_FILE_RE = /^\d{4}-\d{2}-\d{2}-[a-z]\.json$/;

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function readEventsJsonl(path: string): Event[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Event);
}

// Walk checkins/ collecting the NN.json record files (ignoring any
// responses/ subdir, which stays file-per-record).
function collectCheckins(checkinsRoot: string): Checkin[] {
  if (!existsSync(checkinsRoot)) return [];
  const out: Checkin[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'responses') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (CHECKIN_FILE_RE.test(entry)) {
        out.push(readJson<Checkin>(full));
      }
    }
  };
  walk(checkinsRoot);
  return out;
}

function collectSessions(sessionsRoot: string): Session[] {
  if (!existsSync(sessionsRoot)) return [];
  return readdirSync(sessionsRoot)
    .filter((entry) => SESSION_FILE_RE.test(entry))
    .map((entry) => readJson<Session>(join(sessionsRoot, entry)));
}

// The old manifest.json carried the meta scalars + phases at top level.
type LegacyManifest = {
  schema_version: 1;
  title: string;
  slug: string;
  started: string;
  status: 'active' | 'archived';
  current_branch: string | null;
  latest_checkin: string | null;
  strategy: string;
  // Legacy phases may carry a `pr` field (a pre-(d) manifest.json stored PR
  // state on the phase). It is stripped during conversion — see below.
  phases: Array<ManifestToml['phases'][number] & { pr?: unknown }>;
};

export function convertProject(projectDir: string): {
  checkins: number;
  events: number;
  sessions: number;
} {
  const legacyManifest = join(projectDir, 'manifest.json');
  if (!existsSync(legacyManifest)) {
    throw new Error(`no manifest.json at ${projectDir} (nothing to convert)`);
  }
  const m = readJson<LegacyManifest>(legacyManifest);
  const config = readJson<Config>(join(projectDir, 'config.json'));
  const events = readEventsJsonl(join(projectDir, 'events.jsonl'));
  const checkins = collectCheckins(join(projectDir, 'checkins'));
  const sessions = collectSessions(join(projectDir, 'sessions'));

  const state: ManifestToml = {
    meta: {
      schema_version: 1,
      title: m.title,
      slug: m.slug,
      started: m.started,
      status: m.status,
      current_branch: m.current_branch,
      latest_checkin: m.latest_checkin,
      strategy: m.strategy,
    },
    config,
    // Drop any legacy `pr` field: PR state is derived on demand via
    // `loom pr discover` (option (d)), never stored in the manifest. A
    // pre-(d) manifest.json may carry it; the converted manifest.toml must
    // not, or the round-trip write-verify (which no longer parses `pr`) fails.
    phases: m.phases.map((legacyPhase) => {
      const phase = { ...legacyPhase };
      delete phase.pr;
      return phase;
    }),
    events,
    checkins,
    sessions,
    // Legacy projects predate the [[revisions]] section; they start empty.
    revisions: [],
  };

  writeManifest(manifestPath(projectDir), state);

  // Remove the old stores. Leave retros/ and checkins/<branch>/responses/
  // (file-per-record, out of scope). The session dir folds in wholesale; the
  // checkin record files are removed individually so any responses survive.
  rmSync(legacyManifest);
  rmSync(join(projectDir, 'config.json'), { force: true });
  rmSync(join(projectDir, 'events.jsonl'), { force: true });
  rmSync(join(projectDir, 'sessions'), { recursive: true, force: true });
  removeCheckinRecords(join(projectDir, 'checkins'));

  return { checkins: checkins.length, events: events.length, sessions: sessions.length };
}

// Delete only the NN.json checkin record files (preserving responses/).
function removeCheckinRecords(checkinsRoot: string): void {
  if (!existsSync(checkinsRoot)) return;
  const hasResponses = (dir: string): boolean =>
    readdirSync(dir).some(
      (e) => e === 'responses' && statSync(join(dir, e)).isDirectory(),
    );
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (entry === 'responses') continue;
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (CHECKIN_FILE_RE.test(entry)) {
        rmSync(full);
      }
    }
  };
  walk(checkinsRoot);
  // If nothing kept a responses/ subdir alive anywhere, drop the empty tree.
  const stillNeeded = (dir: string): boolean => {
    if (hasResponses(dir)) return true;
    return readdirSync(dir).some((e) => {
      const full = join(dir, e);
      return statSync(full).isDirectory() && stillNeeded(full);
    });
  };
  if (!stillNeeded(checkinsRoot)) {
    rmSync(checkinsRoot, { recursive: true, force: true });
  }
}

// Scan projects/ + projects/archive/ for legacy (manifest.json) projects.
function findLegacyProjects(projectsRoot: string): string[] {
  const dirs: string[] = [];
  const scan = (root: string): void => {
    if (!existsSync(root)) return;
    for (const entry of readdirSync(root)) {
      if (!SLUG_RE.test(entry)) continue;
      const full = join(root, entry);
      if (statSync(full).isDirectory() && existsSync(join(full, 'manifest.json'))) {
        dirs.push(full);
      }
    }
  };
  scan(projectsRoot);
  scan(join(projectsRoot, 'archive'));
  return dirs;
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, '..');
  const arg = process.argv[2];
  const targets =
    arg !== undefined
      ? [arg]
      : findLegacyProjects(join(repoRoot, 'projects'));

  if (targets.length === 0) {
    console.log('convert-loom-state: no legacy (manifest.json) projects found');
    return;
  }
  // Convert what conforms; skip (leaving untouched) any project whose state
  // doesn't fit loom's schema — e.g. a fork project with checkins that
  // predate loom's verdict field. convertProject's verify-before-rename
  // throws BEFORE it removes anything, so a skipped project is intact.
  const skipped: string[] = [];
  for (const dir of targets) {
    try {
      const counts = convertProject(dir);
      console.log(
        `converted ${dir} -> manifest.toml ` +
          `(${counts.events} events, ${counts.checkins} checkins, ${counts.sessions} sessions)`,
      );
    } catch (err: unknown) {
      skipped.push(dir);
      console.warn(`SKIPPED ${dir}: ${(err as Error).message}`);
    }
  }
  if (skipped.length > 0) {
    console.warn(
      `\n${skipped.length} project(s) skipped (left on manifest.json): ${skipped.join(', ')}`,
    );
  }
}

// Run only when executed directly (node scripts/convert-loom-state-to-toml.ts),
// never on import — convertProject is imported by the test, and an
// unguarded main() would convert every real project the moment it loaded.
if (process.argv[1] !== undefined && process.argv[1].endsWith('convert-loom-state-to-toml.ts')) {
  main();
}
