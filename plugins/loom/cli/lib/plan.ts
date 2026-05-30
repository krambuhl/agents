// sync-shared: plugin-local
// Shared PLAN.md parser for the loom substrate.
//
// parsePlan() turns PLAN.md text into a typed tree (see ParsedPlan in
// types.ts) plus a list of diagnostics. It is a pure read-derivation:
// text in, tree out, no filesystem, no clock, no network. The caller
// owns reading the file (mirroring readManifest's path/text split), so
// this stays trivially unit-testable and can't grow a hidden FS
// dependency.
//
// Tolerance is lenient-with-diagnostics, not throw-on-malformed: PLAN.md
// is hand-edited prose and is rewritten by `loom revise-plan`, so a
// parser that threw on the first unrecognized line would turn every
// mostly-fine plan into a hard CLI failure. Missing optional sections
// produce cosmetic diagnostics and an absent/empty field; structural
// problems (no phases, a dangling dependency) produce structural
// diagnostics. The ONE thrown error is input with no markdown headings
// at all — that isn't a plan.
//
// Erasable TypeScript only: no classes here beyond the imported
// LoomError, no parameter properties, and no `*/` sequence inside a
// block comment (both are Node strip-only footguns that vitest masks).

import type {
  Diagnostic,
  Milestone,
  ParsedPhase,
  ParsedPlan,
  ParsePlanResult,
  PlanMilestoneRef,
} from './types.ts';
import { LoomError } from './errors.ts';

// `### M1 — loom state model`. Milestone ids are `M` + digits. Heading
// level is advisory (2-4 hashes) — we match on the text pattern, not the
// `#`-count, so heading-level drift across plans doesn't drop a node.
const MILESTONE_RE = /^#{2,4}\s+(M\d+)\s*[—–-]\s*(.+?)\s*$/;

// `#### Phase 1 — Name` / `### Phase 1.1 — Name` / `### Phase 1: Name`.
// Id is captured as a string (`[\d.]+`) so dotted ids survive; the
// separator is em-dash, en-dash, ASCII hyphen, or colon (older plans
// use `Phase N: Name`).
const PHASE_RE = /^#{2,4}\s+Phase\s+([\d.]+)\s*[—–:-]\s*(.+?)\s*$/;

// Any markdown heading — used to detect "is this a plan at all" and to
// end section-collection (Loop strategy prose, exit bullet lists).
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;

// `**Goal**:` / `**Deliverable**:` and the `**Goal (updated)**:` variant.
// `Deliverable` is the project-PLAN vocabulary alias for `Goal`, accepted
// additively so both conventions parse. The parenthetical shape lets a
// plan revision supersede the original in-place. The last occurrence
// within a phase wins.
const GOAL_RE = /^\*\*(?:Goal|Deliverable)(?:\s*\([^)]*\))?\*\*:\s*(.+?)\s*$/;

// `**Exit**:`, `**Output**:`, or `**Verification**:` — all accepted to
// match the PLAN.md conventions seen in the wild (`Verification` is the
// project-PLAN vocabulary alias, accepted additively). The value may be
// inline on the same line and/or a following bullet list.
const EXIT_RE = /^\*\*(?:Exit|Output|Verification)\*\*:\s*(.*?)\s*$/;

const DEPENDS_RE = /^\*\*Depends on\*\*:\s*(.+?)\s*$/;

const WHITEBOARD_RE = /^\*\*Whiteboard\*\*:\s*(.+?)\s*$/;

const BULLET_RE = /^\s*[-*]\s+(.+?)\s*$/;

// Collect a contiguous run of bullet lines starting at `start`. Returns
// the trimmed bullet texts and the index of the first non-bullet line.
function collectBullets(
  lines: string[],
  start: number,
): { items: string[]; next: number } {
  const items: string[] = [];
  let i = start;
  while (i < lines.length) {
    const m = lines[i].match(BULLET_RE);
    if (m === null) break;
    items.push(m[1]);
    i++;
  }
  return { items, next: i };
}

// Collect prose lines up to (but not including) the next markdown
// heading. Returns the joined, trimmed prose and the index of that
// heading (or end of input).
function collectProse(
  lines: string[],
  start: number,
): { prose: string; next: number } {
  const collected: string[] = [];
  let i = start;
  while (i < lines.length) {
    if (HEADING_RE.test(lines[i])) break;
    collected.push(lines[i]);
    i++;
  }
  return { prose: collected.join('\n').trim(), next: i };
}

// Parse a `**Depends on**:` value into a list of phase-id strings.
// `nothing` (any trailing parenthetical) -> []. Parentheticals are
// stripped so `Phase 2 (manifest.toml)` -> "2". Integer ranges
// (`Phases 1-6`, any dash) expand to each id. Singles and comma lists
// (`Phase 1, Phase 2`, dotted `Phase 1.1`) are collected in order.
// Result is de-duplicated, order-preserving.
export function parseDependsOn(raw: string): string[] {
  const cleaned = raw
    .replace(/\([^)]*\)/g, '')
    .replace(/\.\s*$/, '')
    .trim();
  if (/^nothing\b/i.test(cleaned)) return [];

  const ids: string[] = [];

  // Expand integer ranges first, blanking the matched span so the
  // single-id scan below doesn't re-collect the endpoints.
  const residual = cleaned.replace(
    /Phases?\s+(\d+)\s*[—–-]\s*(\d+)/gi,
    (_match, lo: string, hi: string) => {
      const low = parseInt(lo, 10);
      const high = parseInt(hi, 10);
      if (low <= high) {
        for (let n = low; n <= high; n++) ids.push(String(n));
      }
      return ' ';
    },
  );

  const singleRe = /Phases?\s+([\d.]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = singleRe.exec(residual)) !== null) {
    ids.push(m[1]);
  }

  return ids.filter((id, idx) => ids.indexOf(id) === idx);
}

export function parsePlan(text: string): ParsePlanResult {
  const lines = text.split(/\r?\n/);
  const diagnostics: Diagnostic[] = [];
  const phases: ParsedPhase[] = [];
  const milestones: Milestone[] = [];

  let currentMilestone: Milestone | undefined;
  let currentPhase: ParsedPhase | undefined;
  let loopStrategy: string | undefined;
  let planWhiteboard: string | undefined;
  let sawHeading = false;

  // 1-based source lines, kept out of the public ParsedPhase shape so the
  // tree stays serialization-clean. Used to anchor diagnostics generated
  // in the post-scan pass below to where the author can see them.
  const phaseHeadingLine = new Map<ParsedPhase, number>();
  const phaseDependsLine = new Map<ParsedPhase, number>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const milestoneMatch = line.match(MILESTONE_RE);
    if (milestoneMatch !== null) {
      sawHeading = true;
      currentMilestone = {
        id: milestoneMatch[1],
        name: milestoneMatch[2],
        phases: [],
      };
      milestones.push(currentMilestone);
      currentPhase = undefined;
      continue;
    }

    const phaseMatch = line.match(PHASE_RE);
    if (phaseMatch !== null) {
      sawHeading = true;
      const phase: ParsedPhase = {
        id: phaseMatch[1],
        name: phaseMatch[2],
        exitCriteria: [],
        dependsOn: [],
      };
      if (currentMilestone !== undefined) {
        const ref: PlanMilestoneRef = {
          id: currentMilestone.id,
          name: currentMilestone.name,
        };
        phase.milestone = ref;
        currentMilestone.phases.push(phase);
      }
      phases.push(phase);
      phaseHeadingLine.set(phase, i + 1);
      currentPhase = phase;
      continue;
    }

    const headingMatch = line.match(HEADING_RE);
    if (headingMatch !== null) {
      sawHeading = true;
      const title = headingMatch[2];
      if (/^Loop strategy\b/i.test(title)) {
        const { prose, next } = collectProse(lines, i + 1);
        loopStrategy = prose;
        i = next - 1;
        continue;
      }
      // A top-level (`#` or `##`) heading that is neither a milestone
      // nor a phase ends the current phase/milestone section context
      // (e.g. `## Verification` after the phase list). Deeper headings
      // are left alone.
      if (headingMatch[1].length <= 2) {
        currentPhase = undefined;
        currentMilestone = undefined;
      }
      continue;
    }

    if (currentPhase !== undefined) {
      const goalMatch = line.match(GOAL_RE);
      if (goalMatch !== null) {
        currentPhase.goal = goalMatch[1];
        continue;
      }

      const exitMatch = line.match(EXIT_RE);
      if (exitMatch !== null) {
        const inline = exitMatch[1].trim();
        const { items, next } = collectBullets(lines, i + 1);
        const criteria: string[] = [];
        if (inline.length > 0) criteria.push(inline);
        criteria.push(...items);
        currentPhase.exitCriteria = criteria;
        i = next - 1;
        continue;
      }

      const dependsMatch = line.match(DEPENDS_RE);
      if (dependsMatch !== null) {
        currentPhase.dependsOn = parseDependsOn(dependsMatch[1]);
        phaseDependsLine.set(currentPhase, i + 1);
        continue;
      }
    }

    const whiteboardMatch = line.match(WHITEBOARD_RE);
    if (whiteboardMatch !== null) {
      if (currentPhase !== undefined) {
        currentPhase.whiteboard = whiteboardMatch[1];
      } else {
        planWhiteboard = whiteboardMatch[1];
      }
      continue;
    }
  }

  if (!sawHeading) {
    throw new LoomError(
      'plan-no-headings',
      'input has no markdown headings — not a PLAN.md',
    );
  }

  const phasesById: Record<string, ParsedPhase> = {};
  for (const phase of phases) {
    phasesById[phase.id] = phase;
  }

  if (phases.length === 0) {
    diagnostics.push({
      code: 'plan-no-phases-found',
      line: 0,
      severity: 'structural',
      message: 'plan has headings but no `Phase N — Name` headings were found',
    });
  }

  // Cosmetic diagnostics for absent optional sections, and structural
  // diagnostics for dependencies that point at a phase id with no
  // matching heading (silently breaks ev-run's actionability math).
  for (const phase of phases) {
    const headingLine = phaseHeadingLine.get(phase) ?? 0;
    if (phase.goal === undefined) {
      diagnostics.push({
        code: 'plan-phase-missing-goal',
        line: headingLine,
        severity: 'cosmetic',
        message: `phase ${phase.id} has no **Goal**/**Deliverable**`,
      });
    }
    if (phase.exitCriteria.length === 0) {
      diagnostics.push({
        code: 'plan-phase-missing-exit',
        line: headingLine,
        severity: 'cosmetic',
        message: `phase ${phase.id} has no **Exit**/**Output**/**Verification** criteria`,
      });
    }
    for (const depId of phase.dependsOn) {
      if (phasesById[depId] === undefined) {
        diagnostics.push({
          code: 'plan-dangling-dependency',
          line: phaseDependsLine.get(phase) ?? headingLine,
          severity: 'structural',
          message: `phase ${phase.id} depends on phase ${depId}, which has no heading`,
        });
      }
    }
  }

  const plan: ParsedPlan = {
    phases,
    phasesById,
  };
  if (milestones.length > 0) plan.milestones = milestones;
  if (loopStrategy !== undefined && loopStrategy.length > 0) {
    plan.loopStrategy = loopStrategy;
  }
  if (planWhiteboard !== undefined) plan.whiteboard = planWhiteboard;

  return { plan, diagnostics };
}
