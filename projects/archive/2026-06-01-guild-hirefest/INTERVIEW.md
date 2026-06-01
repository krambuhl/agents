# INTERVIEW — guild-hirefest

The walked decision tree. One heading per resolved question: recommendation, the answer, the rationale.

## 1. Hire breadth — which domains get write-capable postures?

**Recommendation:** gated wave order (hold judgment-heavy domains naming/a11y/react for human-paired).

**Answer (reframed):** Reject the gating premise. Hire the **full roster**; make "knowing your limits" a runtime property of each agent. An agent attempts the work and, when it (and the codebase and the other pipeline agents) cannot lift confidence, raises a sanctioned **operator-judgment-required** escalation instead of guessing.

**Rationale:** Safety as deployment-time exclusion is paternalistic and leaves capability on the table. The constraint-aware model is more honest and matches how the substrate already leans (advisory/blocking findings, `recusals`, `flagged-conflict`). naming/a11y/react get implementers; they escalate sooner. Wave order survives only as rollout *sequencing* (mechanical-first to prove the pattern), not exclusion.

## 2. The `research[whiteboard]` posture — rename or keep?

**Recommendation:** keep `whiteboard`, treat as research; defer the rename.

**Answer:** Rename — initially `whiteboard` -> `research`; later refined (see Q7) once the loom-RPI alignment surfaced.

**Rationale:** Naming is architecture; the read-only explorer deserves a truer name. The refinement in Q7 corrected *which* name.

## 3. Deployment refinement — this plan or a follow-on?

**Recommendation:** final phase of this plan.

**Answer:** Separate plan after hiring lands.

**Rationale:** Design deployment against the real, full roster rather than a hypothetical one. Keeps this plan a sharp single thread (staff the roster); deployment gets its own `/loom-plan`.

## 4. Constraint-awareness + escalation — where does it live?

**Recommendation:** fusion-template / phase fragment (uniform).

**Answer:** Fusion-template / phase fragment.

**Rationale:** One edit, whole roster inherits it, consistent across recompiles. Matches "a full roster of agents that know their constraints."

## 5. Escalation trigger — when can an agent escalate?

**Recommendation:** self-assessment AND convergence-failure.

**Answer:** Self-assessment AND convergence-failure.

**Rationale:** Matches the stated need: an agent escalates when IT can't reach a bar, AND the pipeline escalates when implementer->verifier->fixer can't lift confidence ("other agents couldn't help"). Same outcome, raised from either level.

## 6. Design-exploration (meta) domains — write postures?

**Recommendation:** research-only, constraint-aware.

**Answer:** Research-only, constraint-aware.

**Rationale:** abstraction/composition/performance/substrate have no concrete artifact to write or verify-gate. Full roster means every agent knows its lane, not every domain gets every posture.

## 7. Explorer-posture reconciliation (surfaced by the naming evaluator)

**Context:** the panel flagged that `axes.toml` already has two read-only-explore postures — `planner` (synthesizer, where whiteboards live) and a vestigial unused `researcher` (methodical). The rename had to resolve them.

**Recommendation:** offered three options (collapse to one `research`; two distinct postures; rename-and-keep-both).

**Answer:** Align to loom's RPI loop. `loom research` <-> guild `research` (methodical); `loom plan` <-> guild `plan` (synthesizer); `loom implement` <-> implementer/reviewer/fixer. The two postures are **distinct because they are different RPI phases** — `whiteboard` is the *plan* posture, and `research` is the distinct (formerly-vestigial) posture to be staffed.

**Rationale:** The cleanest resolution dissolves the collision instead of picking a side: a member's posture tells you which RPI phase it serves. Corrects the original instinct — whiteboard is plan, not research.

## 8. Plan-posture name — rename `whiteboard-*` or keep the metaphor?

**Recommendation:** rename `whiteboard-*` -> `plan-*`.

**Answer:** Rename `whiteboard-*` -> `plan-*`.

**Rationale:** Token consistency across loom and guild (phase `plan` = agent `plan-*` = `loom plan`). Kills the whiteboard/planner/plan three-name smell; retires the metaphor.

## 9. Research staffing — this plan or defer?

**Recommendation:** staff research in this plan.

**Answer:** Staff research in this plan.

**Rationale:** Completes the RPI roster the effort is going for; the posture is genuinely unstaffed (zero agents), so leaving it out would ship a half-roster.

## 10. Research domain coverage

**Recommendation:** everywhere `plan` exists (full RPI symmetry).

**Answer:** Everywhere `plan` exists.

**Rationale:** Investigation precedes both planning and implementing; research is read-only and low-risk; symmetric. Includes the meta domains (research existing patterns before exploring design).

## 11. Escalation confidence signal — structured or prose?

**Recommendation:** structured self-rating.

**Answer:** Structured self-rating.

**Rationale:** The convergence-failure path must be machine-detectable — the aggregator compares confidence across implementer->reviewer->fixer. A structured enum/score enables that; prose does not.

## Decided without a separate question (operator + evaluator panel)

- **Vocabulary key:** `reviewer` = `verifier` (diagram) = `evaluator-*` (agent surface, documented alias, not re-tokenized). Adopted after the naming evaluator flagged the triple.
- **Phase-token form:** bare-verb (`research`/`plan`), load-bearing for the three-way alignment.
- **Wave PRs:** one PR per domain (each domain is its own conceptual unit / verify grant), per the decomposition philosophy.
- **implementer vs fixer:** distinct postures — implementer builds from a spec (stop = meets spec); fixer applies the minimal correction to a flagged artifact and re-verifies (stop = findings cleared). Surfaced by the operator's probe; the `fusion-prompt.md` fixer block (Phase 1) makes fixer first-class.

## Evaluator panel

- `evaluator-contract-fit`: **approved** (3 advisories, all folded in — promote the reviewer-gap inventory, assert the escalation round-trip, promote the resolved open question to a decision).
- `evaluator-naming`: **flagged** on the first pass (3 blocking: whiteboard/research/researcher collision, verifier/reviewer/evaluator triple, unsplit Phase 2), then **approved** after the RPI realignment + vocabulary key + Phase-2 split.
