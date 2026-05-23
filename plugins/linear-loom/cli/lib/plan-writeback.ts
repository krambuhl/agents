// PLAN.md writeback: closes the bidirectional loop in DESIGN.md § 13.
//
// After `linear-loom tasks generate --apply` successfully creates or
// updates Linear-side nodes, each Phase / Batch / Task line in PLAN.md
// gets annotated with the Linear URL it now corresponds to. The
// annotation lives inline as `([linear](<url>))` appended to the
// existing line, so the rendered markdown stays scannable and the
// source diff stays minimal.
//
// Idempotency rule (DESIGN.md § 12.7): re-applying the same map of
// composed_key → url against an already-annotated PLAN.md is a no-op.
// Re-applying with a new URL replaces the URL inside the existing
// annotation; it does not append a second one. This makes a second
// `--apply` invocation safe.

import { parsePlan, flattenPlan } from './plan-parser.ts';

// Matches a trailing `([linear](<url>))` annotation at end-of-line.
// Allows incidental whitespace before the parenthesis so re-runs
// against varied input shapes still recognise the annotation.
const LINEAR_ANNOTATION = /\s*\(\[linear\]\([^)]+\)\)\s*$/;

export interface ApplyLinearUrlsResult {
  text: string;
  // Count of PLAN.md lines whose annotation changed (newly appended
  // or URL-replaced). Idempotent re-runs report 0.
  updated_lines: number;
}

export function applyLinearUrlsToPlan(
  planText: string,
  urlsByComposedKey: Map<string, string>,
): ApplyLinearUrlsResult {
  if (urlsByComposedKey.size === 0) {
    return { text: planText, updated_lines: 0 };
  }

  // Re-parse the PLAN.md so we know which 1-based line number each
  // composed_key resolves to. Substrate-wide rule: writeback is a
  // pure function of (planText, urlMap); it does not piggy-back on
  // a caller's already-parsed tree.
  const parsed = parsePlan(planText);
  const flat = flattenPlan(parsed);

  // Map line-number → linear-url for the lines that need touching.
  const urlsByLine = new Map<number, string>();
  for (const node of flat) {
    const url = urlsByComposedKey.get(node.composed_key);
    if (url !== undefined && url !== '') {
      urlsByLine.set(node.line, url);
    }
  }

  if (urlsByLine.size === 0) {
    return { text: planText, updated_lines: 0 };
  }

  const lines = planText.split('\n');
  let updated = 0;

  for (const [lineNo, url] of urlsByLine) {
    const idx = lineNo - 1;
    const original = lines[idx];
    if (original === undefined) {
      // Shouldn't happen — line number comes from the parser, which
      // walked the same text. Treat as silently-skip to keep the
      // writeback non-fatal on edge-case mismatches.
      continue;
    }
    const annotation = `([linear](${url}))`;
    const stripped = original.replace(LINEAR_ANNOTATION, '');
    // Trim any trailing whitespace the strip might have left behind
    // so the appended annotation sits flush against the prose.
    const base = stripped.replace(/\s+$/, '');
    const rewritten = `${base} ${annotation}`;
    if (rewritten !== original) {
      lines[idx] = rewritten;
      updated += 1;
    }
  }

  return { text: lines.join('\n'), updated_lines: updated };
}
