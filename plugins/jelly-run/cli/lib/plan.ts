// Parse a single phase out of a PLAN.md, by heading match. Pure +
// testable: the verb reads PLAN.md off disk and hands the text here, so
// the parsing logic never touches IO (the testable-core posture). Format
// is the jelly/loom PLAN convention:
//
//   #### Phase 2.1 — <name>
//
//   **Goal**: <one-paragraph goal>
//
//   **Exit**:
//   - <criterion>
//   - <criterion>
//
//   **Depends on**: ...   <- section ends at the next ** field or heading
//
// Matching is by phase-NAME substring (case-insensitive) rather than a
// sequential number, because PLAN headings carry semantic labels
// ("Phase 2.1") that need not match a manifest's sequential index.

import type { PhaseContext } from './types.ts';
import { JellyRunError } from './errors.ts';

const HEADING_RE = /^(#{2,4})\s+(.*\S)\s*$/;
const GOAL_RE = /^\*\*Goal\*\*:\s*(.*\S)\s*$/;
const EXIT_RE = /^\*\*Exit\*\*:\s*$/;
const FIELD_RE = /^\*\*[A-Za-z]/; // any **Field**: line (ends the Exit list)
const BULLET_RE = /^\s*-\s+(.*\S)\s*$/;

export function parsePhase(planText: string, phaseName: string): PhaseContext {
  const lines = planText.split('\n');
  const needle = phaseName.toLowerCase();

  // Locate the phase heading: a heading line containing the phase name.
  let start = -1;
  let headingText = '';
  for (let i = 0; i < lines.length; i++) {
    const m = HEADING_RE.exec(lines[i]!);
    if (m && m[2]!.toLowerCase().includes(needle)) {
      start = i;
      headingText = m[2]!;
      break;
    }
  }
  if (start === -1) {
    throw new JellyRunError(
      'phase-not-found',
      `no PLAN.md heading matches phase '${phaseName}'`,
    );
  }

  // The phase section runs until the next heading of the same or higher
  // level (## / ### / ####).
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i]!)) {
      end = i;
      break;
    }
  }
  const section = lines.slice(start + 1, end);

  // Goal: the text after **Goal**:.
  let goal = '';
  for (const line of section) {
    const m = GOAL_RE.exec(line);
    if (m) {
      goal = m[1]!;
      break;
    }
  }

  // Exit criteria: bullets following the **Exit**: line, until the next
  // ** field line.
  const exitCriteria: string[] = [];
  let inExit = false;
  for (const line of section) {
    if (EXIT_RE.test(line)) {
      inExit = true;
      continue;
    }
    if (!inExit) continue;
    if (FIELD_RE.test(line)) break; // next **Field**: ends the list
    const b = BULLET_RE.exec(line);
    if (b) exitCriteria.push(b[1]!);
  }

  return { name: headingText, goal, exitCriteria };
}
