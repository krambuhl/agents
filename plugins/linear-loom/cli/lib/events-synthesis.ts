import { parsePhaseFromMilestoneName } from './phase-naming.ts';

// Synthesize loom-compat events from Linear's native audit data.
//
// DESIGN.md § 8 drops `events.jsonl` as a substrate concept in
// linear-loom — Linear's native timestamps on Project / Milestone /
// Comment / Issue records ARE the event trail. The `events read`
// verb (Phase 6 U4) queries those records and synthesizes a flat,
// timestamp-sorted, loom-compat event array so ev-linear's loop body
// can consume the same shape it would have read from loom's
// events.jsonl.
//
// v1 coverage (operator-chosen for U4): the load-bearing trio.
//   - project-initialized   from Project.createdAt
//   - phase-started         from each ProjectMilestone.createdAt
//                           (skipping milestones whose names don't
//                           parse via the project-prefix convention)
//   - checkin-created       from each Sub-Issue comment whose body
//                           parses as a U2-rendered checkin (carries
//                           both `**Checkin number**: <NN>` and
//                           `**Branch**: \`<branch>\`` header lines)
//
// Out of scope for v1: phase-completed (Milestone state-change
// history isn't cleanly queryable), pr-opened / pr-merged
// (GitHub-PR attachment shape needs investigation work). Both are
// documented as follow-ups in the events-read schema's description.

export interface SynthesizedEvent {
  at: string;
  event: 'project-initialized' | 'phase-started' | 'checkin-created';
  detail: Record<string, unknown>;
}

export interface SynthesisInput {
  slug: string;
  project: { createdAt: string };
  milestones: Array<{ id: string; name: string; createdAt: string }>;
  issues: Array<{
    id: string;
    comments: Array<{ id: string; createdAt: string; body: string }>;
  }>;
}

// Header regexes pinned to U2's rendered shape (see
// cli/lib/render-checkin.ts:159-175). The renderer emits the
// metadata block in a fixed order; v1 parses both lines defensively
// (either may appear first if a future renderer reorders them).
const CHECKIN_NUMBER_LINE = /^\*\*Checkin number\*\*:\s*(\S+)\s*$/m;
const CHECKIN_BRANCH_LINE = /^\*\*Branch\*\*:\s*`([^`]+)`\s*$/m;

export function parseCheckinHeaderFromComment(
  body: string,
): { number: string; branch: string } | null {
  const numberMatch = CHECKIN_NUMBER_LINE.exec(body);
  const branchMatch = CHECKIN_BRANCH_LINE.exec(body);
  if (numberMatch === null || branchMatch === null) return null;
  const number = numberMatch[1];
  const branch = branchMatch[1];
  if (number === undefined || branch === undefined) return null;
  return { number, branch };
}

export function synthesizeFromLinear(input: SynthesisInput): SynthesizedEvent[] {
  const out: SynthesizedEvent[] = [];

  out.push({
    at: input.project.createdAt,
    event: 'project-initialized',
    detail: {},
  });

  for (const m of input.milestones) {
    const parsed = parsePhaseFromMilestoneName(m.name, input.slug);
    if (parsed === null) continue;
    out.push({
      at: m.createdAt,
      event: 'phase-started',
      detail: { phase: parsed.number, name: parsed.name },
    });
  }

  for (const issue of input.issues) {
    for (const c of issue.comments) {
      const header = parseCheckinHeaderFromComment(c.body);
      if (header === null) continue;
      out.push({
        at: c.createdAt,
        event: 'checkin-created',
        detail: { number: header.number, branch: header.branch },
      });
    }
  }

  // Stable sort by `at` ascending. Linear ISO timestamps are
  // lexicographically comparable when they're well-formed
  // (matching Date.toISOString shape), so string-compare suffices
  // for v1 — no need for Date parsing on the hot path.
  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  return out;
}
