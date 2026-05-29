# Workflows and the substrate: how `griot` and `guild` would use `parallel()`

**Status**: design exploration (not a decision; not yet a loom project). Reference doc for a possible future `workflows-parallel-adoption` effort.
**Scope**: how the Claude Code *dynamic workflows* feature (`Workflow` tool, `parallel()`/`pipeline()`/`agent()`) maps onto the `guild` antagonist panel and the `griot` judge panel — without surrendering the attention/release cadence that `ev-run` owns.
**Sources**: [Orchestrate subagents at scale with dynamic workflows](https://code.claude.com/docs/en/workflows), [Plugins reference](https://code.claude.com/docs/en/plugins-reference).

## Context

Dynamic workflows are a JavaScript orchestration layer the runtime executes in the background: the script holds the loop, the branching, and the intermediate results, and only the final value returns to the calling context. That is the same code-vs-judgment split this substrate already makes — the CLIs (`bin/loom`, `bin/guild`, `bin/griot`) hold state and aggregation in deterministic TypeScript, while the skills hold control flow in model-interpreted prose. Workflows push the seam up one notch to include control flow.

The question this doc answers is narrow and deliberate: **which fan-out work should move from prose-orchestrated skills to `parallel()` scripts, and where is the line that keeps `ev-run`'s cadence — the per-phase, one-PR-per-merge rhythm, and specifically the pause at PR borders — exactly where it is today.**

The answer is a single structural rule, two concrete sketches, and an honest list of what gates adoption.

## The boundary principle: a workflow is a leaf

> A workflow is a pure function the conductor calls. It is never the conductor.

`ev-run` stays the conductor. The loops (`ev-loop-confidence`, `ev-loop-interactive`) stay the per-phase drivers. A workflow is something a driver *calls* to do a bounded, stateless, parallel chunk of work and get one value back. Every workflow in this design obeys four invariants:

1. **It never crosses a PR border.** A workflow runs entirely inside one unit of work, below the merge boundary.
2. **It never pauses for the human.** No mid-run input — that is a hard runtime constraint, and it is correct for a leaf.
3. **It never touches git or the manifest.** No branch cuts, no `loom phase update`, no checkin writes. The script itself has no shell or filesystem access at all.
4. **It takes inputs, fans out, returns a structured value, and dies.** All intermediate agent outputs stay in script variables and never reach the orchestrator's context.

Everything that gives `ev-run` its control lives *above* this line and does not move: the dispatch decisions, the drift handling, the `AskUserQuestion` gates, and the PR-border wait.

## Why `ev-run`'s cadence is safe by construction

The PR-border pause is `loom pr wait` (`plugins/loom/cli/verbs/loom/pr.ts`): a blocking poll of `gh` PR state (default 30s interval, 30min timeout) that delegates to `/bin/sleep` to block deterministically and returns `exitReason: 'merged' | 'closed' | 'timeout' | 'gh-failed'`. `ev-run` step 3 routes on that discriminant.

A workflow script *structurally cannot* do this:

- it has no shell, so it cannot invoke `loom pr wait`;
- it cannot block on `/bin/sleep`;
- it cannot hand control back to a human at the boundary (no mid-run input).

So the pause cannot be absorbed into a workflow even by accident. This is enforced by the runtime, not by discipline. The workflows documentation states the same rule from the other side: *"For sign-off between stages, run each stage as its own workflow."* A PR border is exactly that sign-off — it is a seam **between** workflow runs, never a step **inside** one.

The layering, top to bottom:

```
ev-run                         ← conductor: dispatch, drift, `loom pr wait` (PR-border pause)
  └─ ev-loop-*                 ← per-phase driver: branch, checkin writes, AskUserQuestion gates, cadence
       └─ [workflow leaf]      ← stateless parallel fan-out: spawn, mediate, return one verdict
            └─ agent() × N      ← the worker primitive (existing evaluator-* / griot-* subagents)
```

Workflows make the *inside of a unit* cheaper (context) and more reliable (guaranteed parallelism). They do not touch the *cadence between* units, phases, or PRs.

## Composition mechanics (validated 2026-05-28)

Three mechanics decide whether a loop can call a panel workflow at all. The first two are reasoned from the workflows documentation; the third was confirmed empirically by a smoke test (`validate-composition`, run `wf_7dd4b621-ef8`).

### A skill invoking a workflow

- **`allowed-tools` must include the Workflow tool.** Skills declare their tools in frontmatter, and none in the family do today: `ev-run` is `{Read, Skill, Bash, AskUserQuestion}`; the loops are `{Read, Write, Edit, Bash, Agent, Skill, …}`. A loop that calls a panel workflow must add the Workflow tool. `ev-run` must not — it is the router, and a panel fan-out is work that belongs in a loop (its contract is explicitly "no evaluator calls").
- **Invocation is background/async, not a synchronous return.** The Workflow tool returns a task ID immediately and notifies on completion. So "loop calls panel → gets verdict → writes checkin" is really "loop spawns the panel as a background subtask, awaits its completion notification, then writes the checkin." The verdict is a value the loop receives on the notification, not an inline return.
- **Safe ownership rule: workflows do read-only fan-out only.** A panel against a static working tree mutates nothing, so the loop and the workflow runtime never contend for the tree or the manifest. Every write — checkins, branch state, rollup promotion, `learning.md` — stays in the skill. Tree and manifest ownership stay single-writer at all times.
- **Structured `args` arrive as a JSON string.** The Workflow tool delivers the `args` value to the script as a string at the boundary, not the object you passed (demo: `agentTypes.map` threw until guarded). Any workflow taking structured input needs `const input = typeof args === 'string' ? JSON.parse(args) : args`.

### Agent-type namespace (the seam to watch)

A workflow's agent registry is **not** the loop's Agent/Skill registry, and the names differ. The smoke test resolved these forms from inside a workflow:

- griot: `griot:griot-judge`, `griot:griot-rubric-author`, `griot:griot-rewriter`, `griot:griot-debate-summarizer`, `griot:griot-operator`; test subject `general-purpose`.
- guild: `guild:retained:evaluator-contract-fit` (the hand-authored baseline), `guild:generated:evaluator-{a11y,css-architecture,naming,nextjs,react,test-integration,test-unit,tokens}`, `guild:generated:whiteboard-*`, `guild:personalities:*`.

Both `guild:evaluator-contract-fit` (the loop's form) and bare `evaluator-contract-fit` **failed to resolve.** The workflow registry exposes guild-compile's on-disk tree (`generated/` vs `retained/` vs `personalities/`); the Agent/Skill registry flattens that to `guild:<agent>`. Two registries, two abstraction levels. Implications:

1. `guild derive-panel`'s output does not drop into a workflow verbatim — a name-translation step is required.
2. Hardcoding `guild:generated:evaluator-react` in a workflow couples it to the codegen layout; a matrix reorganization would break every workflow `agentType` silently.
3. Names drift across the two registries, and this is **reproduced, not theoretical**: `guild derive-panel` emits `evaluator-react-api` while the agent file and workflow agentType are `evaluator-react`. A naive tree-walk mapping fails on it (demo run `wf_c3564478-de7`) — the mapping must *normalize*, not just look up.

**Mitigation if built**: guild owns a verb mapping a logical evaluator name to its workflow-registry `agentType` — including the normalization in (3) — so the codegen taxonomy stays behind guild's boundary, the same single-source-of-truth posture as `parse-and-aggregate`. Workflow scripts never hardcode the three-segment strings. A throwaway prototype (`demo/derive-workflow-agents.mjs`) validated the tree-walk; see `demo/DEMO-RESULTS.md`.

### CLI reachability (validated)

A workflow-spawned agent runs in the repo root with `loom`/`guild`/`griot` on PATH (resolving to the plugin-cache shims). `printf '[]' | guild parse-and-aggregate` returned the locked verdict shape. The Bash-wrap mediation path is confirmed end to end.

### Live panel run + context measurement (validated 2026-05-28)

A real 5-evaluator guild-validate panel ran as a workflow against a planted-issue fixture (demo run `wf_c3564478-de7`; full evidence in `demo/DEMO-RESULTS.md`):

- **End-to-end works.** Five evaluators across the `retained` and `generated` namespaces spawned via `parallel()`, all resolved and produced real findings; the Bash-wrapped `guild parse-and-aggregate` returned the locked verdict (`flagged`, 13 blocking findings), with evaluator quality intact (it even caught an unplanted naming inconsistency).
- **Context saving is real and measured.** The five evaluator transcripts (9,013 chars) stayed in the workflow's script memory; only the verdict (6,862 chars) returned to the orchestrator. Inline `/guild-validate` would deliver both (~15.9k); the workflow delivered ~7k — **~55% less orchestrator context for this run, and that is the floor** (the verdict was unusually large at 13 findings; an `approved` verdict returns ~100 chars and the saving approaches ~99%). Total subagent *work* is identical between modes; the difference is what the scarce orchestrator window absorbs, and it compounds across every panel in a phase.

### Write-category boundary (validated 2026-05-29)

A second demo (run `w3hekye55`; `demo/DEMO-RESULTS.md`) tested whether a workflow may *write* substrate state, using loom's own parallel-work invariant (`projects/CONVENTIONS.md`) as the lens:

- **Category-1 append-only is workflow-safe.** Six parallel agents appended to one JSONL via `griot operator-checks log-intervention`; all six landed atomic, distinct, and in race-order (proving genuine concurrency). griot-compact's logging can run from a workflow without a guard.
- **Category-3 single-writer routes around the collision.** Three whiteboard engineers fanned out read-only and *returned* sections; one assembler agent wrote the file. Parallelize the thinking, serialize the write.
- **Category-3 manifest/PLAN writes stay in the loop** — not tested live (needs a real loom project; the invariant already settles the rule), recommended as a follow-up integration test alongside kill-mid-run recovery.

So the boundary is sharper than "read-only fan-out only": **a workflow may do Category-1 appends and route Category-3 writes through a single writer; the manifest and PLAN stay single-writer in the loop.**

### Loop interleaving + kill recovery (validated 2026-05-29)

A throwaway loom project drove a real loop sequence around real workflow runs (`demo/DEMO-RESULTS.md`, integration test):

- **Interleaving holds.** A loop fired a read-only panel workflow mid-unit (between checkin 01 and 02), awaited the verdict, and recorded it — with the manifest coherent across the async await. Coherence is *enforced*, not conventional: manifest writes use an optimistic-lock token (stale write → rejected). The event trail stayed a coherent narrative because the read-only workflow writes nothing to loom and so cannot scramble it.
- **Kill recovers cleanly.** Killing a workflow mid-run (`TaskStop`) left loom exactly at the pre-workflow checkpoint (negotiation checkin present, no resolution checkin, no workflow-originated events). The loop recovers from loom, not workflow-resume (which is in-session-only). Worst case is double work + orphaned scratch state on re-fire — never loom corruption. And Cat-1 appends were atomic even under the kill (29/30 landed, 0 half-written).
- **Finding:** `meta.latest_checkin` is vestigial (never populated by `checkin write`; latest is derived via `loom checkin latest`), so `ev-run`'s "latest checkin from manifest's `latest_checkin`" orientation is stale or mis-orienting — worth a separate look.

This is the empirical core of the bet: **loom is the durable spine; workflows are a safe, ephemeral leaf the loop drives.**

### Schema-output agents (validated 2026-05-29)

Probe (`walh8d33b`): two guild evaluators authored for `VERDICT:` prose were run in a workflow with a forced output schema (`agent({schema})`). Both complied cleanly — well-formed `{code, evidence, remedy}` findings, quality intact (the a11y lens cross-flagged the token contrast angle), and a trivial JS merge replaced `parse-and-aggregate` for basic aggregation.

- **Existing prose-authored agents coerce into schema output with no quality loss** — so workflow-style agents likely do *not* need a new authoring template; they are the existing agents + a schema. This narrows the research away from "design new agents."
- **But the aggregation *policy* does not vanish.** `parse-and-aggregate` also does severity (blocking/advisory), precedence, and conflict detection. The schema captures *structure*; that policy must move into the schema or the JS merge, not disappear.
- **Open fork for research:** dual output contract (prose for the skill path, schema for the workflow path) vs. migrating evaluators to schema-only. An evaluator used both ways must satisfy both.

## What moves, what stays

| Piece | Disposition | Why |
|---|---|---|
| `guild-spawn` (parallel spawn primitive) | **Becomes `parallel()`** | The skill currently *pleads* for a single parallel tool-use message; `parallel()` guarantees it and bounds concurrency at 16. |
| `guild-validate` (panel + aggregate) | **Becomes a workflow leaf** | No file side-effects. Cleanest possible port. |
| `griot-compact` judge panel (control/treatment + judge rounds + mediation) | **Becomes a workflow leaf** | Highest context win; the panel's verbose outputs stop landing in the orchestrator. |
| `bin/guild parse-and-aggregate`, `bin/griot mediate-panel`, `bin/griot operator-checks` | **Unchanged** | Pure deterministic verbs; the workflow calls them via a thin Bash agent (see Mediation). |
| The evaluator-* / griot-* / whiteboard-* subagents | **Unchanged** | They are exactly the worker primitive workflows orchestrate. |
| `ev-run` (router, dispatch, `loom pr wait`) | **Unchanged** | Above the workflow line by construction. |
| `ev-loop-interactive` | **Stays a skill** | Human-in-the-loop by definition; "no mid-run input" is fatal to it. |
| `ev-loop-confidence` outer loop (branch, checkins, gate-and-ratchet, scope-shift gates) | **Stays a skill** | Heavy git/manifest side-effects + human gates; it *calls* the panel workflow as a leaf. |
| Project durability (manifest, checkins, sessions) | **Stays loom's job** | Workflow resume is in-session only; loom's on-disk state is the stronger durability layer. |

**Guild is read-only by design.** The matrix-codegen migration dropped guild's write-capable `generator-*` family (Phase-7 U1; `demo/FINDING-guild-generator-dangling-refs.md` records the dangling references that survive the drop). Guild is now evaluators + whiteboards + personalities — pure read-only fan-out, the safest possible workflow citizen. The write-from-workflow question lives entirely with loom and griot, not guild.

## Sketch 1 — `guild-validate` as a panel workflow

The clean case: spawn the derived evaluator panel in parallel, mediate through the existing verb, return the locked verdict. No writes anywhere.

```js
export const meta = {
  name: 'guild-validate-panel',
  description: 'Run the antagonist evaluator panel in parallel and return the aggregated verdict',
  phases: [{ title: 'Evaluate' }, { title: 'Mediate' }],
}

// args: { evaluators: string[], packet: string }
const { evaluators, packet } = args

phase('Evaluate')
const outputs = await parallel(
  evaluators.map((ev) => () =>
    agent(packet, { agentType: ev, label: `eval:${ev}`, phase: 'Evaluate' })
      .then((output) => ({ agent: ev, output })),
  ),
)

phase('Mediate')
// Single source of truth: shell out to the existing verb via a thin Bash agent.
const payload = JSON.stringify(outputs.filter(Boolean))
const verdict = await agent(
  `Run this command exactly and return ONLY its stdout, parsed as JSON:\n\n` +
    `guild parse-and-aggregate <<'GUILD_INPUT'\n${payload}\nGUILD_INPUT`,
  { label: 'mediate', phase: 'Mediate', schema: GUILD_VERDICT_SCHEMA },
)

return verdict // { verdict, blocking_findings, advisory_findings, cli_runs, conflicts }
```

Notes:

- The evaluators run as their existing subagents via `agentType`, inheriting their system prompts. **The names are workflow-registry forms, not the loop's** (e.g. `guild:retained:evaluator-contract-fit`, `guild:generated:evaluator-a11y`) — see Composition mechanics. The `evaluators` arg must carry those forms, and a workflow script should resolve them through a guild verb rather than hardcoding the codegen taxonomy.
- The caller is a loop-skill. `ev-loop-confidence` step 3 derives the panel (`guild derive-panel`), invokes this workflow, gets the verdict back, and then writes the checkin and runs gate-and-ratchet — all above the workflow line, unchanged.
- The context win: the evaluators' full transcripts stay in `outputs` (script memory) and never reach the orchestrator. Only the compact verdict returns.

## Sketch 2 — `griot-compact`'s judge panel as a workflow

The high-value case. Today every judge's full output plus the control and treatment generations land in the orchestrator's context, multiplied by rounds, attempts, and notes. A workflow keeps all of it in script variables and returns only the mediated verdict.

There are two carve points. Start with the smaller leaf; grow to the larger one once it is proven.

**Carve A — one attempt's panel (recommended first leaf).** The workflow runs B.3 (control/treatment) + B.4 (round-1 judges) + B.5 (mediate) + B.6 (debate round) for a single attempt and returns the mediated verdict. The skill keeps the attempt loop, the rewriter spawn, `learning.md` writes, rubric authoring, Step C outcome handling, the regression suite, and the PR body.

```js
export const meta = {
  name: 'griot-judge-panel',
  description: 'Run one attempt of the griot panel (control/treatment, blind round, optional debate round) and return the mediated verdict',
  phases: [{ title: 'Subject' }, { title: 'Round 1' }, { title: 'Round 2' }],
}

// args: { prompt, correction, learning, rubric, judges: [{id,tier}], config, testSubjectTier }
const { prompt, correction, learning, rubric, judges, config, testSubjectTier } = args

// B.3 — control + treatment, in parallel, on the test-subject tier.
phase('Subject')
const [control, treatment] = await parallel([
  () => agent(controlBrief(prompt), { agentType: 'general-purpose', label: 'control', phase: 'Subject', model: testSubjectTier }),
  () => agent(treatmentBrief(prompt, learning), { agentType: 'general-purpose', label: 'treatment', phase: 'Subject', model: testSubjectTier }),
])

// Helper: mediate a round through the existing verb via a thin Bash agent.
const mediate = (round, verdicts) =>
  agent(
    `Run this command exactly and return ONLY its stdout as JSON:\n\n` +
      `griot mediate-panel <<'INPUT'\n` +
      JSON.stringify({ round_num: round, verdicts, config }) +
      `\nINPUT`,
    { label: `mediate:r${round}`, phase: round === 1 ? 'Round 1' : 'Round 2', schema: MEDIATION_SCHEMA },
  )

// B.4 — round 1: every judge in parallel, each on its own tier.
phase('Round 1')
const round1 = await parallel(
  judges.map((j) => () =>
    agent(judgeBrief({ prompt, correction, learning, rubric, control, treatment }), {
      agentType: 'griot:griot-judge', model: j.tier, label: `judge:${j.id}`, phase: 'Round 1',
    }).then((raw) => ({ judge_id: j.id, tier: j.tier, raw_output: raw })),
  ),
)
let mediated = await mediate(1, round1)
if (mediated.threshold_met) return mediated

// B.6 — round 2: summarize the disagreement, re-judge with debate context, re-mediate.
phase('Round 2')
const summary = await agent(summarizerBrief(round1), {
  agentType: 'griot:griot-debate-summarizer', model: config.agents.debate_summarizer.tier, label: 'summarizer', phase: 'Round 2',
})
const round2 = await parallel(
  judges.map((j) => () =>
    agent(judgeBrief({ prompt, correction, learning, rubric, control, treatment }, summary), {
      agentType: 'griot:griot-judge', model: j.tier, label: `judge2:${j.id}`, phase: 'Round 2',
    }).then((raw) => ({ judge_id: j.id, tier: j.tier, raw_output: raw })),
  ),
)
mediated = await mediate(2, round2)
return mediated // skill reads threshold_met / tiebreak_applied / consensus_verdict and runs B.7
```

**Carve B — the whole attempt loop (later).** Pull B.1–B.7 into the workflow: it loops attempts, spawns the rewriter between them, has a thin agent overwrite `learning.md`, and returns `{ final_verdict, attempts_history }`. Bigger context win (no attempt's outputs ever reach the orchestrator), at the cost of one file side-effect (the `learning.md` overwrite) being delegated to an agent. The skill still owns Step C (promotion to `rollup.json`, archiving) and the regression suite, which are the parts that most warrant the orchestrator's judgment and the human's eyes.

Notes:

- **Serial-across-notes, parallel-within-panel** is preserved: the skill loops notes and calls the workflow per attempt; the workflow parallelizes only the panel. This matches today's `griot-compact` ("the parallelism is within each note's panel rounds, not across notes").
- **Mediation stays a verb.** `griot mediate-panel` already parses raw judge output, tallies, applies the threshold and tiebreak, and detects tier splits. The workflow does not re-implement any of that (see Mediation).
- **Nesting caveat.** A skill calling this workflow is one level of nesting — fine. If `griot-compact` itself ever became a workflow, it could not call `griot-judge-panel` as a sub-workflow (nesting is one level only); it would inline the `parallel()` calls instead. This is a reason to keep `griot-compact` a skill for now.

## Mediation: how a workflow runs your deterministic verbs

To get the context win, mediation must happen **inside** the workflow — if the workflow returned raw judge/evaluator outputs, they would flow back into the orchestrator and the savings would vanish. The workflow script cannot run shell. So the options are:

1. **Wrap the verb in a thin Bash agent (chosen).** A spawned agent has `Bash`, so it runs `griot mediate-panel` / `guild parse-and-aggregate` directly and returns the parsed JSON. Single source of truth preserved; the tested TypeScript stays authoritative; cost is one extra agent spawn per mediation. **Validated 2026-05-28**: a workflow agent ran in the repo root with the CLIs on PATH, and `guild parse-and-aggregate` returned the locked verdict shape (run `wf_7dd4b621-ef8`).
2. **Port the verb logic into the workflow JS (rejected).** Re-implementing tally/threshold/aggregate in the script avoids a spawn but creates two sources of truth for logic already tested in TypeScript — against the "naming/logic is architecture, single source of truth" posture.
3. **MCP (unnecessary).** Workflow *agents* can reach session-connected MCP tools via `ToolSearch`, so the verbs *could* be exposed as an MCP server and called as typed tools. But that is net-new infrastructure for ~zero gain over a `Bash` call the substrate already trusts. (Caveat worth recording: interactively-authenticated MCP servers may be absent in headless/cron runs; the substrate is Bash/CLI-based, so this does not bite.)

Decision: **Bash-wrap the existing verbs.** The verbs do not move.

## Constraints that gate adoption

1. **Plugins cannot bundle workflows today.** The plugin component types are skills, agents, hooks, MCP servers, LSP servers, and monitors — *not* workflows. Workflows load only from project `.claude/workflows/` or user `~/.claude/workflows/`. So a `guild-validate-panel` workflow cannot ship through the marketplace the way every other artifact does; it would be copied repo-local or per-user. That re-introduces exactly the "coupled to one repo" problem the marketplace migration removed. **This is the primary reason not to fold workflows into the plugin family yet.** Watch for a `workflows/` plugin component type landing — that is the unlock.
2. **Distribution implication of (1).** A pilot lives in this repo's `.claude/workflows/` and references plugin-shipped agents by name (which works as long as the plugins are installed). That is fine for learning; it is not a shippable substrate change.
3. **Research preview / version floor.** Dynamic workflows require Claude Code v2.1.154+ and a paid plan, and can be disabled org-wide. Any consumer depending on a workflow inherits that floor.
4. **Spawned-agent permissions.** Workflow agents always run in `acceptEdits` and inherit the tool allowlist regardless of session mode. The evaluator/judge agents are read-mostly, so this is benign — but worth knowing before any generator-style agent runs inside a workflow.
5. **Agent-type namespace coupling** (validated 2026-05-28; see Composition mechanics). A workflow addresses plugin agents by a different, more granular namespace than the loop's Agent registry (`guild:generated:…` / `guild:retained:…` vs `guild:…`). Until guild owns a logical-name → workflow-`agentType` mapping verb, any workflow script that hardcodes those strings is coupled to guild-compile's on-disk layout and breaks silently on a matrix reorganization. This is a real ownership seam, not a cosmetic one — it is the strongest argument for keeping the panel composition behind a guild verb rather than inline in workflow scripts.
6. **Skill `allowed-tools` + async invocation** (see Composition mechanics). No family skill can call a workflow today; the calling loop needs the Workflow tool added, and the call is background/async (await-completion), not a synchronous return.

## What this is not (non-goals)

- **Not a rewrite.** The CLIs, the subagents, the loom state model, and `ev-run` do not change.
- **Not for `ev-loop-interactive`.** It is human-paired by design; it stays a skill.
- **Not for durability.** Workflow resume is in-session only; loom's append-only on-disk state remains the durability layer.
- **Not an erosion of the substrate.** Ad-hoc workflows (via the `workflow` keyword or `ultracode`) bypass loom checkins, the evaluator panel, and gate-and-ratchet. A separate stance — documented in `CLAUDE.md` and the loop skill descriptions — should say: raw workflows are welcome for one-off audits and research; anything that should leave a loom trail goes through the substrate.

## If and when to pull the trigger

- **Trigger to adopt for distribution**: a `workflows/` plugin component type ships. Until then, treat workflows as repo-local pilots only.
- **Recommended first pilot**: `guild-validate-panel` (Sketch 1). It has no file side-effects, the output schema is already locked, and `ev-loop-confidence` already calls `guild-validate` at a clean seam. Measure the orchestrator-context delta on one real tier; if it holds up, `griot-judge-panel` Carve A is next.
- **Promotion path**: if this exploration becomes work, it slots into the team's research → plan → execute pattern as the research dossier of a `workflows-parallel-adoption` loom project.
