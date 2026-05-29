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

---

# Integration test: loop↔workflow interleaving + kill recovery (2026-05-29)

A throwaway loom project (`projects/2026-05-29-workflow-integration-test/`, hand-authored manifest) drove a real loop sequence around real workflow runs. All five complex issues resolved.

**Setup notes:** the installed loom (`dcb9e71817d0`) reads the current manifest format (`doctor` ok — no repo-local fallback; skew is per-plugin, loom fresh while guild `af4bc8…` is stale). Manifest is consolidated TOML: `[meta]`/`[config]`/`[[phases]]`/`[[events]]`/`[[checkins]]` — events and checkins live *in* the manifest, appended in order. `project scaffold` requires `--plan-file`/`--config-file`/`--manifest-init-file` (it's `loom plan`-driven; hand-authoring the manifest was the throwaway shortcut).

## Part 1 — interleaving + coherence (phase 1, branch `wfi-probe-1`)

Drove: phase→in-progress → checkin 01 (negotiation) → **fire guild panel workflow (`wf_ce71346b-692`), await verdict** → checkin 02 (verdict recorded) → phase→completed.

- **Manifest coherence holds, and it's *enforced*.** Writes use optimistic concurrency (`readManifestFile → token`, `writeManifest({expect: token})`) — a write computed against a stale read is rejected, not silently merged. Category-3 coherence is a compare-and-swap, not just a convention.
- **Event ordering is a coherent narrative:** `phase-started → checkin-created(01) → checkin-created(02) → phase-completed`. The ~2-minute gap between the 01 and 02 events is exactly the workflow window. The read-only workflow wrote nothing to loom, so it cannot scramble the trail.
- **Checkin numbering monotonic** (01 → 02, per-branch partition).
- **Cat-2 collision guard works:** re-writing checkin 01 → `checkin-already-exists` (loud, not a silent overwrite).

## Part 2 — kill-mid-run recovery (phase 2, branch `wfi-probe-2`)

Drove: phase→in-progress → checkin 01 (pre-workflow checkpoint) → **fire a write-heavy workflow (30 Cat-1 appends), `TaskStop` mid-run.**

- **Cat-1 appends are atomic even under a kill:** 29 of 30 landed; **29/29 parseable, 0 half-written.** A killed workflow leaves complete records, never torn ones.
- **Later phases interrupted:** `kill-test-whiteboard.md` absent — the assemble phase never ran; the kill cut the workflow mid-flight.
- **loom recovery point is clean:** phase 2 still `in-progress`, checkin 01 present, **no resolution checkin, zero workflow-originated events.** loom sits exactly at the pre-workflow checkpoint. The loop recovers from loom (workflow-resume is in-session-only and gone with the kill).
- **Crash-window verdict:** between "workflow done" and "loop records the verdict," a crash loses the in-flight work as **orphaned scratch appends + double work on re-fire — never loom corruption.**

## Finding

`meta.latest_checkin` is vestigial: `checkin write` never populates it (stays `null`); the real latest is derived via `loom checkin latest`. `ev-run`'s prose ("latest checkin from manifest's `latest_checkin`") is either stale or mis-orients — documented-vs-actual drift, same family as the dangling-generator refs.

## Verdict

The hybrid is sound: a loop fires a read-only workflow mid-unit, awaits it, and records the result with loom's manifest/checkin/event invariants intact across the async boundary; a killed workflow degrades to recoverable double-work, never corruption. Empirical backing for **loom is the durable spine; workflows are a safe, ephemeral leaf.**

---

# Schema-output probe (run `walh8d33b`, 2026-05-29)

Pre-research probe: can guild evaluators authored for `VERDICT:` prose be coerced into structured output via the workflow's `agent({schema})`?

- **Both complied, no quality loss.** `evaluator-a11y` → `flagged`, 2 findings; `evaluator-tokens` → `flagged`, 3 findings; all with well-formed `{code, evidence, remedy}`, and the a11y lens still cross-flagged the token-contrast angle. The prose→schema switch did not degrade the findings (arguably sharpened them).
- **`schema_native_merge_worked: true`** — a trivial JS merge of the structured outputs replaced `parse-and-aggregate` for basic aggregation; no Bash-wrap verb needed on the schema path.
- **Caveat:** the simple schema only replaced the simple parse. `parse-and-aggregate`'s *policy* (severity blocking/advisory, precedence, conflict detection) is not captured by structure alone — it would move into the schema or the JS merge, not vanish.

Implication for "workflows-style agents": they are likely **the existing agents + a schema**, not a new authoring template — but that opens a dual-output-contract question (prose for the skill path vs. schema for the workflow path) that the research must resolve. This was the last validation piece; the remaining work is design.
