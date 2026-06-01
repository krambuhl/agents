export const meta = {
  name: 'guild-validate-demo',
  description:
    'THROWAWAY: run a real guild-validate panel as a parallel() workflow against a planted-issue fixture, mediate via `guild parse-and-aggregate`, and return the verdict plus per-evaluator output sizes for the context-savings measurement',
  phases: [{ title: 'Panel' }, { title: 'Mediate' }],
}

// args: { agentTypes: string[], packet: string }
//   agentTypes — workflow-registry names from demo/derive-workflow-agents.mjs
//                (e.g. guild:retained:evaluator-contract-fit, guild:generated:evaluator-a11y)
//   packet     — the standard guild-validate dense packet (Contract / Artifact / Original ask)
// Finding: the Workflow tool can deliver `args` as a JSON string at the
// boundary (not the structured object you passed), so guard with a parse.
const input = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const { agentTypes, packet } = input

phase('Panel')
const outputs = await parallel(
  agentTypes.map((t) => () =>
    agent(packet, { agentType: t, label: `eval:${t}`, phase: 'Panel' })
      .then((output) => ({ agent: t, output, chars: (output || '').length }))
      .catch((e) => ({ agent: t, output: `PANEL_AGENT_ERROR: ${String(e)}`, chars: 0, errored: true })),
  ),
)

phase('Mediate')
// Single source of truth: shell out to the real verb via a thin Bash agent.
const aggInput = JSON.stringify(outputs.filter(Boolean).map((o) => ({ agent: o.agent, output: o.output })))
const verdict = await agent(
  [
    'Run this command EXACTLY as written and return ONLY its stdout — no commentary, no code fences, nothing else:',
    '',
    "guild parse-and-aggregate <<'GUILD_INPUT'",
    aggInput,
    'GUILD_INPUT',
  ].join('\n'),
  { label: 'mediate', phase: 'Mediate' },
)

// Measurement: only SIZES return to the orchestrator, never the verbose
// evaluator outputs. inline-mode orchestrator cost ~= sum(per_evaluator_chars)
// (what /guild-validate would dump into context); workflow-mode cost ~= verdict_chars.
return {
  agentTypes,
  verdict,
  verdict_chars: (verdict || '').length,
  per_evaluator_chars: outputs
    .filter(Boolean)
    .map((o) => ({ agent: o.agent, chars: o.chars, errored: !!o.errored })),
  inline_mode_orchestrator_chars: outputs
    .filter(Boolean)
    .reduce((sum, o) => sum + (o.chars || 0), 0),
}
