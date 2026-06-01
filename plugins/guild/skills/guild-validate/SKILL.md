---
name: guild-validate
description: >-
  Antagonist panel coordinator for the guild-* substrate family.
  Composes guild-spawn to run evaluator agents in parallel, parses
  each evaluator's verdict, and aggregates findings into a single
  panel verdict (approved | flagged | flagged-conflict) with
  blocking/advisory split and conflict surfacing. Internal substrate
  skill — composed by ev-loop and any other loop style that wants
  antagonist panel coordination. Does not iterate, does not auto-
  resolve conflicts.
argument-hint: "agents=<comma-separated names> packet=<text> [precedence=<comma-separated names>]"
user-invocable: false
allowed-tools: Skill
---

# /guild-validate

Antagonist panel coordinator. Spawns one or more evaluator agents in
parallel against the same evaluation packet, parses each verdict,
and aggregates findings into a single panel verdict that the calling
loop can act on.

This skill is the second primitive in the `guild-*` substrate family.
It **composes `guild-spawn`** rather than calling the `Agent` tool
directly — the layering is the point. A loop using `guild-validate`
gets parallel agent invocation for free, structured aggregation, and
forward-compatible verdict shape, without re-implementing any of it.

`guild-validate` does not know about specific evaluator rubrics. It
expects each spawned agent to return a parseable verdict (see the
contract in `.claude/agents/evaluator-base.md`) and treats every
agent's output uniformly.

## Inputs

- `agents` — comma-separated `subagent_type` names of evaluators to
  spawn, e.g. `evaluator-contract-fit` (single-evaluator panel) or
  `evaluator-contract-fit,evaluator-a11y,evaluator-tokens` (multi-
  evaluator panel). Order is preserved in the output's per-evaluator
  fields.
- `packet` — the standard three-section evaluation packet (Contract /
  Artifact / Original ask). This is the shared brief handed to every
  evaluator. The packet shape is documented in `evaluator-base.md`.
- `precedence` (optional) — comma-separated ordered list of evaluator
  names for non-conflicting overlap resolution. When two evaluators
  flag the same issue with non-contradictory remedies, the higher-
  precedence one's finding is reported in the consolidated list.
  Defaults to input order when absent.
- `slug` (optional) — the active loom project slug. When present, the
  panel's activity is emitted to that project's event log (see § Emit
  panel events). When absent, `guild-validate` is a pure verdict-
  returner and emits nothing — standalone use (no loom project) is
  unaffected.
- `phase` (optional) — the phase number for the emitted events' detail.
  Threaded alongside `slug` by a loop that knows its phase (e.g.
  `/ev-loop-interactive`). Defaults to `0` when `slug` is present but
  `phase` is not.
- `unit` (optional) — the unit id (e.g. checkin number or deliverable
  name) for the emitted events' detail. Defaults to `""` when `slug` is
  present but `unit` is not.

## Output format (locked to the design plan)

The output shape is fixed even when v1 will populate some fields
empty — downstream callers (loops, retry policies, PR builders)
depend on the shape:

```
{
  "verdict": "approved" | "flagged" | "flagged-conflict" | "operator-judgment-required",
  "blocking_findings": [
    {
      "evaluator": "<agent name>",
      "code": "<flag code, e.g. criterion-unmet>",
      "evidence": "<one-line evidence>",
      "remedy": "<minimal concrete fix>"
    },
    ...
  ],
  "advisory_findings": [ ...same shape... ],
  "cli_runs": [
    { "evaluator": "<agent name>", "command": "<cmd>", "passed": true | false }
  ],
  "conflicts": [
    {
      "scope": "<file:line or shared scope>",
      "evaluators": ["<a>", "<b>"],
      "findings": [ ...the conflicting finding objects... ]
    }
  ],
  "agent_signals": [
    {
      "agent": "<agent name>",
      "confidence": "high" | "medium" | "low" | null,
      "outcome": "gated" | "recused" | "operator-judgment",
      "reason": "<recusal rationale or escalation reason, or null when gated>"
    }
  ]
}
```

`conflicts` is only non-empty when `verdict` is `flagged-conflict`.

`agent_signals` carries one entry **per spawned agent** — the generalized
per-agent signal that subsumes the former `recusals` list. Every agent
reports a `confidence` (the `Confidence: high|medium|low` enum, `null` when
absent) and an `outcome`:

- `gated` — a normal gating verdict (`approved`/`flagged`); its findings, if
  any, are in the findings lists.
- `recused` — the agent declared its domain non-applicable (verdict
  `recused`). Not a finding, does **not** gate — a panel of
  all-approved-plus-recused is still `approved`. `reason` carries the
  non-applicability rationale.
- `operator-judgment` — the agent escalated (a reviewer's
  `VERDICT: operator-judgment-required`, or any agent's `Escalation:` line).
  A human must decide; `reason` carries the escalation rationale.

The per-agent `confidence` exists so a downstream consumer can compare
confidence across the implement-verify-fix stages; that comparison and the
loop-layer routing of `operator-judgment-required` to a human are deferred
consumers — this skill surfaces the signal, it does not yet act on it.

## Process

1. **Validate inputs.**
   - If `agents` is empty, refuse with `guild-validate-error: empty agents list`.
   - If `packet` is missing or empty, refuse with `guild-validate-error: missing packet`.
   - Do not validate that named agents are role-typed `evaluator`. The
     substrate doesn't enforce this; if a non-evaluator is passed,
     `guild-spawn` will spawn it and `guild-validate` will attempt to
     parse a verdict from its output. A non-evaluator's output won't
     parse, which surfaces as a `parse-failure` in the aggregated
     output. Caller is responsible for choosing role-appropriate agents.
2. **Spawn evaluators in parallel.** Invoke `guild-spawn` via the
   `Skill` tool with `agents=<input agents>` and `brief=<input packet>`.
   Do not pass `per_agent_context` — every evaluator sees the same packet
   by design. (A future caller wanting domain-specific hints could spawn
   evaluators with per-agent context; this skill does not.)
3. **Parse and aggregate.** Build a JSON array of `{agent, output}`
   entries from `guild-spawn`'s outputs and pipe it to
   `bin/guild parse-and-aggregate` via stdin. The verb returns the
   locked Result shape (`{verdict, blocking_findings,
   advisory_findings, cli_runs, conflicts, agent_signals}`) on stdout.
   Bash invocation
   uses a quoted heredoc so JSON content passes through verbatim:

   ```bash
   guild parse-and-aggregate <<'GUILD_INPUT'
   [
     {"agent": "evaluator-contract-fit", "output": "...full evaluator output..."}
   ]
   GUILD_INPUT
   ```

   The verb is the implementation; the rules below are the spec it
   honors:

   - For each entry, locate `VERDICT:`. `approved` → no findings.
     `flagged` → extract the Reasons section bullets as findings, plus
     the optional Suggested remedies section (paired with reasons by
     index). `recused` → no findings; the evaluator declared its domain
     non-applicable, so its `Reason(s):` rationale becomes an
     `agent_signals` entry with `outcome: "recused"`, and it does not gate
     the verdict. `operator-judgment-required` (or **any** agent emitting
     an `Escalation: <reason>` line, with or without the verdict token) →
     no findings; an `agent_signals` entry with `outcome:
     "operator-judgment"` carrying the escalation reason. An `Escalation:`
     line dominates a contradictory verdict line. Missing/unparseable
     VERDICT line and no escalation → one `parse-failure` blocking finding.
     Every agent also contributes its `Confidence: high|medium|low` (or
     `null`) to its `agent_signals` entry, regardless of outcome.
   - **v1 severity rule**: each reason is `blocking` by default. An
     explicit `BLOCKING:` or `ADVISORY:` prefix on the reason line
     overrides. (Today's evaluators emit unprefixed reasons; Phase 2
     evaluators with antipattern catalogs will emit explicit prefixes.)
   - Each finding has shape `{evaluator, code, evidence, remedy}`.
     `code` defaults to `criterion-unmet`; if the evidence text starts
     with `<word>(-<word>)*: ...` (kebab code prefix, optionally
     backtick-wrapped, optionally with parenthetical context), the
     prefix becomes `code` and the rest becomes `evidence`.
   - CLI runs: v1 evaluators do not emit a `## CLI runs` section, so
     `cli_runs` stays empty. Forward-compat infrastructure for Phase 2.
   - Verdict precedence: any `operator-judgment` outcome →
     `operator-judgment-required` (the strongest non-approval signal — an
     explicit punt to the operator means the panel cannot auto-gate, so it
     outranks everything; blocking findings still surface in their list);
     else `conflicts` non-empty → `flagged-conflict`; else
     `blocking_findings` non-empty → `flagged`; else `approved`.
     Advisory-only is still `approved` — advisories surface but do not
     gate. Recused outcomes never gate either — a recused-plus-approved
     panel is `approved`, with the recusal listed in `agent_signals`.
4. **Emit panel events** (only when `slug` is present; skip this entire
   step otherwise). Record the panel's activity to the project's event
   log via `bin/loom events append`, one event per item. This is
   best-effort observability: it runs *after* the verdict is computed and
   **never** changes it — if an append fails (e.g. `loom` not on PATH in
   a standalone session), log a one-line note and continue to the return
   with the verdict intact. Emission never gates.

   For each `agent` in the input `agents` list (the evaluators that were
   spawned), emit one `evaluator-spawned`:

   ```bash
   loom events append <slug> --event=evaluator-spawned \
     --detail='{"slug":"<slug>","phase":<phase>,"unit":"<unit>","evaluator":"<agent>"}'
   ```

   For each finding in the aggregated `blocking_findings` and
   `advisory_findings`, emit one `evaluator-finding-emitted` (severity is
   `blocking` or `advisory` per which list it came from):

   ```bash
   loom events append <slug> --event=evaluator-finding-emitted \
     --detail='{"slug":"<slug>","phase":<phase>,"unit":"<unit>","evaluator":"<finding.evaluator>","code":"<finding.code>","severity":"blocking|advisory"}'
   ```

   For each `agent_signals` entry with `outcome === "recused"`, emit one
   `evaluator-recused`:

   ```bash
   loom events append <slug> --event=evaluator-recused \
     --detail='{"slug":"<slug>","phase":<phase>,"unit":"<unit>","evaluator":"<signal.agent>","reason":"<signal.reason>"}'
   ```

   The per-evaluator lifecycle this records is `spawned → finding* |
   recused`. `agent_signals` entries with `outcome === "operator-judgment"`
   are surfaced in the returned verdict but get no event here — wiring the
   escalation lifecycle to the operator is a deferred consumer (the verdict
   `operator-judgment-required` is the signal the caller acts on). `loom
   events append` dedupes on (name + detail), so a re-run with identical
   context is idempotent. The detail shapes match the `evaluator-*` event
   types in `commons/cli/lib/types.ts`.

5. **Return** the script's output (parsed back into a structured
   value) to the caller. This skill performs no further work.

## Conflict detection (v1: future-work)

A conflict is two evaluators emitting blocking findings on the same
scope (file path, file:line, or named symbol) with **incompatible**
remedies — that is, applying both remedies would leave the artifact
broken.

In v1, conflict detection is a documented no-op:
- For single-evaluator panels (e.g. `[evaluator-contract-fit]` as
  used by ev-loop in unit 4), only one evaluator can fire, so
  conflicts cannot exist by definition. Return `conflicts: []`.
- For multi-evaluator panels (Phase 2+ when a11y, nextjs, react,
  tokens, naming evaluators land), the detection mechanism needs a
  shared scope-and-remedy comparison rule. That logic is a Phase 2
  concern and will be added to this skill's process step 4 then.

Until then, `flagged-conflict` is a verdict the API supports but v1
does not produce. Loops can write conflict-handling code that's ready
when it does.

## Aggregation rules (summary)

| Findings present | Verdict |
|------------------|---------|
| None of any kind | `approved` |
| Advisory only (no blocking, no conflicts) | `approved` (advisories preserved) |
| Blocking, no conflicts | `flagged` |
| Conflicts detected | `flagged-conflict` |

## What this skill does NOT do

- **Iterate or retry.** If the panel returns `flagged`, the caller
  decides whether to re-spawn after the generator addresses the
  remedies. This skill returns one verdict per call.
- **Auto-resolve conflicts.** When `flagged-conflict` fires, the
  conflicts list surfaces unaltered. The calling loop decides whether
  to surface to the human, auto-pick by precedence, or whatever the
  style layer prefers.
- **Validate evaluator role-typing.** Any named agent can be passed.
  Non-evaluators will produce parse-failures, which the caller sees
  in the output. The substrate doesn't gatekeep.
- **Modify the packet.** The packet passes through `guild-spawn`
  verbatim and is handed to every evaluator unchanged.

## Rules

- **Compose `guild-spawn`.** Do not call the `Agent` tool directly.
  The layering is the point.
- **Lock the output shape.** Even when v1 leaves fields empty,
  the structure is what downstream callers depend on.
- **No emojis.**

## Failure modes

- Empty `agents` list → `guild-validate-error: empty agents list`. Stop.
- Missing or empty `packet` → `guild-validate-error: missing packet`. Stop.
- `guild-spawn` itself errors (e.g. invalid agent name) → forward the
  error verbatim to the caller. Do not partially aggregate.
- One or more evaluator verdicts are unparseable → record
  `parse-failure` blocking findings for those evaluators; aggregate
  the rest normally; verdict is at minimum `flagged`.
- Every evaluator's output fails to parse → `verdict: flagged` with
  every entry in `blocking_findings` carrying a `parse-failure` code.
  The caller distinguishes "everyone said it's broken" from "the
  panel itself can't read what was returned."
