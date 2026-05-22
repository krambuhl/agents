import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { LinearLoomError } from './errors.ts';

// Per-slug marker file (DESIGN.md § 4): projects/<slug>/linear.json
// records the binding between a loom-project slug and a Linear
// Project ID. Presence of `linear.json` (vs loom's `manifest.json`)
// signals which backend a slug uses. The marker is auth-free —
// it never carries credentials; auth lives in env or
// ~/.linear-loom/config.json per DESIGN.md § 9.

export interface LinearMarker {
  schema_version: 1;
  slug: string;
  linear_project_id: string;
  linear_project_name: string;
  label: string;
  created: string;
}

export interface MarkerIO {
  readFile?: (path: string) => string;
  writeFile?: (path: string, content: string) => void;
  exists?: (path: string) => boolean;
  mkdir?: (path: string, opts: { recursive: true }) => void;
}

export function markerPath(slug: string, projectsRoot: string): string {
  return join(projectsRoot, slug, 'linear.json');
}

export function labelForSlug(slug: string): string {
  return `loom-project:${slug}`;
}

export function readMarker(path: string, io: MarkerIO = {}): LinearMarker {
  const reader = io.readFile ?? defaultReadFile;
  let raw: string;
  try {
    raw = reader(path);
  } catch {
    throw new LinearLoomError(
      'marker-unreadable',
      `Cannot read linear-loom marker at ${path}. Either the slug is wrong or this project has not been created yet (try \`linear-loom project create <slug> --linear-project=<id>\`).`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new LinearLoomError(
      'marker-unparseable',
      `${path} is not valid JSON: ${(err as Error).message}`,
    );
  }
  return validateMarker(parsed, path);
}

export function writeMarker(
  path: string,
  marker: LinearMarker,
  io: MarkerIO = {},
): void {
  const mkdirFn = io.mkdir ?? defaultMkdir;
  const writeFn = io.writeFile ?? defaultWriteFile;
  mkdirFn(dirname(path), { recursive: true });
  writeFn(path, `${JSON.stringify(marker, null, 2)}\n`);
}

export function markerExists(path: string, io: MarkerIO = {}): boolean {
  const existsFn = io.exists ?? defaultExists;
  return existsFn(path);
}

function validateMarker(value: unknown, path: string): LinearMarker {
  if (typeof value !== 'object' || value === null) {
    throw new LinearLoomError(
      'marker-malformed',
      `${path} is not a JSON object.`,
    );
  }
  const v = value as Record<string, unknown>;
  if (v.schema_version !== 1) {
    throw new LinearLoomError(
      'marker-schema-version',
      `${path} has unsupported schema_version ${String(v.schema_version)}; expected 1.`,
    );
  }
  for (const field of ['slug', 'linear_project_id', 'linear_project_name', 'label', 'created'] as const) {
    if (typeof v[field] !== 'string' || (v[field] as string).trim() === '') {
      throw new LinearLoomError(
        'marker-malformed',
        `${path} is missing required string field "${field}".`,
      );
    }
  }
  return {
    schema_version: 1,
    slug: v.slug as string,
    linear_project_id: v.linear_project_id as string,
    linear_project_name: v.linear_project_name as string,
    label: v.label as string,
    created: v.created as string,
  };
}

function defaultReadFile(path: string): string {
  return readFileSync(path, 'utf8');
}

function defaultWriteFile(path: string, content: string): void {
  writeFileSync(path, content);
}

function defaultExists(path: string): boolean {
  return existsSync(path);
}

function defaultMkdir(path: string, opts: { recursive: true }): void {
  mkdirSync(path, opts);
}
