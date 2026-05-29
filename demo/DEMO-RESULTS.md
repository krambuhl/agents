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

---

# Write-boundary demo (run `w3hekye55`, 2026-05-29)

Second probe, expanding the first: does loom's parallel-work invariant (`projects/CONVENTIONS.md` — Category 1 append-only / Category 3 single-writer) hold *from inside a workflow*? 10 agents, ~205k subagent tokens, 53s.

## Category-1 append: validated safe

Six parallel workflow agents each appended to one JSONL via the real `griot operator-checks log-intervention` verb. On-disk result:

- 6 lines, all well-formed JSON, **zero unparseable or interleaved**.
- All six distinct workers present (`demo-worker-0` … `-5`), none lost, none duplicated.
- On-disk order was `4,2,0,1,3,5` — *not* worker order — the tell that they genuinely raced and landed in completion order, each line still atomic.

**Category-1 appends are workflow-safe.** griot-compact can log interventions / bench history from inside a workflow without a serialization guard. (Aside: the verb flattens the `record` object to top-level fields; the first verification pass looked under `record.worker`, found nothing, and falsely flagged an anomaly — a reminder that the verification needs verifying too.)

## Category-3 single-writer: validated via guild-whiteboard

Three real whiteboard engineers (`guild:generated:whiteboard-{composition,abstraction,skeptic}`) ran in parallel, read-only, each *returning* a section (1496 / 1028 / 2472 chars, kept in the workflow). A single assembler agent then wrote all three to `demo/scratch/whiteboard.md` (5,176 bytes, 3 sections).

**The Category-3 pattern works as predicted — parallelize the thinking, serialize the write.** Engineers fan out read-only; one writer commits the shared file. Parallel engineers writing the file directly would be the Category-3 collision the invariant forbids; the workflow form routes around it by construction.

## Not tested here (reasoned; recommended as a real-loom-project integration test)

- A real loom **manifest** (Category-3) write interleaved with a workflow across the async await. CONVENTIONS.md already settles that manifest writes are single-writer; only the live interleaving is unproven.
- Kill-mid-run recovery from loom state vs. workflow-resume.

## The boundary, now empirically grounded

| Category | Verb examples | From a workflow? |
|---|---|---|
| 1 — append-only | `loom event append`, `griot operator-checks log-intervention` | **Safe** — validated (6 concurrent atomic appends) |
| 2 — partitioned | `loom checkin write` | Safe with a unique partition (not stress-tested) |
| 3 — single-writer | `loom phase update` (manifest), `guild whiteboard *` | **Serialize the write** — validated via whiteboard; manifest stays in the loop |
