// Revision-log helper for `linear-loom revise-plan`.
//
// Inserts a new `- <date> — <rationale>` bullet into PLAN.md's
// `## Revision log` section. If the section doesn't exist yet, a
// fresh one gets appended at the end of the document. Newest-first
// ordering — re-runs always insert directly under the heading.
//
// Mirrors `plugins/loom/cli/verbs/loom/plan.ts:227-250`'s
// `appendRevisionLogEntry` (extracted into its own lib here because
// the linear-loom plan.ts diverges from loom's shape and a shared
// helper would have made both verbs uncomfortable). Drift watch: the
// loom-side helper is the canonical shape; if either side changes
// the entry format, the other should follow.

export function appendRevisionLogEntry(
  content: string,
  date: string,
  rationale: string,
): string {
  const entry = `- ${date} — ${rationale}`;
  const headingRe = /^## Revision log\s*$/m;
  const match = content.match(headingRe);
  if (match === null) {
    const sep = content.endsWith('\n') ? '\n' : '\n\n';
    return `${content.trimEnd()}${sep}\n## Revision log\n\n${entry}\n`;
  }
  const headingStart = match.index ?? 0;
  const headingEnd = headingStart + (match[0]?.length ?? 0);
  const before = content.slice(0, headingEnd);
  const after = content.slice(headingEnd);
  const afterTrimmed = after.replace(/^\n+/, '');
  return `${before}\n\n${entry}\n\n${afterTrimmed}`;
}
