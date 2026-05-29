# 2026-05-28-ev-loop-pr-flow interview

The walked decision tree for `/loom-plan`. One section per resolved question, with the operator's answer and the rationale.

## Q1 — Scope shape: one project or two?

**Recommendation**: One project, two phases.

**Answer**: One project, two phases (recommended). Phase 1 auto-resume, Phase 2 PR body template — locked at this round but flipped at Q5.

**Rationale**: Both threads share a single observation — the PR boundary is the ev-loop's primary contact with humans, underspecified at both the orchestration seam (when does the loop resume?) and the content seam (what shape is the PR?). One project lets the dossier reason about the boundary holistically. Each phase ships as its own PR; independent shippability preserved.

## Q2 — Auto-resume mechanism shape: known approach or wide open?

**Recommendation**: Wide open — let research enumerate.

**Answer**: Wide open (recommended).

**Rationale**: Multiple plausible shapes (in-session polling, ScheduleWakeup, Monitor + background process, hybrid, webhook). Picking before research locks out alternatives. Research returned 6 candidates with a clear recommendation: new `loom pr wait` verb + `§ Wait for merge` recipe, polling implementation behind a stable interface.

## Q3 — Phase ordering: which thread first?

**Recommendation**: Phase 1 = Thread 2 (PR conventions), Phase 2 = Thread 1 (auto-resume).

**Answer**: Phase 1 = Thread 2, Phase 2 = Thread 1 (recommended).

**Rationale**: Low-risk doc work first; new substrate verb second. Matches the operator's setup → bulk → cleanup decomposition pattern. Phase 2's own PR can be composed under Phase 1's codified spec — small dogfood of the spec on a real Architectural PR.

## Q4 — Stale-doc bug at SUBSTRATE-COMPOSITIONS.md:291-293: fold in or split?

**Recommendation**: Fold into Phase 1.

**Answer**: Fold into Phase 1 (recommended).

**Rationale**: Phase 1 already edits the same recipe. Fixing the contradiction adjacent to the body-shape spec keeps the doc internally consistent. Cheap; no good reason to split.

## Q5 — Where does the wait live?

**Recommendation**: Router step 3 in `/ev-run`.

**Answer**: Router step 3 (recommended).

**Rationale**: The wait lives where the blocker is already surfaced. Closing loops stay clean (they exit after `§ Compose PR` like today); the router takes responsibility for dispatch-blocked-on-merge. Single call site, both ev-loops benefit uniformly.

## Q6 — Polling cadence + timeout defaults?

**Recommendation**: 30s interval, 1hr timeout.

**Answer**: 30s interval, **30min timeout** (operator-customized).

**Rationale**: Operator prefers a tighter window before bailing — the timeout is for the rare case where the session sits while a slow review is in flight. 30min covers the "I'll merge this after lunch" case; longer waits are better handled by the operator coming back to a fresh `/ev-run` invocation.

## Q7 — Wait recipe scope: which ev-loops?

**Recommendation**: Both ev-loops via `/ev-run` step 3.

**Answer**: Both ev-loops via router (recommended).

**Rationale**: Router-step-3 placement automatically covers both. No per-loop forking; the recipe is composed once at the convergence point.

## Q8 — Verb namespace?

**Recommendation**: `loom pr wait`.

**Answer**: `loom pr wait` (recommended).

**Rationale**: Lives alongside `loom pr open` / `update` / `discover` / `respond` in the existing `pr` namespace. Same surface (operates on PR state via `gh`). Composes cleanly with the rest of the `pr` verbs.

## Q9 — Archetype override syntax in PLAN.md?

**Recommendation**: `**Archetype**: <name>` block in the phase heading.

**Answer**: `**Archetype**: <name>` block (recommended).

**Rationale**: Mirrors existing `**Whiteboard**:` / `**Engineers**:` blocks already parsed by `loom parse-plan`. Discoverable from existing convention. Lives next to other phase metadata in PLAN.md.

## Q10 — Archetype selection at compose time?

**Recommendation**: Default to Architectural; override via PLAN.md phase metadata.

**Answer**: Default Architectural + PLAN.md override (recommended).

**Rationale**: Substrate-repo PRs are overwhelmingly Architectural (Motivation → Solution → Verification). Default captures the common case; per-phase override handles the rare migration/refactor.

## Q11 — Per-unit-section shape?

**Recommendation**: Markdown action table (`| Action | Target |`), one row per unit.

**Answer**: Markdown action table (recommended).

**Rationale**: Mirrors PR #132's table shape — dense, scannable, easy to compose mechanically from checkin records. Per-unit prose stays in the leading paragraph; table rows give at-a-glance unit boundaries without exhaustive file dumps.

## Q12 — Auto-mode behavior for the wait?

**Recommendation**: Silent poll until merge or timeout.

**Answer**: Silent poll (recommended).

**Rationale**: No per-poll output in the transcript; single entry-line ("waiting for PR #X, timeout 30min") and single exit-line ("merged" or "timeout"). Quietest fit for non-interactive runs; uniform with the rest of `--mode=auto` posture across the substrate.

## Q13 — Checklist content: substrate-specific items only, or merge with operator's PR template?

**Recommendation**: Patreon-shape items + substrate items, adapt-at-compose-time.

**Answer**: **Patreon items only** (operator-overrode to drop substrate-specific items).

**Rationale**: Operator's PR template (verified-solution-works / added-tests / internationalized text / audited a11y) takes precedence over substrate-specific items (sync-shared / panel verdict). Substrate-specific concerns surface at compose time per the operator's CLAUDE.md "adapt to fit" rule rather than being baked into the universal spec. The substrate's recipe carries the operator's template; agents-boulder-specific items live in operator practice, not in the codified spec.

## Q14 — Rollout body content?

**Recommendation**: Patreon-shape Rollout items, drop product-specific framing.

**Answer**: Patreon-shape Rollout items (recommended).

**Rationale**: Rollback-safe-within-48h + feature-flag + experiment items match the operator's template. Substrate-inapplicable items strike at compose time. Drops product-specific framing (no "watch dashboard X") that doesn't fit substrate work.

## Q15 — Body length target?

**Recommendation**: Under 2 minutes / ~300 words total.

**Answer**: Under 2 min / ~300 words (recommended).

**Rationale**: Operator pushback on the confessional tone of current PRs (multi-paragraph Motivation blocks, command output blockquotes). Tight length forces WHY-density; the diff supplies the HOW.

## Q16 — Body voice / tone rule?

**Recommendation**: Terse + direct, third-person.

**Answer**: Terse + direct, third-person (recommended).

**Rationale**: "Phase 2 retires X because Y" — state the change and the why; trust the reviewer to read the diff. No hedging, no agent-self-narration. Third-person keeps the agent from forcing first-person voice mimicry that often falls flat.

## Q17 — WHY-over-HOW enforcement rule?

**Recommendation**: Spec includes load-bearing "don't re-narrate the diff" rule with good-vs-bad examples.

**Answer**: Load-bearing rule with examples (recommended).

**Rationale**: Soft prose guidance won't catch drift. Explicit rule + examples gives sub-agents a concrete bar to write against. If drift still persists after Phase 1 lands, the deferred lint evaluator from RESEARCH.md § Thread 2 candidate (d) becomes the escalation.

## Q18 — Title bracket prefix `[<area>]`: codify into the spec?

**Recommendation**: In scope — codify as required title prefix.

**Answer**: In scope — required prefix (recommended).

**Rationale**: 9/10 of recent PRs already use the pattern. Cheap codification; high-readability win for PR history scanning. Surfaced by the evaluator panel as a scope-sharpness gap; folded into Phase 1.

## Q19 — Phase-close coda sections (`## What's next` etc): in or out?

**Recommendation**: In scope — codify as optional section for phase-close PRs.

**Answer**: In scope — optional section (recommended).

**Rationale**: Pattern appears in 2/10 of recent PRs as a sanctioned signal of phase-transition context. Documenting it gives sub-agents a slot rather than inventing one. Surfaced by the evaluator panel as a scope-sharpness gap; folded into Phase 1.

## Q20 — Spec opinionation vs original "few touch points" ask: confirm heavier shape?

**Recommendation**: Yes — heavier shape is justified by the diagnosed problem.

**Answer**: Heavier shape confirmed (recommended).

**Rationale**: The interview's pushback on confessional tone reframed the problem from "a few touch points" to "structural + voice + length + WHY-over-HOW spec." The heavier shape is the fix for the diagnosed friction. Surfaced by the evaluator panel as `contract-ask-drift`; confirmed in plan-revision round.
