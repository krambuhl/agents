// sync-shared: plugin-local
// Distributed project store, Phase 6: the decentralized work inventory.
//
// The inventory lives IN THE CODE — work sites are annotated with a marker
// (built from TOKEN below to avoid self-matching this source) of the form
// `<TOKEN>:<dict-id> [key=value ...]`, where <dict-id> names an entry in a
// small shared "runbook" (migration dictionary). This lib parses annotations,
// scans a tree for them, and loads the dictionary, so migration skills can
// find + resolve sites with NO central inventory (decisions 0003/0004/0005).

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseToml } from './toml.ts';

// The marker token. Assembled from a constant so this module's own source +
// doc comments don't register as scannable annotations.
export const TOKEN = 'MIGRATE';

// `<TOKEN>:<dict-id>` followed by optional `key=value` params.
const MARKER = new RegExp(`${TOKEN}:([a-z0-9][a-z0-9-]*)((?:\\s+[A-Za-z0-9_]+=[^\\s]+)*)`);

export type SiteAnnotation = {
  dictId: string;
  params: Record<string, string>;
};

export type Site = SiteAnnotation & {
  file: string; // path relative to the scan root
  line: number; // 1-indexed
  raw: string; // the matched marker text
};

export function parseAnnotation(text: string): SiteAnnotation | null {
  const m = text.match(MARKER);
  if (m === null) return null;
  const dictId = m[1] as string;
  const params: Record<string, string> = {};
  const tail = (m[2] ?? '').trim();
  for (const pair of tail.split(/\s+/).filter((s) => s.length > 0)) {
    const eq = pair.indexOf('=');
    if (eq > 0) params[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return { dictId, params };
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage']);
const TEXT_EXT =
  /\.(ts|tsx|js|jsx|mjs|cjs|md|json|toml|ya?ml|css|scss|html|sh|py|go|rb|rs|java)$/;

// Walk `root` and collect every annotated site. Skips dot-directories and the
// SKIP_DIRS set; scans only text-ish files.
export function scanSites(root: string): Site[] {
  const out: Site[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (entry.isFile() && TEXT_EXT.test(entry.name)) {
        scanFile(full, root, out);
      }
    }
  };
  walk(root);
  return out;
}

function scanFile(file: string, root: string, out: Site[]): void {
  let content: string;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  const rel = file.startsWith(root)
    ? file.slice(root.length).replace(/^[/\\]/, '')
    : file;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ann = parseAnnotation(lines[i] as string);
    if (ann === null) continue;
    const m = (lines[i] as string).match(MARKER);
    out.push({ ...ann, file: rel, line: i + 1, raw: m === null ? '' : m[0] });
  }
}

// The runbook / migration dictionary: <dict-id> -> entry. One small shared
// TOML file, read-mostly:
//   [<dict-id>]
//   description = "..."
//   runbook = "the transform instructions"
export type DictionaryEntry = {
  id: string;
  description?: string;
  runbook?: string;
  [key: string]: unknown;
};

export type MigrationDictionary = Map<string, DictionaryEntry>;

export function readDictionary(path: string): MigrationDictionary {
  const table = parseToml(readFileSync(path, 'utf8'));
  const dict: MigrationDictionary = new Map();
  for (const [id, value] of Object.entries(table)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      dict.set(id, { id, ...(value as Record<string, unknown>) });
    }
  }
  return dict;
}

export type ResolvedSite = Site & {
  entry: DictionaryEntry | null;
  known: boolean;
};

// Attach each site's dictionary entry; flag sites whose dict-id is unknown so
// a migration run can fail loud rather than silently skip.
export function resolveSites(
  sites: Site[],
  dict: MigrationDictionary,
): ResolvedSite[] {
  return sites.map((s) => {
    const entry = dict.get(s.dictId) ?? null;
    return { ...s, entry, known: entry !== null };
  });
}
