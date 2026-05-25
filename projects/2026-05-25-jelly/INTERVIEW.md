# Interview: Jelly substrate

Walked during `/loom-plan` session on 2026-05-24 → 2026-05-25.

## Q1 — Dependency posture between jelly-* and existing guild + loom plugins

**Recommendation**: Parallel (linear-loom precedent) — jelly-* lives alongside guild + loom; per-project substrate choice; both families coexist.

**Answer**: Parallel. Selected as recommended.

**Rationale**: matches the operator's prior pattern with linear-loom; lowest blast radius; no migration story needed. Cost: marketplace gets larger (12 plugins instead of 8); some duplication between loom and jelly-loom acknowledged as acceptable.

## Q2 — Manifest format

**Recommendation**: TOML — human-readable, supports comments, industry-standard for manifests.

**Answer**: Operator: "I don't really care about the format, but I want to avoid conflicts where possible. Especially in the case of parallel work." Format defaulted to TOML; the substantive question pivoted to manifest SHAPE (Q3).

**Rationale**: format itself is secondary; the load-bearing constraint is merge-conflict surface in parallel branches. TOML chosen for readability without further deliberation.

## Q3 — Manifest shape (what's in vs derived)

**Recommendation**: Identity + phase declarations (no status). Phase status derived from git + Linear.

**Initial answer**: Identity + phase declarations (no status). Selected as recommended.

**Refinement (Q8 reframe)**: Richer write-once manifest config acceptable as long as the constraint of "no PR mutation" holds. Final shape: identity + `[config]` table (write-once defaults) + `[[phases]]` declarations + references (`plan_file`, `research_file`, `adr_log`).

**Rationale**: parallel-work merge conflicts come from per-PR mutating fields (`current_branch`, `latest_checkin` were the dominant pain in linear-loom). Write-once data is conflict-safe regardless of how much there is. The operator wanted richer lookup support, not poorer PR hygiene; both are achievable.

## Q4 — PLAN.md structure

**Recommendation**: Goal + phases-as-sub-goals (no recipe).

**Answer**: Operator refined: PLAN.md is GOAL + EXIT REQUIREMENTS + sequential/risk constraints; NOT a specific breakdown of super details. The lead agent decomposes implementation. RESEARCH.md provides factual findings; both documents kept current via `jelly revise`. The hierarchy is project > milestone > phase > task, where tasks are the lead-agent's run-time decomposition (NOT declared in PLAN.md).

**Rationale**: PLAN.md as a static document conflicts with run-time fleet behavior — the lead agent has more context than the plan author. Letting the lead decompose phase into tasks at /goal-time gives the substrate the right flexibility while preserving operator control via the PR review gate.

## Q5 — Review gate placement

**Recommendation**: PR-only gate (lean cadence).

**Answer**: PR-only. Selected as recommended.

**Rationale**: operator stated explicitly that they want to review each PR with back-and-forth before merging, but does NOT want a separate pre-execution scope-confirm gate. The PR description (composed by the lead agent at `/goal`-time) IS the scope statement the operator reviews against. Feedback round-trip via PR comments; merge gates the cadence.

## Q6 — Marketplace plugin shape

**Recommendation**: Four plugins (three substrate + one meta-bundle).

**Answer**: Four plugins. Selected as recommended.

**Rationale**: matches the `agent-loop-full` precedent. Operators can install individually or via the meta-bundle. Cascade-install of commons + jelly-guild + jelly-loom + jelly-run via the `jelly` meta-bundle's marketplace dependency declaration.

## Q7 — Project decomposition for building jelly

**Recommendation**: Three milestones, six phases (M1 substrate, M2 orchestration, M3 dogfood).

**Answer**: Selected as recommended.

**Rationale**: Phase 1.1 (verify empirical assumptions) ships before architectural commitments — protects against architectural rework after substrate is half-built. Phase 1.2 + 1.3 (jelly-guild + jelly-loom) listed sequentially in PLAN.md but are non-dependent on each other; operator or lead agent may choose to parallelize the PRs based on review pacing. M2 builds on M1. M3 validates against real workstream — operator picks dogfood topic at phase start.

## Q8 — Risks + ADR location

**Recommendation**: Six risks listed; ADRs at `projects/<slug>/adrs/NNNN-<slug>.md` per-project.

**Answer**: Risks accepted as listed. ADRs at `projects/adr-log/` (workspace level, NOT per-project) — sequential global numbering. Also: operator clarified that richer manifest config is acceptable as long as the "no PR mutation" constraint holds (this fed back into Q3's refinement).

**Rationale**: ADRs are workspace-architectural (span multiple projects); a workspace-level adr-log captures them in one searchable place. Sequential global numbering avoids per-project numbering schemes diverging. Operator's framing: "I don't want PRs polluted with tons of lines a human reviewer doesn't care about" — the gate is PR hygiene, not data parsimony in static documents.

## Q9 — Resolve open questions before commit

**Recommendation**: Close the 5 open questions that are answerable now (via docs or policy decision); leave only those requiring empirical probe.

**Answer**: Operator: "can we answer the open questions?" Closed 4 of 5 via docs + policy:

1. **Outcomes composability** (closed via docs): Outcomes uses an auto-provisioned grader reading a rubric markdown document; it does NOT dispatch to custom subagents. Per `platform.claude.com/docs/en/managed-agents/define-outcomes`.
2. **Feedback round-trip trigger** (closed as policy): explicit operator re-invocation — `/jelly-run <slug> "address feedback on #N"` — after operator leaves PR comments. No polling, no webhook.
3. **Migration story** (closed as policy): out of scope. Existing loom-backed projects stay on loom; jelly is opt-in at project-birth time.
4. **Outcomes rubric authoring** (closed as consequence of Q1): jelly-guild ships paired files per specialist — subagent body in `agents/` (Skill-callable) + rubric in `rubrics/` (Outcomes-callable). Same content, two surfaces, manually-synced in v1.

**Still open** (requires empirical probe):

5. **Project-subdir CLAUDE.md propagation under `/goal`**: documented as inheritance behavior + confirmed empirically for repo-root CLAUDE.md via the prior probe at `/Users/krambuhl/Sites/goal-substrate-probe/`, but NOT yet probed for `projects/<slug>/CLAUDE.md` specifically. Phase 1.1 owns the verification.

**Rationale**: closing the 4 answerable questions tightens the plan pre-commit — leaves only honest empirical uncertainty in the Open questions section. Phase 1.1 simplifies as a consequence: the Outcomes probe drops; only the CLAUDE.md subdir probe remains. The plan is more complete and the first phase is sharper.
