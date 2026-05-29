# INTERVIEW — substrate-tempering

The walked decision tree for `/loom-plan` against the archived `agent-system-improvements` retro. Each section records one resolved question: the recommendation given, the answer chosen, and the rationale.

## Decision 1 — Scope: which follow-on becomes this plan?

**Recommendation**: Start with the **loom CLI papercut sweep** (the five execution-surfaced gaps) — highest certainty, incremental, de-risks later work — with evaluator-event emission, convention-drift 2.1, and RESEARCH-as-fact-canon as the named alternatives.

**Alternatives offered**:
- Evaluator event emission (the prerequisite Phase 3 lacked; highest leverage).
- Convention-drift 2.1 (whiteboard-* checks; smallest, possibly one PR).
- RESEARCH as fact-canon (items 3+4; append-with-provenance + verb family).

**Answer**: All four — "all of these are worth doing. make a plan that does them in sequence."

**Rationale**: The retro surfaced four coherent follow-on clusters and the operator judged each worth doing. Rather than pick one, the plan sequences all four as one program. They share a reason to change together: each is a punch-list item a real project produced about its own tooling.

## Decision 2 — Plan shape: how finely to slice the program?

**Recommendation**: One plan, ~5 cluster-grained phases (one phase per cluster; cluster B splits into emit-events + aggregate). Per-cluster PR fan-out resolved at execution via `/ev-loop-interactive` unit contracts.

**Alternatives offered**:
- One plan, ~10-12 PR-grained phases (matches the proven phase=PR=branch convention; large PLAN.md).
- Roadmap + four per-cluster `/loom-plan` projects (most modular; four focused retros).

**Answer**: One plan, ~5 cluster-grained phases.

**Rationale**: Honors the operator's explicit "one plan" ask while keeping PLAN.md a readable strategy doc. PR-granularity is pushed to the unit contract — directly citing the prior project's own Decision 10 precedent ("the unit contract at phase start is the right place to resolve granularity"). A 10-12 phase PLAN.md is unwieldy; a roadmap-of-plans is more ceremony than the operator asked for.

## Decision 3 — Ordering: which sequence?

**Recommendation**: A (CLI papercuts) → C (convention-drift 2.1) → B (evaluator observability) → D (RESEARCH fact-canon).

**Answer**: Accepted (stated, not contested).

**Rationale**: Risk-ladder plus dependency. A sharpens the saw — it fixes the execution friction every later phase would otherwise hit, and its `plan-*` event work warms the same event-emission path B extends. C closes the Phase 2 loop while fresh; smallest and independent. B is the self-observation arc, built on the smoother substrate, with B.1 (events) strictly before B.2 (aggregation). D is most orthogonal and most design-heavy, so it goes last and can absorb lessons from A's `loom` CLI work.

## Decision 4 — Research foundation: fresh `/loom-research` or digest the existing material?

**Recommendation**: Attach a self-authored per-cluster digest synthesized from the archived `RESEARCH.md` + retro, rather than spawn a fresh-context `/loom-research` sub-agent.

**Answer**: Accepted (stated, not contested).

**Rationale**: The foundation already exists and is research-grade. Clusters B and D come from the prior dossier's 7-item next-step list; clusters A and C come from the retro's execution-surfaced findings. A fresh sub-agent would re-derive these same sources; the value it could add (re-organizing around *this* plan's four clusters) is exactly what the digest does directly. The prior retro warned the self-observation story over-promised once — re-researching an evidence-anchored dossier is the inverse ceremony. The digest is committed as the project's `RESEARCH.md`, with provenance in `RESEARCH-NOTES.md`.

## Decision 5 — Project slug

**Recommendation**: `substrate-tempering` — the broadest umbrella across all four clusters (papercuts, drift-checks, observability, fact-canon all "harden" the substrate).

**Alternatives offered**: `substrate-quality` (plainer, generic); `substrate-self-awareness` (sharper but undersells A + D).

**Answer**: `substrate-tempering`.

**Rationale**: Names what the program means rather than how it is structured. Becomes `2026-05-29-substrate-tempering` and the `ev-agent.substrate-tempering.<phase>` branch prefix.

## Decision 6 — Loop strategy per phase

**Recommendation**: `/ev-loop-interactive` for all five phases.

**Answer**: Locked by default.

**Rationale**: Each phase is a discrete deliverable (a CLI fix, a script extension, an event addition, a verb), not a bulk transform across many files. `/ev-loop-confidence` (tiered transform / find-replace) maps to none of them. Phase 2 touches many agent files but only to *check* them — the script is the deliverable, mirroring the prior project's Decision 6.

## Decision 7 — PR cadence

**Recommendation**: Stacked via `gt`, sequential, with the Phase-1 Graphite-sync bootstrap (gap 5) unblocking `gt submit --stack`.

**Answer**: Locked by default.

**Rationale**: Standard for this repo; the cluster-grained phases form a natural `gt` stack. The one wrinkle is that Graphite-sync is not yet enabled (it is gap 5, fixed in Phase 1) — so until Phase 1 lands, the stack submits via `gh`. After Phase 1, the intended `gt submit --stack` cadence is available.

## Decision 8 — Verification signals per phase

**Recommendation**: A concrete "ship it" signal per phase beyond "the PR merged" — see PLAN.md Phases. The end-to-end project proof is that `loom events aggregate` (Phase 4) surfaces `evaluator-*` events emitted by a real panel run (Phase 3), demonstrating the two compose.

**Answer**: Locked by default.

**Rationale**: Each phase has a mechanical signal (tests, CI green, a CLI command producing expected output). The cross-phase proof (Phase 3 events visible in Phase 4 aggregation) is the load-bearing one — it is exactly the integration the prior project could not demonstrate because it closed Phase 3.

## Decision 9 — Risks named per phase and project-level

**Answer**: Locked by default (see PLAN.md Phases + Risks).

**Rationale**: The dominant project-level risk is program over-commitment — four heterogeneous clusters in one plan. Mitigation is structural: independently revertable, cheapest-first phases on a sequential stack that delivers value incrementally and can stop cleanly after any phase. Per-phase risks carry their mitigations (parser back-compat, heuristic false-positives, the Phase 3 → 4 hard dependency, verb-family back-compat).

## Decision 10 — Open questions deferred to unit contracts

**Answer**: Locked by default (see PLAN.md Open questions).

**Rationale**: The intra-cluster forks — checkin update flag vs. skill-body canonicalization, parse-plan accept-both vs. migrate, the advisory triage, evaluator event detail shapes, the fact-canon section taxonomy — are unit-contract decisions, not project-level ones. Forcing them into PLAN.md would either pre-commit without enough information or over-specify the contract. Same posture as the prior project's Decision 10.
