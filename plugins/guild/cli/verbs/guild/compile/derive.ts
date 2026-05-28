import type { AxesData, Cell } from './types.ts';
import { DeriveError } from './types.ts';

// derive: AxesData → ordered Cell[].
//
// Cells come from two sources:
//   - recipes:    each [[recipes]] entry expands to one cell per domain
//   - singletons: each [[singletons]] entry is one domain-less cell
//
// Retained agents are NOT cells — codegen never touches them. They
// surface only so the validate stage can check collision freeness.
//
// Order is deterministic:
//   recipes in axes.toml order; within recipe, domains in declared
//   order; singletons after recipes in declared order.
//
// Duplicates: if two cells share the same id (e.g. two recipes
// produce evaluator-a11y), throw DeriveError — fail loud rather than
// silent dedup. A duplicate is a signal the recipe set has an overlap
// the author didn't intend.

// Phase → cell-id prefix. PLAN's existing convention for the two
// active phases. Other phases throw on derivation today.
const PHASE_PREFIX: Record<string, string> = {
  reviewer: 'evaluator',
  planner: 'whiteboard',
};

function prefixForPhase(phase: string): string {
  const prefix = PHASE_PREFIX[phase];
  if (prefix === undefined) {
    throw new DeriveError(
      `phase "${phase}" has no cell-id prefix (PLAN's convention covers reviewer + planner only today)`,
    );
  }
  return prefix;
}

export function derive(data: AxesData): Cell[] {
  const cells: Cell[] = [];
  const seen = new Map<string, string>(); // id → first source description

  for (const recipe of data.recipes) {
    const prefix = prefixForPhase(recipe.phase);
    for (const domain of recipe.domains) {
      const id = `${prefix}-${domain}`;
      const sourceDesc = `recipe "${recipe.name}" (domain "${domain}")`;
      const prior = seen.get(id);
      if (prior !== undefined) {
        throw new DeriveError(
          `duplicate cell id "${id}": first seen in ${prior}; also produced by ${sourceDesc}`,
        );
      }
      seen.set(id, sourceDesc);
      cells.push({
        id,
        phase: recipe.phase,
        personality: recipe.personality,
        domain,
        source: 'recipe',
        source_name: recipe.name,
      });
    }
  }

  for (const sing of data.singletons) {
    const id = sing.name;
    const sourceDesc = `singleton "${sing.name}"`;
    const prior = seen.get(id);
    if (prior !== undefined) {
      throw new DeriveError(
        `duplicate cell id "${id}": first seen in ${prior}; also produced by ${sourceDesc}`,
      );
    }
    seen.set(id, sourceDesc);
    cells.push({
      id,
      phase: sing.phase,
      personality: sing.personality,
      domain: null,
      source: 'singleton',
      source_name: sing.name,
    });
  }

  return cells;
}
