# 2026-05-28-ev-loop-pr-flow

Codify the PR body shape the ev-loops produce, then close the operator-resume papercut by waiting for PR merge automatically. Two phases, two PRs, independently shippable.

See [RESEARCH.md](./RESEARCH.md) for the dossier on current PR-flow state, candidate auto-resume mechanisms, and the PR-body touch-point inventory across PRs #123–#132.

## Context

The ev-loops have two friction points at the PR boundary, both surfaced repeatedly by the operator (see RESEARCH.md § Scope of inquiry).

**Friction 1 — manual resume.** When a phase closes, `§ Compose PR` opens or updates the PR, the loop returns to `/ev-run`, and the router (step 3, `plugins/ev/skills/ev-run/SKILL.md:197-210`) surfaces "waiting on PR #X to merge" and stops. The operator types "PR N merged, keep going" once per phase. The primitive for detecting merge already exists — `loom pr discover` returns live `state: MERGED` from `gh pr view` (`plugins/loom/cli/verbs/loom/pr.ts:42-72`); what's missing is the loop-back.

**Friction 2 — drift in PR bodies.** `§ Compose PR` (`plugins/commons/docs/SUBSTRATE-COMPOSITIONS.md:286-289`) currently specifies the body as "typically `## Summary` + per-unit sections + `## Test plan` + `## Rollout` + `## Checklist`." The recipe is wrong about which sections actually appear — `## Summary` shows up in 4/10 recent PRs while `## Motivation` is 10/10 (RESEARCH.md § Touch-point inventory). Worse, recent PRs trend confessional — multi-paragraph Motivation blocks, exhaustive file-action tables, command output blockquotes. They read like the agent showing its work to itself rather than telling the human reviewer what the human needs to know. The recipe spec leaves voice, length, and WHY-over-HOW guidance entirely implicit.

## Scope

### In

- **Phase 1 — Codify `§ Compose PR` body shape.** Rewrite the recipe's body-shape paragraph as an explicit spec organized into 3 composable layers — Core (Motivation/Rollout/Checklist always), Body (Solution/Verification when substantive), optional Coda (What's next / Substrate notes for phase-transition PRs) — preceded by a required top-level `> [!NOTE]` GitHub-callout containing a markdown link to the project's PLAN.md and a one-sentence project-context line naming how the PR slots into the broader goal. Plus terse-third-person voice rule, advisory ~300-word target framed as a voice-proxy not enforced, load-bearing WHY-over-HOW "don't re-narrate the diff" rule with both sentence-scale good/bad examples AND a paragraph-scale anti-pattern naming the exit-criteria-as-prose failure mode, markdown action table (`| Action | Subject |`) one-row-per-unit with concept-not-path guidance, `[<area>] <descriptive verb>` title prefix with tightened `[meta]` fallback (only when no plugin-authoritative content and no shared `commons/` source), default-Architectural archetype with substrate-shading note and `**Archetype**: <name>` PLAN.md override (convention-only — `loom parse-plan` does not consume this block today, sub-agent reads from PLAN.md prose), substrate-default Checklist (verified-solution-works / added-tests / sync-shared-ran-if-commons-touched / npm-test-green) with Patreon-extras `**Checklist-extras**: i18n, a11y` override for projects that need them, Patreon-shape Rollout items (rollback-safe-within-48h / feature-flag / experiment) with adapt-at-compose-time strike rule, coda allow-list with explicit disposition for other ad-hoc headings (`## Process notes` etc) — strike before merge, and Verification rule that names observable claims a reviewer can re-run (tests-as-verification belongs in Checklist, not Verification). Spec lives inside the recipe's existing five-field template — extends Purpose with `###` sub-headings rather than adding a sixth field.

- **Phase 1 — Title shape.** Recipe codifies `[<area>] <descriptive verb>` as the required title prefix; matches the 9/10 universal pattern in PRs #123–#132 (RESEARCH.md § Touch-point inventory). `<area>` is the project slug area or substrate area being touched; `[meta]` is the tightened fallback (only when no plugin-authoritative content AND no shared `commons/` source).

- **Phase 1 — Phase-close coda section.** Recipe documents a small canonical allow-list of coda sections for phase-transition PRs: `## What's next` (forward-pointing, what the next phase tackles) and `## Substrate notes` (cross-cutting impact notes the reviewer should keep in mind). RESEARCH.md § Touch-point inventory shows four distinct coda headings in the 10-PR sample; the recipe codifies two and treats other ad-hoc headings as drift to strike before merge.

- **Phase 1 — Stale-doc fix folded in.** Lines 291-293 of `SUBSTRATE-COMPOSITIONS.md` still reference retired `--pr-state=open` flags (the verb returns `pr-flags-unsupported` per `phase.ts:155` and the same doc's lines 99-101). Replaced with derive-on-demand-from-`gh pr view` posture via `loom pr discover` so the next sub-agent reading the recipe doesn't emit the rejected verb call.

- **Phase 2 — `loom pr wait` verb + `§ Wait for merge` recipe.** New `bin/loom pr wait <slug> --branch=<branch> [--interval=30] [--timeout=1800]` verb that polls `gh pr view` until `state != OPEN` or timeout, returns the final state JSON. Defaults: 30s interval, 30min timeout. Auto-mode silences per-poll output (single entry-line + single exit-line); interactive mode prints a status line per poll. New recipe `§ Wait for merge` in `SUBSTRATE-COMPOSITIONS.md` composes the verb. Both ev-loops (`/ev-loop-interactive`, `/ev-loop-confidence`) benefit uniformly via `/ev-run` step 3, which composes the recipe before surfacing the "waiting on PR #X" blocker. On timeout: surface "still open after 30min, run `/ev-run` later" and exit cleanly.

### Out / deferred

- **Long-running session health.** Operator explicitly out-of-scope'd. The polling-in-conversation implementation of `loom pr wait` accepts session-lifespan as an operator concern; degrades gracefully — if the session ends mid-wait, the next `/ev-run` invocation sees `state: MERGED` and dispatches fine.
- **Parser-extension for `**Archetype**:` block** in `plugins/loom/cli/lib/plan.ts` — convention-only in Phase 1 (sub-agent reads from PLAN.md prose). Defer to when a programmatic consumer (`loom pr compose-body` verb or PR-body lint evaluator) actually needs it.
- **`bin/loom pr compose-body` verb** (RESEARCH.md § Thread 2 candidate (b)). Deferred per the substrate's "spec it once, see if the drift goes away" bias. Revisit if Phase 1's recipe spec alone doesn't catch drift after a few phases.
- **PR-body lint evaluator** (RESEARCH.md § Thread 2 candidate (d)). Same reasoning — enforcement infra layered on top of a spec that hasn't proven inadequate yet.
- **GitHub PR template at `.github/pull_request_template.md`.** Ruled out — fights the `--body-file` flow `pr open` always passes.
- **GitHub Actions / webhook re-invocation.** Contradicts the substrate's deliberate "no `pr-merged` event" design (Phase-6 U1 of substrate-consolidation, `LOOM-CONVENTIONS.md:255-263`).
- **Post-merge body update hook.** RESEARCH.md surfaced this as a cross-thread opportunity (close out per-unit sections post-merge). Deferred — not load-bearing for either friction; can be added later if Phase 2 lands and a use case appears.
- **Optimistic groundwork during wait** (start next phase against a worktree while waiting). Too speculative.

## Phases

### Phase 1 — Codify PR body shape in `§ Compose PR`

**Archetype**: Architectural.

**Goal**: turn the soft body-shape paragraph in `§ Compose PR` into an explicit, opinionated spec covering structural composition (3 layers + project-context callout), voice, advisory length, WHY-over-HOW with sentence + paragraph anti-patterns, archetype, title, Checklist split, and Rollout items — all inside the recipe's existing 5-field template. Fix the stale `--pr-state` doc bug folded in.

**Files**: `plugins/commons/docs/SUBSTRATE-COMPOSITIONS.md` (canonical source — sync-shared mirrors to consumer plugins).

**Exit criteria**:
- `§ Compose PR` recipe rewrites the body-shape paragraph to specify: (a) required top-level `> [!NOTE]` project-context callout containing PLAN.md link + one-sentence project context, with worked example; (b) 3-layer composable body — Core (Motivation/Rollout/Checklist always), Body (Solution/Verification when substantive), Coda (What's next / Substrate notes for phase-transition PRs); (c) per-section content rules including Verification-names-observable-claims (tests in Checklist not Verification) and Motivation-anchors-on-friction (not exit-criteria-as-prose); (d) terse-direct-third-person voice rule; (e) advisory ~300-word target framed as voice-proxy not enforced; (f) load-bearing "don't re-narrate the diff" rule with sentence-scale good/bad examples AND paragraph-scale anti-pattern naming the exit-criteria-as-prose failure mode.
- Recipe documents the default archetype (Architectural) with substrate-shading note ("most substrate PRs land Architectural — substrate work is shape-defining by default") and the per-phase override syntax (`**Archetype**: <name>` block in PLAN.md phase heading, convention-only — `loom parse-plan` does not consume this block today).
- Per-unit section spec: markdown action table with `| Action | Subject |` columns (Subject names concept not file path), one row per unit.
- Title shape codified: `[<area>] <descriptive verb>` required prefix; `<area>` is project slug area or substrate area; `[meta]` fallback only when no plugin-authoritative content AND no shared `commons/` source.
- Phase-close coda section codified: optional `## What's next` (forward-pointing) or `## Substrate notes` (cross-cutting impact notes) for phase-transition PRs; other ad-hoc coda headings strike before merge.
- Rollout body codified with Patreon-shape items (rollback-safe-within-48h / feature-flag / experiment) with adapt-at-compose strike rule.
- Checklist body codified with substrate-default items always-on (verified-solution-works / added-tests / sync-shared-ran-if-commons-touched / npm-test-green) and Patreon-extras override (`**Checklist-extras**: i18n, a11y` for projects that need them).
- Spec lives inside the recipe's 5-field template (Purpose / Wraps / Idempotency / Failure modes / Used by) — extends Purpose with `###` sub-headings, no 6th field.
- Stale-doc fix at the prior `SUBSTRATE-COMPOSITIONS.md:291-293` — `--pr-state=open` reference replaced with derive-on-demand-from-`loom pr discover` posture so future sub-agents don't reintroduce the rejected verb call.
- `node scripts/sync-shared.ts` ran clean for docs; downstream `docs/SUBSTRATE-COMPOSITIONS.md` copies in consumer plugins reflect the canonical update (operator caveat: known sync-shared cli/lib drift is pre-existing substrate-followups territory and was reverted; manual `cp` was used for docs only).
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
- Re-sample 3–5 PRs composed under the new spec. Confirm the project-context `[!NOTE]` callout appears on every PR, the Core layer sections (Motivation / Rollout / Checklist) appear universally, Body layer sections (Solution / Verification) appear when applicable per the conditional-section rule, the title carries the `[<area>]` prefix, and the body stays around the ~300-word target (advisory; voice-proxy, not enforced).

## Risks

- **Voice-spec compliance.** Codified WHY-over-HOW rule with paragraph-scale anti-pattern is load-bearing; sub-agents may still drift to confessional tone. Mitigation: the spec includes concrete good-vs-bad sentence examples AND a paragraph-scale anti-pattern naming the exit-criteria-as-prose failure mode. Escalation if drift persists: ship the deferred lint evaluator from RESEARCH.md § Thread 2 candidate (d).
- **Polling context cost.** In-conversation polling burns transcript lines (one Bash output per poll). At 30s interval / 30min cap, worst case ≈ 60 lines for a slow-merge cycle. Acceptable; if it becomes a real cost, swap the verb's internal implementation for `ScheduleWakeup` without changing the recipe contract.
- **Session-death during polling.** The operator may close the session mid-wait, or the harness may reap a long-running session. Polling-in-conversation requires a live agent. Mitigation: graceful degradation — the next `/ev-run` invocation sees `state: MERGED` and dispatches normally. The skill body of `§ Wait for merge` must document this explicitly so operators know they can close and re-run without losing progress.
- **Recipe spec proliferation.** The codified body-shape spec is heavier than the one-paragraph it replaces. Reviewers may push back on spec verbosity. Mitigation: spec is structured as `###` sub-headings inside Purpose for skim-readability; the 5-field template invariant is preserved.
- **Checklist split discoverability.** The `**Checklist-extras**: i18n, a11y` override block is new convention; product-flavored projects may not realize they need to opt in. Mitigation: documented alongside `**Archetype**:` override syntax in the recipe; both blocks live in the PLAN.md phase heading.
- **Archetype override discoverability.** The `**Archetype**: <name>` block in PLAN.md may not be obvious to first-time loom users. Mitigation: documented in the recipe; lives alongside existing `**Whiteboard**:` block conventions that loom users already learn.
- **Spec opinionation vs original ask.** The operator's initial framing was "a few touch points" — the codified spec ships 3-layer composable body + action table + voice/length/WHY-over-HOW rules + project-context callout. Heavier than the ask. Confirmed in interview and unit-negotiation: the heavier shape is intentional because the diagnosed problem (confessional tone) requires voice/length guidance, not just structural section names. Mitigation: recipe text leads with the diagnosed friction so the spec's opinionation reads as a fix for a real problem, not arbitrary preference.
- **Sync-shared cli/lib drift.** Running `node scripts/sync-shared.ts` triggers known pre-existing cli/lib drift (script deletes plugin-authoritative `manifest-toml.ts` / `plan.ts` / `toml.ts` / `commit-discipline.ts` from `plugins/loom/cli/lib/` because they don't exist in commons). Phase 1 unit reverted the cli/lib side-effects and applied docs sync manually; this is a substrate-followups issue out of scope for this project. Risk: future phases of this project re-trip the drift if they re-run sync-shared without the manual workaround.

## Open questions

1. **Phase 2 / Phase 1 archetype choice for THEIR OWN bodies.** Both default to Architectural per the recipe; just noting that the spec will be self-applied during this project's own PRs — useful dogfood signal.
2. **Should the spec name a fallback if the operator strikes a checklist item that turns out to apply?** E.g. an N/A'd a11y item discovered post-merge to have been load-bearing. Leaning no — the substrate trusts the operator — but worth surfacing at the first phase-close retro for a real-data check.
3. **Will the Phase 2 PR's Verification section duplicate the action table?** Skeptic's prediction at unit 01 whiteboard: when a Phase 2-style PR has unit tests, the action table says "Add prWait handler + tests" and the Verification section may say "tests cover merge / timeout / flag validation." Spec says Verification names *observable claims a reviewer can re-run* (tests-as-test belong in Checklist `Added tests`); test for this prediction at Phase 2 close.

## Decisions

- **PR cadence**: one PR per phase, sequential. Phase 1 merges first; Phase 2 PR composed under Phase 1's spec.
- **Phase order**: Phase 1 (codify body shape) → Phase 2 (auto-resume verb). Low-risk doc edits first; new substrate verb second.
- **Wait call site**: `/ev-run` step 3 only. Both ev-loops converge there on phase close, so the router is the natural single composition point. Rejected alternative: closing-loop call site ("the loop that opened the PR should wait for it") — would duplicate logic across both ev-loops and split responsibility between dispatch (router) and orchestration (loop). Router-only keeps the wait logic adjacent to where the dispatch decision is made.
- **Polling implementation**: in-conversation `gh pr view` polling via `Bash`. Rejected alternatives at this layer: `ScheduleWakeup` (couples to harness-specific scheduling not documented in the substrate CLI surface), `Monitor` against background `gh` (less portable across loops), external cron/webhook (contradicts the substrate's deliberate "no `pr-merged` event" design from Phase-6 U1 of substrate-consolidation per `LOOM-CONVENTIONS.md:255-263`). Polling is encapsulated behind the `loom pr wait` verb so the implementation can be swapped without changing skill bodies.
- **Wait-timeout exit behavior**: on timeout, the verb returns `{state: OPEN, timedOut: true}`. The recipe's caller (`/ev-run` step 3) translates that into the operator-facing surface "still open after 30min, run `/ev-run` later" and exits cleanly. No retry, no escalation — operator decides whether to come back.
- **Polling defaults**: 30s interval, 30min timeout. Auto-mode silences per-poll output (single entry-line + single exit-line).
- **Verb namespace**: `loom pr wait` — lives in existing `pr` namespace alongside `open` / `update` / `discover` / `respond`.
- **Body composition framing**: 3 composable layers — Core (Motivation/Rollout/Checklist always), Body (Solution/Verification when substantive), Coda (What's next / Substrate notes for phase-transition PRs). Per-layer required-vs-conditional rule is property of the layer, not annotation on individual sections. Closer to the s-expression / composable-primitive shape from CLAUDE.md.
- **Project-context callout**: required top-level `> [!NOTE]` GitHub-callout on the first line of every PR body, containing (i) markdown link to project PLAN.md and (ii) one sentence naming how the PR slots into the broader goal. Fallback for non-loom PRs: orientation sentence alone, no broken link.
- **Default PR archetype**: Architectural (inlined into the recipe spec, not referenced by hop to CLAUDE.md). Substrate-shading note ("most substrate PRs land Architectural — substrate work is shape-defining by default; Refactor and Dependency apply on the margins"). Override via `**Archetype**: <name>` block in PLAN.md phase heading — convention-only; `loom parse-plan` does not consume this block today (sub-agent reads from PLAN.md prose).
- **Body length target**: ~300 words / under 2 min read, framed as **advisory voice-proxy not enforced**. Terse third-person prose tends to hit the target; confessional prose busts it. When over budget without good reason, cut: first per-unit prose the action table covers, then Verification details that duplicate the action table, then Motivation that drifts into exit-criteria-as-prose.
- **Body voice**: terse, direct, third-person. WHY-over-HOW codified as a load-bearing rule with **both** sentence-scale good/bad examples AND a paragraph-scale anti-pattern naming the exit-criteria-as-prose failure mode (a Motivation paragraph that reads WHY-shaped while being the PLAN.md exit criteria reworded as prose).
- **Per-unit shape**: markdown action table (`| Action | Subject |`), one row per unit. `Subject` names what the action is about at the conceptual level — a recipe, a verb, a section, a doc — not the file path. Concept references are short by nature; file-path content in the Subject column is anti-pattern.
- **Title shape**: `[<area>] <descriptive verb>` as required title prefix. `<area>` is the project slug area or substrate area being touched. `[meta]` fallback is tightened: use only when the PR touches no plugin's authoritative content AND no shared `commons/` source (typically repo-wide chore / tooling / CI work). Reaching for `[meta]` when uncertain is drift.
- **Phase-close coda**: `## What's next` (forward-pointing) and `## Substrate notes` (cross-cutting impact) are the two canonical optional sections for phase-transition PRs. Other ad-hoc coda headings (`## Process notes`, etc.) strike before merge; their content folds into one of the two canonical codas or into Motivation.
- **Verification rule**: `## Verification` names observable claims a reviewer can re-run. Tests-as-verification ("we wrote tests for X") belong in `## Checklist` (`Added tests`), not in `## Verification`.
- **Wait verb mode flag**: no explicit `--show-cadence` / `--quiet` flag; auto-mode behavior (silent poll) is implicit from caller context (`--mode=auto` propagation through the recipe). Keeps the verb interface lean.
- **Rollout body**: rollback-safe-within-48h + feature-flag + experiment items (operator's PR template); strike/N/A inapplicable at compose time. Most substrate PRs strike feature-flag and experiment.
- **Checklist body — split into substrate-default + Patreon-extras override.** Substrate-default items always-on, every PR: verified-solution-works / added-tests / sync-shared-ran-if-commons-touched / npm-test-green. Patreon-extras override via `**Checklist-extras**: i18n, a11y` block in PLAN.md phase heading for projects that need them (product-flavored work, accessibility-critical surfaces). Without the override block, the substrate-repo Checklist stays substrate-default. Replaces the prior "i18n / a11y as universal items with adapt-at-compose strike" decision after whiteboard skeptic flagged the strike-pollution failure mode.
- **Spec lives inside 5-field template.** The recipe's Purpose extends with `###` sub-headings (Title, Body shape, Per-section content, Voice and length, Archetype, After open); no 6th field added. Wraps / Idempotency / Failure modes / Used by unchanged. Honors the recipe-template invariant at `SUBSTRATE-COMPOSITIONS.md:17-44`.
- **Stale-doc fix**: folded into Phase 1. Replacement text names derive-on-demand-from-`loom pr discover` posture explicitly so the next sub-agent reading the recipe doesn't re-introduce the retired `--pr-state=open` flag.
- **Spec opinionation**: heavier than the original "a few touch points" ask. Justified by the interview pushback on confessional tone — fixing the diagnosed problem requires voice/length/WHY-over-HOW guidance, not just structural section names. Confirmed by operator post-panel review AND mid-unit-negotiation (operator added the project-context `[!NOTE]` callout requirement during unit 01 contract negotiation).
- **Deferred to future**: `loom pr compose-body` verb, PR-body lint evaluator, post-merge body update hook, parser-extension for `**Archetype**:` and `**Checklist-extras**:` blocks (revisit when a programmatic consumer needs them).

## Revision log

- 2026-05-29 — Absorb whiteboard round 1 refinements (substrate-engineer + skeptic + design-systems) and the mid-unit-negotiation operator add-on into PLAN.md Decisions list: 3-layer Core/Body/Coda composable framing replaces flat 5-section spec with conditional annotations; advisory ~300-word target framed as voice-proxy (not enforced); markdown action table renamed Target→Subject for semantic-not-literal column naming; Checklist split into substrate-default-always-on (verified-solution-works / added-tests / sync-shared / npm-test-green) plus Patreon-extras override (i18n / a11y) instead of universal-Patreon-with-strikes (skeptic's confessional-drift-attractor flag); required top-level [!NOTE] project-context callout above Core layer with PLAN.md link plus one-sentence broader-goal context; paragraph-scale don't-re-narrate anti-pattern named (exit-criteria-as-prose failure mode); tightened [meta] title fallback (only when no plugin-authoritative content and no shared commons/); coda allow-list with explicit disposition for other ad-hoc headings; Verification-names-observable-claims rule (tests in Checklist not Verification); spec lives inside 5-field recipe template (extends Purpose with sub-headings, no 6th field); substrate-shading note added to default Architectural archetype; archetype block stays convention-only (no parser extension in Phase 1); session-boundary L-004 override (whiteboard substituted design-systems for session-uncached naming); sync-shared cli/lib drift risk added (pre-existing substrate-followups issue surfaced during Phase 1 unit 01 execution).
