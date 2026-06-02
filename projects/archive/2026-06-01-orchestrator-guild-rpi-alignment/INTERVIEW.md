# Interview: orchestrator-guild-rpi-alignment

The decision tree walked during `/loom-plan`, one resolved question per heading.

## Q1 — How to ground the plan

**Recommendation:** spawn `/loom-research` (auto) — the surface (5 orchestrators × 5 phases × routing) is large enough that the plan should rest on a verified current-state map rather than my read.

**Answer:** Spawn `/loom-research` (auto).

**Rationale:** Produced `RESEARCH.md` (commit `ca8a032`) with a cited orchestrator×phase consumption matrix and the disk-vs-registry diagnosis. Both turned out load-bearing. Executed via a fresh-context `general-purpose` agent invoking the skill, because `loom-research` is `disable-model-invocation: true` and not a registered subagent type.

## Q2 — Participate-vs-recuse model

**Recommendation:** phase-parameterized `derive-panel` reading `axes.toml`'s domain×phase lists as SoT, runtime self-recusal retained, `/guild-plan` emits `agent_signals`.

**Answer:** Phase-parameterized derive-panel + axes.toml SoT.

**Rationale:** `axes.toml` already encodes phase×domain participation (research Finding 5); only codegen reads it today. Generalizing the existing composition verb is less machinery than a new layer and keeps the runtime self-recusal backstop for artifact specifics the table can't see.

## Q3 — implementer/fixer depth

**Recommendation:** (offered three depths) — wire composition+signal now, delegate later; full delegation; or leave out entirely.

**Answer:** Full delegation this plan.

**Rationale:** Operator chose the most complete RPI alignment — the loops delegate the actual write/fix to domain guild agents, not just compose them. Accepted the tradeoff that it's a real behavioral change unverifiable by live-spawn until the registry refreshes.

## Q4 — Which loops get delegation

**Recommendation:** both loops, delegation behind a per-unit switch (interactive default-off, confidence default-on).

**Answer:** Both loops, per-unit switch. Operator added: "I like the idea of delegation being an option."

**Rationale:** Preserves `ev-loop-interactive`'s keystroke-level pairing premise (delegation opt-in per unit) while making the seam universal. Delegation is framed as a first-class capability, never a forced path.

## Q5 — Registry-refresh gate

**Recommendation:** final phase does the mirror refresh + live-spawn smoke as the acceptance gate.

**Answer:** Final phase: refresh + live-spawn smoke.

**Rationale:** "Done" should mean the orchestrators actually spawn the new phases at runtime. Phase 3 isolates the refresh so a blocked publish strands only Phase 3, not the source phases.

## Q6 — Adjacent panel gaps

**Recommendation:** (multi-select) loom-plan plan-* panel / loom-revise-plan derive-panel / ev-run panel / none.

**Answer:** loom-plan gains a plan-* panel (only).

**Rationale:** `loom-revise-plan`'s fixed rubric and `ev-run`'s thin-router premise are left intact; only `loom-plan`'s solo grill-me gets multi-perspective design input.

## Q7 — Execution loop

**Recommendation:** ev-loop-interactive throughout (high-craft substrate work).

**Answer:** ev-loop-interactive throughout.

**Rationale:** API shape of the composition layer and the skill control-flow are taste-load-bearing; worth shaping in real time over mechanical-loop speed.
