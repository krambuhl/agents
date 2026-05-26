import { existsSync, readdirSync, statSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { JellyError } from './errors.ts';

// Slug helpers shared by the jelly-loom verbs. A project slug is
// `YYYY-MM-DD-<kebab-topic>` (e.g. 2026-05-25-jelly). Mirrors loom's
// createSlug; jelly-loom declares its own to stay standalone.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Matches an already-formed slug: date prefix + kebab name. Used to
// decide whether a `<slug-or-topic>` argument is already a slug (use
// as-is) or a topic to slugify.
export const SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*[a-z0-9]$/;

// Lowercase + collapse non-alphanumerics to single hyphens + trim
// leading/trailing hyphens. The shared slug-from-text transform used by
// createSlug (project slugs) and the adr verb (ADR filename slugs).
export function kebabCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createSlug(topic: string, today: string): string {
  if (!DATE_RE.test(today)) {
    throw new JellyError(
      'invalid-date',
      `today '${today}' does not match YYYY-MM-DD`,
    );
  }
  const slug = kebabCase(topic);
  if (slug.length < 2) {
    throw new JellyError(
      'invalid-topic',
      `topic '${topic}' slugifies to '${slug}' (must be at least 2 chars)`,
    );
  }
  return `${today}-${slug}`;
}

// A date-less project reference: a kebab name with no date prefix
// (e.g. "jelly"). Resolved by suffix-matching against project dirs.
const DATELESS_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

function listProjectSlugs(projectsRoot: string): string[] {
  if (!existsSync(projectsRoot)) return [];
  return readdirSync(projectsRoot).filter((name: string) => {
    try {
      return statSync(join(projectsRoot, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

// Resolves a <slug-or-dateless-or-path> reference to an existing
// project directory. Leaner than loom's resolveProjectByPlan: jelly
// has no archive concept yet, so only the active projectsRoot is
// scanned. Mirrors loom's resolution order: path → full slug →
// date-less suffix match.
export function resolveProject(slugOrPath: string, projectsRoot: string): string {
  // Absolute or relative path.
  if (slugOrPath.startsWith('/') || slugOrPath.startsWith('.')) {
    const abs = isAbsolute(slugOrPath) ? slugOrPath : resolve(slugOrPath);
    if (!existsSync(abs)) {
      throw new JellyError('project-not-found', `no project at path ${abs}`);
    }
    return abs;
  }

  // Full slug → direct existence check.
  if (SLUG_RE.test(slugOrPath)) {
    const dir = join(projectsRoot, slugOrPath);
    if (!existsSync(dir)) {
      throw new JellyError('project-not-found', `no project with slug ${slugOrPath}`);
    }
    return dir;
  }

  if (!DATELESS_RE.test(slugOrPath)) {
    throw new JellyError(
      'project-not-found',
      `'${slugOrPath}' is not a slug, date-less name, or path`,
    );
  }

  // Date-less suffix match across active projects.
  const matches = listProjectSlugs(projectsRoot).filter((s) => s.endsWith(`-${slugOrPath}`));
  if (matches.length === 1) {
    return join(projectsRoot, matches[0] as string);
  }
  if (matches.length > 1) {
    throw new JellyError(
      'slug-ambiguous',
      `'${slugOrPath}' matches multiple projects`,
      matches,
    );
  }
  throw new JellyError('project-not-found', `no project matching '${slugOrPath}'`);
}
