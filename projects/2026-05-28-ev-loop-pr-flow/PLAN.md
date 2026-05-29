# 2026-05-28-ev-loop-pr-flow

Codify the PR body shape the ev-loops produce, then close the operator-resume papercut by waiting for PR merge automatically. Two phases, two PRs, independently shippable.

See [RESEARCH.md](./RESEARCH.md) for the dossier on current PR-flow state, candidate auto-resume mechanisms, and the PR-body touch-point inventory across PRs #123–#132.

## Context

The ev-loops have two friction points at the PR boundary, both surfaced repeatedly by the operator (see RESEARCH.md § Scope of inquiry).

**Friction 1 — manual resume.** When a phase closes, `§ Compose PR` opens or updates the PR, the loop returns to `/ev-run`, and the router (step 3, `plugins/ev/skills/ev-run/SKILL.md:197-210`) surfaces "waiting on PR #X to merge" and stops. The operator types "PR N merged, keep going" once per phase. The primitive for detecting merge already exists — `loom pr discover` returns live `state: MERGED` from `gh pr view` (`plugins/loom/cli/verbs/loom/pr.ts:42-72`); what's missing is the loop-back.

**Friction 2 — drift in PR bodies.** `§ Compose PR` (`plugins/commons/docs/SUBSTRATE-COMPOSITIONS.md:286-289`) currently specifies the body as "typically `## Summary` + per-unit sections + `## Test plan` + `## Rollout` + `## Checklist`." The recipe is wrong about which sections actually appear — `## Summary` shows up in 4/10 recent PRs while `## Motivation` is 10/10 (RESEARCH.md § Touch-point inventory). Worse, recent PRs trend confessional — multi-paragraph Motivation blocks, exhaustive file-action tables, command output blockquotes. They read like the agent showing its work to itself rather than telling the human reviewer what the human needs to know. The recipe spec leaves voice, length, and WHY-over-HOW guidance entirely implicit.

## Scope

### In

- **Phase 1 — Codify `§ Compose PR` body shape.** Rewrite the recipe's body-shape paragraph as an explicit spec: section ordering (Motivation / Solution / Verification / Rollout / Checklist), per-section content rules, length target (~300 words, under 2 min read), tone (terse, direct, third-person), and a load-bearing WHY-over-HOW rule that prohibits re-narrating the diff. Default archetype: Architectural. Per-phase override via a `**Archetype**: <name>` block in the PLAN.md phase heading (parallel to existing `**Whiteboard**:` / `**Engineers**:` blocks). Per-unit sections render as a tight markdown action table — one row per unit, action verb + minimal target reference, no exhaustive file dumps. Concrete Rollout items (rollback-safe within 48h, behind-a-feature-flag, behind-an-experiment) and Checklist items (verified the solution works, added tests, internationalized text, audited accessibility) follow Evan's PR template; substrate-inapplicable items get struck or `N/A`'d at compose time per the CLAUDE.md "adapt to fit the actual PR" rule.

- **Phase 1 — Title shape.** Recipe codifies `[<area>] <descriptive verb>` as the required title prefix; matches the 9/10 universal pattern in PRs #123–#132 (RESEARCH.md § Touch-point inventory). `<area>` is the project slug area or substrate area being touched.

- **Phase 1 — Phase-close coda section.** Recipe documents a small canonical allow-list of coda sections for phase-transition PRs: `## What's next` (forward-pointing, what the next phase tackles) and `## Substrate notes` (cross-cutting impact notes the reviewer should keep in mind). RESEARCH.md § Touch-point inventory shows four distinct coda headings in the 10-PR sample; the recipe codifies two and treats other ad-hoc headings as drift to strike before merge.

- **Phase 1 — Stale-doc fix folded in.** Lines 291-293 of `SUBSTRATE-COMPOSITIONS.md` still reference retired `--pr-state=open` flags (the verb returns `pr-flags-unsupported` per `phase.ts:155` and the same doc's lines 99-101). Fixed while editing the same recipe.

- **Phase 2 — `loom pr wait` verb + `§ Wait for merge` recipe.** New `bin/loom pr wait <slug> --branch=<branch> [--interval=30] [--timeout=1800]` verb that polls `gh pr view` until `state != OPEN` or timeout, returns the final state JSON. Defaults: 30s interval, 30min timeout. Auto-mode silences per-poll output (single entry-line + single exit-line); interactive mode prints a status line per poll. New recipe `§ Wait for merge` in `SUBSTRATE-COMPOSITIONS.md` composes the verb. Both ev-loops (`/ev-loop-interactive`, `/ev-loop-confidence`) benefit uniformly via `/ev-run` step 3, which composes the recipe before surfacing the "waiting on PR #X" blocker. On timeout: surface "still open after 30min, run `/ev-run` later" and exit cleanly.

### Out / deferred

- **Long-running session health.** Operator explicitly out-of-scope'd. The polling-in-conversation implementation of `loom pr wait` accepts session-lifespan as an operator concern; degrades gracefully — if the session ends mid-wait, the next `/ev-run` invocation sees `state: MERGED` and dispatches fine.
- **`bin/loom pr compose-body` verb** (RESEARCH.md § Thread 2 candidate (b)). Deferred per the substrate's "spec it once, see if the drift goes away" bias. Revisit if Phase 1's recipe spec alone doesn't catch drift after a few phases.
- **PR-body lint evaluator** (RESEARCH.md § Thread 2 candidate (d)). Same reasoning — enforcement infra layered on top of a spec that hasn't proven inadequate yet.
- **GitHub PR template at `.github/pull_request_template.md`.** Ruled out — fights the `--body-file` flow `pr open` always passes.
- **GitHub Actions / webhook re-invocation.** Contradicts the substrate's deliberate "no `pr-merged` event" design (Phase-6 U1 of substrate-consolidation, `LOOM-CONVENTIONS.md:255-263`).
- **Post-merge body update hook.** RESEARCH.md surfaced this as a cross-thread opportunity (close out per-unit sections post-merge). Deferred — not load-bearing for either friction; can be added later if Phase 2 lands and a use case appears.
- **Optimistic groundwork during wait** (start next phase against a worktree while waiting). Too speculative.

## Phases

### Phase 1 — Codify PR body shape in `§ Compose PR`

**Archetype**: Architectural.

**Goal**: turn the soft body-shape paragraph in `§ Compose PR` into an explicit, opinionated spec covering structure, voice, and length. Fix the stale `--pr-state` doc bug folded in.

**Files**: `plugins/commons/docs/SUBSTRATE-COMPOSITIONS.md` (canonical source — sync-shared mirrors to consumer plugins).

**Exit criteria**:
- `§ Compose PR` recipe rewrites the body-shape paragraph to specify: section ordering (`## Motivation` / `## Solution` / `## Verification` / `## Rollout` / `## Checklist`), required (`Motivation`, `Rollout`, `Checklist`) vs conditional (`Solution`, `Verification` — required when there's substantive code work or observable verification; struck for pure-doc PRs) sections, length target (~300 words / under 2 min read), tone (terse, direct, third-person), and the load-bearing "don't re-narrate the diff" rule with concrete good-vs-bad sentence examples.
- Recipe documents the default archetype (Architectural) and the per-phase override syntax (`**Archetype**: <name>` block in PLAN.md phase heading).
- Per-unit section spec: markdown action table, one row per unit, `| Action | Target |` columns, action verb + minimal reference (no exhaustive file lists).
- Title shape codified: `[<area>] <descriptive verb>` required prefix. `<area>` is the project slug area or substrate area being touched; `[meta]` as the fallback for non-area work.
- Phase-close coda section codified: optional `## What's next` (forward-pointing) or `## Substrate notes` (cross-cutting impact notes) for phase-transition PRs; other ad-hoc coda headings are drift to strike before merge.
- Rollout and Checklist item text matches the operator's PR-template choices (rollback-safe-within-48h / feature-flag / experiment; verified-solution-works / added-tests / i18n / a11y) with the "adapt to fit at compose time" rule explicit.
- Stale-doc fix at `SUBSTRATE-COMPOSITIONS.md:291-293` — the `--pr-state=open` reference is removed; the post-open behavior is documented accurately against the current verb contract.
- `node scripts/sync-shared.ts` ran clean; downstream `docs/SUBSTRATE-COMPOSITIONS.md` copies in consumer plugins reflect the canonical update.
- `npm test` green.

### Phase 2 — `loom pr wait` verb + `§ Wait for merge` recipe + `/ev-run` integration

**Archetype**: Architectural.

**Goal**: close the manual-resume friction by composing a new `loom pr wait` verb into a `§ Wait for merge` recipe invoked from `/ev-run` step 3.

**Files**:
- `plugins/loom/cli/verbs/loom/pr.ts` + matching test file (new `prWait` handler + tests).
- `plugins/loom/cli/loom.ts` (verb wiring).
- `plugins/commons/docs/SUBSTRATE-COMPOSITIONS.md` (new `§ Wait for merge` recipe).
- `plugins/ev/skills/ev-run/SKILL.md` (router step 3 composes the recipe before the blocker surface).

**Exit criteria**:
- `bin/loom pr wait <slug> --branch=<branch> [--interval=30] [--timeout=1800]` verb implemented. Returns the final state JSON (`{number, url, state, mergedAt?}`) on merge or timeout exit. Polling cadence and timeout are flag-driven with the named defaults; auto-mode silences per-poll output.
- Tests cover: merge during polling (verb returns `state: MERGED`), timeout (verb returns `state: OPEN` with a `timedOut: true` field), interval/timeout flag validation, `gh` invocation mocked.
- `§ Wait for merge` recipe added to `SUBSTRATE-COMPOSITIONS.md` with the standard recipe shape (Purpose / Wraps / Idempotency / Failure modes / Used by).
- `/ev-run` step 3 composes the recipe between "no phase qualifies" and "surface the blocker." Re-evaluation semantics: on `wait` return with `state: MERGED`, the router re-fetches live PR state via `loom pr discover` (so the merged status is in the manifest-adjacent state cache), re-runs the qualifying-phase check, and dispatches the now-unblocked phase. On `state: OPEN` + `timedOut: true`, the router surfaces "still open after 30min, run `/ev-run` later" and exits cleanly. No retry loop within a single `/ev-run` invocation — each timeout is a clean handoff back to the operator.
- Skill-body update reflects auto-mode behavior (silent wait until merge or timeout).
- `node scripts/sync-shared.ts` ran clean.
- `npm test` green.
- Smoke verification: open a throwaway PR against the repo, run `/ev-run` against a project with a phase blocked on that PR, observe the wait completing and dispatch resuming on merge.

## Dependencies

Phase 2 has one soft dependency on Phase 1: the Phase 2 PR is itself composed under the codified Phase 1 spec — a small dogfood validation that the spec works on a real Architectural PR. This is compounding value, not correctness; Phase 2 could ship before Phase 1 with no functional impact.

The two phases edit the same file (`SUBSTRATE-COMPOSITIONS.md`), but Phase 2's edit adds a new recipe section (`§ Wait for merge`) rather than modifying Phase 1's content. No shared text between the two phases; merge-conflict surface is mechanical and trivially rebased.

## Verification

Each phase's exit criteria includes its own verification commands. Cross-phase smoke after Phase 2 merges:
- Verify a real phase-close → dispatch-next cycle through `/ev-run` against a live project. The wait should reduce operator interaction to zero between phase open and merge.
- Re-sample 3–5 PRs composed under the new spec. Confirm the required sections appear universally (Motivation, Rollout, Checklist), Solution and Verification appear when applicable (per the conditional-section rule), the title carries the `[<area>]` prefix, and the body stays under the ~300-word / 2-min-read target.

## Risks

- **Voice-spec compliance.** Codified WHY-over-HOW rule is a load-bearing aspirational instruction; sub-agents may still drift to confessional tone. Mitigation: the spec includes concrete good-vs-bad sentence examples (not just abstract guidance). Escalation if drift persists: ship the deferred lint evaluator from RESEARCH.md § Thread 2 candidate (d).
- **Polling context cost.** In-conversation polling burns transcript lines (one Bash output per poll). At 30s interval / 30min cap, worst case ≈ 60 lines for a slow-merge cycle. Acceptable; if it becomes a real cost, swap the verb's internal implementation for `ScheduleWakeup` without changing the recipe contract.
- **Session-death during polling.** The operator may close the session mid-wait, or the harness may reap a long-running session. Polling-in-conversation requires a live agent. Mitigation: graceful degradation — the next `/ev-run` invocation sees `state: MERGED` and dispatches normally. The skill body of `§ Wait for merge` must document this explicitly so operators know they can close and re-run without losing progress.
- **Recipe spec proliferation.** The codified body-shape spec is heavier than the one-paragraph it replaces. Reviewers may push back on spec verbosity. Mitigation: optimize the spec text for skim-readability (tables, examples, hierarchy) rather than prose density.
- **Archetype override discoverability.** The `**Archetype**: <name>` block in PLAN.md may not be obvious to first-time loom users. Mitigation: documented in the recipe; lives alongside existing `**Whiteboard**:` / `**Engineers**:` conventions that loom users already learn.
- **Spec opinionation vs original ask.** The operator's initial framing was "a few touch points" — the codified spec ships 5 sections + action table + voice/length/WHY-over-HOW rules. Heavier than the ask. Confirmed in interview: the heavier shape is intentional because the diagnosed problem (confessional tone) requires voice/length guidance, not just structural section names. Risk: future operators encountering the spec without the interview context may find it over-prescriptive. Mitigation: recipe text leads with the diagnosed friction (confessional drift) so the spec's opinionation reads as a fix for a real problem, not arbitrary preference.

## Open questions

1. **Phase 2 / Phase 1 archetype choice for THEIR OWN bodies.** Both default to Architectural per the recipe; just noting that the spec will be self-applied during this project's own PRs — useful dogfood signal.
2. **Should the spec name a fallback if the operator strikes a checklist item that turns out to apply?** E.g. an N/A'd a11y item discovered post-merge to have been load-bearing. Leaning no — the substrate trusts the operator — but worth surfacing at the first phase-close retro for a real-data check.

## Decisions

- **PR cadence**: one PR per phase, sequential. Phase 1 merges first; Phase 2 PR composed under Phase 1's spec.
- **Phase order**: Phase 1 (codify body shape) → Phase 2 (auto-resume verb). Low-risk doc edits first; new substrate verb second.
- **Wait call site**: `/ev-run` step 3 only. Both ev-loops converge there on phase close, so the router is the natural single composition point. Rejected alternative: closing-loop call site ("the loop that opened the PR should wait for it") — would duplicate logic across both ev-loops and split responsibility between dispatch (router) and orchestration (loop). Router-only keeps the wait logic adjacent to where the dispatch decision is made.
- **Polling implementation**: in-conversation `gh pr view` polling via `Bash`. Rejected alternatives at this layer: `ScheduleWakeup` (couples to harness-specific scheduling not documented in the substrate CLI surface), `Monitor` against background `gh` (less portable across loops), external cron/webhook (contradicts the substrate's deliberate "no `pr-merged` event" design from Phase-6 U1 of substrate-consolidation per `LOOM-CONVENTIONS.md:255-263`). Polling is encapsulated behind the `loom pr wait` verb so the implementation can be swapped without changing skill bodies.
- **Wait-timeout exit behavior**: on timeout, the verb returns `{state: OPEN, timedOut: true}`. The recipe's caller (`/ev-run` step 3) translates that into the operator-facing surface "still open after 30min, run `/ev-run` later" and exits cleanly. No retry, no escalation — operator decides whether to come back.
- **Polling defaults**: 30s interval, 30min timeout. Auto-mode silences per-poll output (single entry-line + single exit-line).
- **Verb namespace**: `loom pr wait` — lives in existing `pr` namespace alongside `open` / `update` / `discover` / `respond`.
- **Default PR archetype**: Architectural (inlined into the recipe spec, not referenced by hop to CLAUDE.md). Override via `**Archetype**: <name>` block in PLAN.md phase heading.
- **Body length target**: ~300 words, under 2 min read.
- **Body voice**: terse, direct, third-person. WHY-over-HOW codified as a load-bearing rule with concrete examples.
- **Per-unit shape**: markdown action table (`| Action | Target |`), one row per unit, no exhaustive file lists.
- **Title shape**: `[<area>] <descriptive verb>` as required title prefix. `<area>` is the project slug area or substrate area being touched; for non-area work (rare — meta/chore PRs), use `[meta]` as the fallback. Matches the 9/10 universal pattern in PRs #123–#132.
- **Phase-close coda**: `## What's next` and `## Substrate notes` are documented optional sections for phase-transition PRs; other ad-hoc coda headings strike before merge.
- **Wait verb mode flag**: no explicit `--show-cadence` / `--quiet` flag; auto-mode behavior (silent poll) is implicit from caller context (`--mode=auto` propagation through the recipe). Keeps the verb interface lean.
- **Rollout body**: rollback-safe-within-48h + feature-flag + experiment items (operator's PR template); strike/N/A inapplicable at compose time.
- **Checklist body**: verified-solution-works + added-tests + i18n + a11y items (operator's PR template); strike/N/A inapplicable at compose time.
- **Stale-doc fix**: folded into Phase 1.
- **Spec opinionation**: heavier than the original "a few touch points" ask. Justified by the interview pushback on confessional tone — fixing the diagnosed problem requires voice/length/WHY-over-HOW guidance, not just structural section names. Confirmed by operator post-panel review.
- **Deferred to future**: `loom pr compose-body` verb, PR-body lint evaluator, post-merge body update hook.
