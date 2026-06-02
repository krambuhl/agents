---
name: guild-plan
description: >-
  Multi-perspective design primitive for the guild-* substrate family.
  Composes guild-spawn to invoke a panel of plan-* engineer agents
  in parallel against a shared filesystem artifact, then collects each
  engineer's contribution into the artifact as attributed sections.
  Supports multi-round invocations — round 2+ passes the prior
  plan state into the next round's brief so engineers can address
  contradictions. Internal substrate skill — composed by ev-loop as a
  default pre-unit step (phases may override engineers/topic/rounds via
  PLAN.md `**Plan**:` block). Does not iterate, does not
  auto-resolve contradictions.
argument-hint: "engineers=<comma-separated names> brief=<text> plan=<path> [round=<N>]"
user-invocable: false
allowed-tools: Skill, Bash
---

# /guild-plan

Multi-perspective design primitive. Spawns one or more `plan-*`
engineer agents in parallel against the same brief, collects each
engineer's response, and appends them as **attributed sections** to a
shared filesystem artifact (the "plan"). Supports multi-round
flows — caller invokes the skill again with the same plan path
to add a new round, and engineers see prior rounds via per-agent
context.

This skill is the third primitive in the `guild-*` substrate family.
Like `/guild-validate`, it **composes `/guild-spawn`** rather than
calling the `Agent` tool directly — the layering is the point. A loop
using `/guild-plan` gets parallel agent invocation for free,
deterministic attributed-section writes, and forward-compatible
multi-round support without re-implementing any of it.

`/guild-plan` does not know about specific engineer rubrics. It
expects each spawned engineer to return a response body that the skill
will write verbatim under a `### From <engineer-name>` header.

## Inputs

- `engineers` — comma-separated `subagent_type` names of plan
  engineers to spawn, e.g.
  `plan-react-architect,plan-design-systems`. Order is
  preserved in the output's per-engineer fields and in the attributed
  sections written to the plan file.
- `brief` — shared task description handed to every spawned engineer.
  This is the design question being explored (e.g. "How should
  `<Card>` adapt to the new dark-mode token tier?"). Passed verbatim.
- `plan` — repo-relative path where the attributed artifact
  lives. If the file does not exist, the skill creates it with a
  topical header inferred from the brief's first line. If it exists,
  the skill detects the next round number and appends a new `## Round
  N` block.
- `round` (optional) — explicit round number override. Defaults to
  auto-detect (max existing `## Round N` + 1; `1` if file is new or
  empty). Allows explicit re-runs of a specific round if a prior
  invocation was interrupted.

## Output format (locked to the design plan)

The output shape is fixed even when v1 will populate `contradictions`
empty — downstream callers depend on the shape:

```json
{
  "plan_path": "<path>",
  "round": <N>,
  "sections": [
    { "engineer": "<name>", "section": "<verbatim engineer body>" }
  ],
  "contradictions": [],
  "agent_signals": [
    {
      "agent": "<name>",
      "confidence": "high" | "medium" | "low" | null,
      "outcome": "gated" | "recused" | "operator-judgment",
      "reason": "<recusal rationale or escalation reason, or null when gated>"
    }
  ]
}
```

`contradictions` is empty in v1. Cross-engineer contradiction detection
is a future-work case — see § "Contradiction detection (v1: future-
work)" below.

`agent_signals` carries one entry **per spawned engineer** — the same
participate-vs-recuse signal `/guild-validate` emits for evaluators,
computed by the same shared `computeAgentSignal` (the `guild plan append`
verb maps every engineer section through it). It makes recusal observable
at the plan phase:

- `gated` — the engineer contributed normally. This is the default,
  including for an engineer whose section carries no marker (today's
  plan-engineer bodies write prose without recusal/escalation lines, so
  every signal reads `gated` until those bodies emit markers — a deferred
  follow-up). `reason` is null.
- `recused` — the engineer declared its domain non-applicable to the
  brief (a section emitting `VERDICT: recused`). Not a contribution; the
  `reason` carries the rationale from the section's `Reason(s):` marker.
- `operator-judgment` — the engineer escalated (an `Escalation:` line or
  `VERDICT: operator-judgment-required`). `reason` carries the escalation
  rationale.

A per-engineer `confidence` (`Confidence: high|medium|low`, `null` when
absent) rides on every signal. As with `/guild-validate`, recusal does
not gate the round — a recused engineer simply contributes no section;
the signal records why.

## Process

1. **Validate inputs.**
   - If `engineers` is empty, refuse with `guild-plan-error:
     empty engineers list`.
   - If `brief` is missing or empty, refuse with
     `guild-plan-error: missing brief`.
   - If `plan` is missing or empty, refuse with
     `guild-plan-error: missing plan path`.
   - Do not validate that named agents are role-typed
     `plan-engineer`. The substrate doesn't enforce this; if a
     non-engineer is passed, `/guild-spawn` will spawn it and the
     return body will be written verbatim under the attributed
     section header. Caller is responsible for choosing role-
     appropriate agents.

2. **Resolve round number.**
   - If `round` arg supplied, use it verbatim.
   - Otherwise call
     `Bash("guild plan detect-round <plan-path>")`.
     The verb returns a single integer on stdout (`1` if the file
     does not exist or has no `## Round N` headers, else
     `max(existing) + 1`).

3. **Initialize the plan if needed.**
   - If the file does not exist (round = 1), call
     `Bash("guild plan init <plan-path>
     --topic='<first line of brief>'")`. The verb writes the file
     with a `# Plan: <topic>` header. Idempotent — no-op if
     the file already exists.

4. **For round > 1: read prior state.**
   - Call
     `Bash("guild plan read-state <plan-path>")`.
     The verb returns JSON
     `{rounds: [{number, sections: [{engineer, section}]}]}`.
   - Construct `per_agent_context` for `/guild-spawn` as a JSON
     object keyed by engineer `subagent_type`, where each value is
     the prior-state preamble string (the body is identical for
     every engineer in v1 — every engineer sees the same prior
     rounds; the per-agent shape is used so `/guild-spawn` routes
     the preamble to each spawned agent's brief):

     ```json
     {
       "plan-react-architect": "## Prior plan state\n\n<...prior rounds...>\n\n## This round (N)\n\n<...instructions...>",
       "plan-design-systems":  "## Prior plan state\n\n<...prior rounds...>\n\n## This round (N)\n\n<...instructions...>"
     }
     ```

     The preamble-string content is:

     ```
     ## Prior plan state

     <verbatim concatenation of all prior rounds, each formatted as
     "## Round N\n\n### From <engineer>\n\n<section>\n\n">

     ## This round (N)

     You are addressing the prior round(s) above. Look for
     contradictions with your prior position, areas where another
     engineer's section reframes the question, and places where
     consensus has emerged. Your section in this round should
     reflect those observations.
     ```

     Engineers not named in `per_agent_context` (none in this v1
     pattern — all engineers see prior state) receive only the
     shared brief.

5. **Spawn engineers in parallel.** Invoke `/guild-spawn` via the
   `Skill` tool with `agents=<engineers>` and `brief=<input brief>`.
   For round > 1, pass `per_agent_context` constructed in step 4.
   For round = 1, omit `per_agent_context` — every engineer sees
   only the shared brief by design.

6. **Append attributed sections to the plan.** Build a JSON
   array of `{engineer, section}` entries from `/guild-spawn`'s
   outputs (preserving input order; the `section` is the engineer's
   full response body, verbatim) and pipe it to the append script
   via stdin:

   ```bash
   echo '<json-array>' | bin/guild plan append <plan-path>
   ```

   The verb writes the new `## Round N` block with each engineer's
   `### From <name>` subsection and returns the locked Result JSON
   on stdout.

7. **Return** the script's output (parsed back into a structured
   value) to the caller. This skill performs no further work.

## Example

Round 1 invocation:

```
/guild-plan \
  engineers=plan-react-architect,plan-design-systems \
  brief="How should <Card> adapt to the new dark-mode token tier?" \
  plan=projects/2026-05-dark-mode/plans/3-card-dark-mode.md
```

After the skill returns, the plan file contains:

```markdown
# Plan: How should <Card> adapt to the new dark-mode token tier?

## Round 1

### From plan-react-architect

<verbatim engineer-1 response body>

### From plan-design-systems

<verbatim engineer-2 response body>
```

The returned JSON:

```json
{
  "plan_path": "projects/2026-05-dark-mode/plans/3-card-dark-mode.md",
  "round": 1,
  "sections": [
    { "engineer": "plan-react-architect", "section": "<...>" },
    { "engineer": "plan-design-systems", "section": "<...>" }
  ],
  "contradictions": []
}
```

A subsequent round-2 invocation with the same `plan=` path
auto-detects round 2, constructs `per_agent_context` from round 1's
sections, and appends a new `## Round 2` block.

## Contradiction detection (v1: future-work)

A contradiction is two engineers in the same round emitting
incompatible recommendations on the same scope (file, identifier,
architectural choice) — applying both would leave the design
incoherent.

In v1, contradiction detection is a documented no-op:
- For single-engineer panels, only one engineer can contribute, so
  contradictions cannot exist by definition. Return `contradictions:
  []`.
- For multi-engineer panels, the detection mechanism needs a shared
  scope-and-claim comparison rule. That logic is a Phase 4+ concern
  and will be added to this skill's process step 6 then.

Until then, `contradictions` is a field the API supports but v1 does
not produce. Loops can write contradiction-handling code that's ready
when it does. Multi-round invocations let the caller surface
contradictions through the prior-state mechanism (engineers see other
engineers' prior sections and can call out conflicts in their next
round contribution).

## What this skill does NOT do

Explicitly the caller's responsibility, not the substrate primitive's:

- **Iteration / round orchestration.** The caller decides whether to
  invoke a second round, third round, etc. This skill processes one
  round per call.
- **Engineer role validation.** Any named `subagent_type` can be
  passed. Non-plan-engineer agents will produce sections of
  unpredictable shape, which the caller sees in the output. The
  substrate doesn't gatekeep.
- **Plan archival or cleanup.** The plan file persists
  after the skill returns. The caller (typically a phase's `/ev-loop-*`
  invocation) decides when to roll it forward, archive it, or wipe it.
- **Engineer-direct file writes.** Engineers are read-only via their
  `tools:` allowlist (Read, Glob, Grep). The orchestrator does ALL
  writes to the plan via the helper script. This sidesteps
  race conditions on parallel writes and matches the read-only
  stance established by `evaluator-base.md` for the panel family.
- **Topic inference beyond the first line of `brief`.** If the
  topic-from-brief heuristic produces a bad header for the new file,
  the caller can either pre-create the file with a better header
  (the `init` verb is idempotent) or rename the topic later
  manually.

## Rules

- **Compose `/guild-spawn`.** Do not call the `Agent` tool directly.
  The layering is the point.
- **Engineers are read-only.** All writes to the plan file flow
  through `bin/guild plan`. No engineer agent
  should ever be passed a `Write`/`Edit` tool in its `tools:`
  allowlist.
- **Lock the output shape.** Even when v1 leaves `contradictions`
  empty, the structure is what downstream callers depend on.
- **No emojis.**

## Failure modes

- Empty `engineers` list → `guild-plan-error: empty engineers
  list`. Stop.
- Missing or empty `brief` → `guild-plan-error: missing brief`.
  Stop.
- Missing or empty `plan` → `guild-plan-error: missing
  plan path`. Stop.
- `/guild-spawn` itself errors → forward the error verbatim to the
  caller. Do not partially aggregate or write a half-round to the
  plan.
- `plan.ts append` fails (e.g. file path unwritable,
  unparseable stdin) → surface the script's error verbatim and exit
  non-zero. The plan file's state is whatever it was when the
  failure hit (the script does atomic-replace on success, so a
  partial write should not corrupt the file).
- One or more engineer spawns fail individually → the failed
  entries' `section` field carries the error text and the caller
  sees the failure pattern in the structured output. The plan
  file gets the attributed section for that engineer with the error
  body (so the failure is visible in the artifact, not silently
  dropped).
