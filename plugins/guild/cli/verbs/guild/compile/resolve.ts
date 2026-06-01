import type { AxesData, Cell, ResolvedCell } from './types.ts';
import { ResolveError } from './types.ts';

// resolve: AxesData + Cell + fragmentReader → ResolvedCell.
//
// Reads the 3 source fragments (phase, personality, domain) for a
// cell and computes the tool fold.
//
// Tool fold (per PLAN § Phase 1.2 exit criterion 5):
//   tools = phase.base_tools ∪ domain.tool_grants
//                          (at verification phases — reviewer + implementer + fixer)
//   tools = phase.base_tools
//                          (everywhere else — plan + research)
//
// For singletons (no domain): domain_fragment is the empty string;
// tool_grants don't apply (no domain to fold from). tools =
// phase.base_tools regardless of phase.
//
// fragmentReader is injected so resolve stays pure-ish in tests:
// real I/O happens in compile.ts; tests can pass an in-memory
// reader. The reader's relPath argument is rooted at plugins/guild/.

const VERIFICATION_PHASES = new Set(['reviewer', 'implementer', 'fixer']);

export type FragmentReader = (relPath: string) => string;

function fragmentRelPath(kind: 'phase' | 'personality' | 'domain', name: string): string {
  if (kind === 'phase') return `modes/phases/${name}.md`;
  if (kind === 'personality') return `modes/personalities/${name}.md`;
  return `modes/domains/${name}.md`;
}

function dedupeAndSort(tools: string[]): string[] {
  return [...new Set(tools)].sort();
}

export function resolve(
  data: AxesData,
  cell: Cell,
  fragmentReader: FragmentReader,
): ResolvedCell {
  const axisPhase = data.phases[cell.phase];
  if (axisPhase === undefined) {
    throw new ResolveError(
      `cell "${cell.id}": phase "${cell.phase}" not in axis.phase.*`,
    );
  }
  const axisPersonality = data.personalities[cell.personality];
  if (axisPersonality === undefined) {
    throw new ResolveError(
      `cell "${cell.id}": personality "${cell.personality}" not in axis.personality.*`,
    );
  }

  const phase_fragment = fragmentReader(fragmentRelPath('phase', cell.phase));
  const personality_fragment = fragmentReader(
    fragmentRelPath('personality', cell.personality),
  );

  let domain_fragment = '';
  let toolGrants: string[] = [];
  if (cell.domain !== null) {
    const axisDomain = data.domains[cell.domain];
    if (axisDomain === undefined) {
      throw new ResolveError(
        `cell "${cell.id}": domain "${cell.domain}" not in axis.domain.*`,
      );
    }
    domain_fragment = fragmentReader(fragmentRelPath('domain', cell.domain));
    toolGrants = axisDomain.tool_grants;
  }

  const tools = VERIFICATION_PHASES.has(cell.phase)
    ? dedupeAndSort([...axisPhase.base_tools, ...toolGrants])
    : dedupeAndSort([...axisPhase.base_tools]);

  return {
    ...cell,
    phase_fragment,
    personality_fragment,
    domain_fragment,
    tools,
  };
}
