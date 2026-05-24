// Phase-name parser for Linear ProjectMilestones.
//
// linear-loom's milestone naming convention (DESIGN.md § 5 + § 6)
// composes a Phase milestone as `<slug> · Phase N — <prose>`. The
// composer lives in cli/verbs/tasks.ts (the canonical write site);
// this parser is the inverse used by every read/write verb that
// needs to resolve a milestone by phase number:
//
//   - cli/verbs/project.ts (`project read`) — reverse-maps to
//     phase number when emitting the loom-compat JSON.
//   - cli/verbs/phase.ts (`phase update`) — locates the milestone
//     to transition.
//   - cli/lib/events-synthesis.ts (`events read`) — derives
//     `phase-started` events from milestone metadata.
//
// Extracted from the original site (verbs/project.ts) once a third
// caller emerged in Phase 6 U4. Future format changes touch the
// composer in tasks.ts + this single shared parser.

export interface ParsedPhaseFromMilestone {
  number: number;
  name: string;
}

export function parsePhaseFromMilestoneName(
  milestoneName: string,
  slug: string,
): ParsedPhaseFromMilestone | null {
  const prefix = `${slug} · `;
  if (!milestoneName.startsWith(prefix)) return null;
  const rest = milestoneName.slice(prefix.length);
  const match = /^Phase\s+(\d+)\s*[—-]\s*(.+)$/.exec(rest);
  if (match === null) return null;
  const numberStr = match[1];
  const namePart = match[2];
  if (numberStr === undefined || namePart === undefined) return null;
  return {
    number: Number.parseInt(numberStr, 10),
    name: namePart.trim(),
  };
}
