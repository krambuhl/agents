// phase-roster — resolve a guild phase to the agent names that MAY
// participate at it, read from axes.toml's domain×phase membership.
//
// A domain participates at phase P iff P ∈ axis.domain.<d>.phases. Each
// participating domain maps to one agent name via the shared PHASE_PREFIX
// (reviewer → `evaluator`, every other phase → its own name) — the same
// mapping /guild-compile and the recipe resolver use, so the roster this
// emits and the files codegen writes cannot name different agents.
//
// This layer answers "who MAY participate at phase P"; runtime self-recusal
// is the second gate — an agent still bows out on artifact specifics the
// declarative table can't see. It is the participation source of truth for
// the four roster-driven phases (research, plan, implementer, fixer). The
// reviewer phase derives its panel from file types via PANEL-COMPOSITION.md
// (see derive-panel.ts), so callers route reviewer there instead — but
// resolvePhaseRoster stays a faithful axes.toml reader and will answer
// reviewer too (with the evaluator-* prefix skew applied).

import { isTomlTable, type TomlTable } from '../../lib/toml.ts';
import { PHASE_PREFIX } from './phase-prefix.ts';

export class PhaseRosterError extends Error {}

// Own lookup wrapper per the phase-prefix.ts convention: each consumer
// throws its own error type so error provenance is preserved.
function nameFor(phase: string, domain: string): string {
  const prefix = PHASE_PREFIX[phase];
  if (prefix === undefined) {
    throw new PhaseRosterError(
      `no agent-name prefix for phase '${phase}' — add an entry to PHASE_PREFIX`,
    );
  }
  return `${prefix}-${domain}`;
}

// Collect the domains whose `phases` list includes `phase`, sorted by domain
// name (deterministic regardless of axes.toml declaration order), each mapped
// to its `<prefix>-<domain>` agent name. An unknown phase (no PHASE_PREFIX
// entry) fails loud rather than returning an empty roster — an empty panel
// would let a typo'd phase degrade to a silent no-op.
export function resolvePhaseRoster(axes: TomlTable, phase: string): string[] {
  if (PHASE_PREFIX[phase] === undefined) {
    throw new PhaseRosterError(
      `unknown phase '${phase}' (known: ${Object.keys(PHASE_PREFIX).join(', ')})`,
    );
  }
  const axis = axes.axis;
  if (!isTomlTable(axis)) {
    throw new PhaseRosterError('axes.toml: missing [axis] table');
  }
  const domainTable = axis.domain;
  if (!isTomlTable(domainTable)) {
    throw new PhaseRosterError('axes.toml: missing [axis.domain] table');
  }
  const domains: string[] = [];
  for (const [domain, table] of Object.entries(domainTable)) {
    if (!isTomlTable(table)) continue;
    const phases = table.phases;
    if (!Array.isArray(phases)) continue;
    if (phases.includes(phase)) domains.push(domain);
  }
  domains.sort();
  return domains.map((domain) => nameFor(phase, domain));
}
