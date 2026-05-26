import { JellyError } from './errors.ts';

// Slug helpers shared by the jelly-loom verbs. A project slug is
// `YYYY-MM-DD-<kebab-topic>` (e.g. 2026-05-25-jelly). Mirrors loom's
// createSlug; jelly-loom declares its own to stay standalone.

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Matches an already-formed slug: date prefix + kebab name. Used to
// decide whether a `<slug-or-topic>` argument is already a slug (use
// as-is) or a topic to slugify.
export const SLUG_RE = /^\d{4}-\d{2}-\d{2}-[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export function createSlug(topic: string, today: string): string {
  if (!DATE_RE.test(today)) {
    throw new JellyError(
      'invalid-date',
      `today '${today}' does not match YYYY-MM-DD`,
    );
  }
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length < 2) {
    throw new JellyError(
      'invalid-topic',
      `topic '${topic}' slugifies to '${slug}' (must be at least 2 chars)`,
    );
  }
  return `${today}-${slug}`;
}
