# Throwaway demo results: guild-validate panel as a `parallel()` workflow

**Date**: 2026-05-28
**Branch**: `ev-agent.workflows-parallel-adoption.demo` (throwaway — not for merge)
**Design doc**: `projects/WORKFLOWS-PARALLEL-ADOPTION.md`
**Disposition**: validation artifact. The fixture, the prototype verb, and the workflow are all disposable; this file and the design-doc updates are the durable output.

## What was tested

The full guild-validate panel path, run as a dynamic workflow instead of the inline `/guild-validate` skill:

```
demo/fixture/{Widget.tsx,Widget.module.css}   planted-issue fixture
        │
        ▼  (stdin)
guild derive-panel                             → bare logical evaluator names
        │
        ▼
demo/derive-workflow-agents.mjs                → workflow-registry agentTypes (prototype mapping verb)
        │
        ▼  (args)
.claude/workflows/guild-validate-demo.js       → parallel() spawn of 5 evaluators
        │
        ▼  (Bash-wrap, inside the workflow)
guild parse-and-aggregate                      → locked verdict shape
        │
        ▼
returned to orchestrator: the verdict ONLY (raw transcripts stay in script memory)
```

Runs: smoke test `wf_7dd4b621-ef8`; panel run `wf_c3564478-de7` (6 agents, ~126k subagent tokens, 88s).

## Proven (green)

| Claim | Result |
|---|---|
| A real multi-evaluator panel runs end-to-end as a workflow | **Yes.** 5 evaluators (`guild:retained:evaluator-contract-fit` + `guild:generated:evaluator-{a11y,nextjs,tokens,naming}`) spawned via `parallel()`, all resolved and ran. |
| The `retained` and `generated` namespaces both resolve | **Yes.** Both sub-namespaces spawned successfully in one panel. |
| Mediation via the real verb, Bash-wrapped inside the workflow | **Yes.** `guild parse-and-aggregate` returned the locked shape: `flagged`, 13 `blocking_findings`, empty `advisory_findings`/`cli_runs`/`conflicts`. |
| Evaluator quality survives the workflow path | **Yes.** Every planted issue caught (missing `alt`, hex/px literals, inline literal style, raw `<a href>`), plus an unplanted naming catch (`href`/`imageSrc` vocab mismatch). |
| Workflow agent has the plugin CLIs on PATH, cwd = repo root | **Yes** (smoke test `wf_7dd4b621-ef8`). |
| `parallel()` fan-out + error containment | **Yes.** Ordered results; `.catch` traps a single agent failure without failing the run. |

## Context measurement (the economic case)

Per-evaluator output that stayed inside the workflow's script memory:

| Evaluator | chars |
|---|---|
| `guild:retained:evaluator-contract-fit` | 2,251 |
| `guild:generated:evaluator-a11y` | 1,698 |
| `guild:generated:evaluator-nextjs` | 1,402 |
| `guild:generated:evaluator-tokens` | 1,452 |
| `guild:generated:evaluator-naming` | 2,210 |
| **Total raw transcripts** | **9,013** |

| Mode | What the orchestrator absorbs | chars |
|---|---|---|
| Inline `/guild-validate` | 5 raw transcripts (returned by guild-spawn) **+** the aggregated verdict | ~15,875 |
| Workflow | the aggregated verdict only (raw stays in script memory, then discarded) | ~7,162 |

**~55% less orchestrator context for this run** (≈9,013 chars / ≈2.2k tokens of raw transcripts kept out). This is the **floor**: the verdict here was unusually large (13 findings, 6,862 chars). On an `approved` or thin verdict the workflow returns ~100 chars and the saving approaches ~99%. Total *work* (subagent tokens) is identical between modes; the difference is entirely in what the scarce orchestrator context window absorbs — and the saving compounds across every panel run in a multi-unit phase.

## Findings the demo surfaced (none were proven in the design doc before)

1. **Logical↔on-disk name drift breaks a naive mapping.** `guild derive-panel` emits `evaluator-react-api`, but the agent file (and workflow agentType) is `evaluator-react`. The prototype verb's tree-walk correctly mapped the other five and reported `evaluator-react-api` as unmappable (exit 1). **The real mapping verb must own a normalization, not just a directory lookup.**
2. **`derive-panel` silently fell back.** Run from the plugin-cache binary, it printed `panel-spec-unreadable (using fallback)` — its cwd-relative `plugins/commons/docs/PANEL-COMPOSITION.md` path does not resolve outside the dev repo, so it used hardcoded fallback rules (which themselves carry the stale `evaluator-react-api` name). Substrate-health smell, independent of workflows.
3. **Structured `args` cross the Workflow boundary as a JSON string.** `args.agentTypes` was `undefined` until the script guarded with `typeof args === 'string' ? JSON.parse(args) : args`. Any workflow taking structured args needs that guard.
4. **`parse-and-aggregate` reason↔remedy pairing is fragile.** Several findings came back with empty or shifted `remedy` fields (one naming finding's remedy held a11y-deferral prose). The verb pairs `reasons[i]` with `remedies[i]` by index; evaluators that emit asymmetric reason/remedy counts misalign. Incidental, pre-existing, not workflow-specific — but visible here.

## Conclusion

The design in `WORKFLOWS-PARALLEL-ADOPTION.md` is mechanically sound: the panel runs as a workflow, mediation stays behind the real verb, and the context win is real and measured. The one seam that needs a deliberate owner — confirmed, not theorized — is the agent-name mapping (finding 1): it must live behind a guild verb that normalizes logical names to workflow-registry agentTypes, never hardcoded in workflow scripts.
