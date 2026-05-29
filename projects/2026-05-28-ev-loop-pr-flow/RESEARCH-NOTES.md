# 2026-05-28-ev-loop-pr-flow research notes

## Raw investigation log

- Started by mapping the ev-loops' phase-close paths in both skills. Both end at "Refresh PR per § Compose PR" → "Update phase status=completed" → return to router. No wait anywhere in the loop body.
- The actual pause point is router step 3 — `/ev-run` looks for a next phase, finds none qualifying because all in-progress phases are waiting on PR merges, surfaces "waiting on PR #X to merge" and stops. That's the line the user is currently un-pausing manually.
- Confirmed `loom pr discover` already returns live merge state from `gh pr view` (`state: OPEN | MERGED | CLOSED`). That's the polling primitive — no new gh integration needed for an auto-resume mechanism.
- `gh` CLI has `pr view --json state,mergeStateStatus,mergedAt` and exit codes; `gh pr merge --auto` exists but does the inverse (sets up auto-merge once checks pass) so is not relevant for waiting.
- `gh pr checks` has an interesting flag — exit code 8 for "checks pending" — could feed a richer "wait until checks pass AND merged" primitive but probably overkill for v1.

## Dead ends / ruled-out

- **GitHub webhook → re-invoke Claude Code.** Considered briefly. Out of scope because (a) requires infra outside this repo, (b) contradicts the substrate's deliberate "no `pr-merged` event" design from Phase-6 U1 of substrate-consolidation, (c) only works for this one repo's setup, not portable. Mentioned in candidate (e) for completeness but ruled out in the recommendation.
- **GitHub PR template at `.github/pull_request_template.md`.** Ruled out because `bin/loom pr open` always passes `--body-file`, which fully overrides the template. The template would never get to seed the body. Could be revisited if the verb gained a "use template" mode, but that's a bigger change than is warranted here.
- **`gh pr merge --auto` as the wait mechanism.** Different shape — it tells GitHub to merge once checks pass. The user wants the *agent* to know when the merge happened, not to gate the merge itself. Could compose with auto-merge as a hint ("if `mergeStateStatus = CLEAN` you'll likely merge in seconds, poll fast") but not a substitute.

## Rabbit holes considered but deferred

- **Long-running session health.** User explicitly out-of-scope'd this. Briefly considered whether option (a) polling exacerbates it (yes), and whether ScheduleWakeup (option b) resolves it (mostly yes, by fragmenting the agent's wall-clock presence across wakeups). The recommendation (option f with a polling implementation) accepts the long-session footprint as an explicit trade.
- **Generator-shaped body composition.** Could imagine a `generator-pr-body` agent that takes the manifest + checkins and emits a body — parallel to `generator-css-codemod`. This is essentially candidate (b) reframed as an agent. Substrate has the precedent. Deferred for the same reason — start with the spec, see what drift remains, only then add infrastructure.
- **Archetype detection.** Considered whether the substrate could infer archetype from phase shape (e.g. tier-2 phase in confidence loop ≈ Migration; interactive loop with whiteboard-architect engineer ≈ Architectural). Probably auto-derivable for most cases. Deferred to question 4 in Open Questions because the rule is a design call, not a research finding.

## Texture worth remembering

- Last 10 merged PRs converge unanimously on `## Motivation` + `## Rollout` + `## Checklist`. The recipe's "typically `## Summary`" prediction is wrong — `Summary` shows up 4/10, while `Motivation` is 10/10. The recipe should be updated regardless of any wait-for-merge work, because it's actively misleading.
- The "Risk level" line in `## Rollout` is the most uniform single touch point — every PR has it, all use the words "low/medium/minimal," all give a one-clause justification. Worth codifying that specific shape explicitly.
- Per-unit sections render as tables in some PRs (PR #132's `| Action | File(s) |` table) and prose in others (PR #130's section-per-unit prose). Both are fine; the inconsistency mostly hurts readers scanning PR history. Picking one would help.
- The "Phase close" coda (`## What's next`, `## Phase close + M1 close`, `## Substrate notes`) appears specifically at phase-transition PRs and reads as natural — worth treating as a documented optional section rather than calling drift.
- Stale doc bug at `SUBSTRATE-COMPOSITIONS.md:291-293` — the retired `--pr / --url / --pr-state` flags are still referenced. Fix while we're in there for Phase 1 of Thread 2.

## Open questions I almost added but didn't

- "Should the wait include a 'while you wait, do something useful' option" (e.g. start groundwork on the next phase optimistically against a worktree)? Considered. Too speculative for /loom-plan grill-me; user can raise if it matters.
- "Should the recipe spec name a Markdown linter or schema?" Considered. Way over-engineered for this substrate; ruled out.
- "Does `loom pr wait` belong in `loom` or in a new `ev` plugin?" Considered. The verb is loom-shaped (operates on PR state, same surface as `pr open / discover / update`). Mention in passing if interview goes deep; otherwise loom is the obvious home.

## Things to surface in conversation, not the dossier

- The user is tired of typing "PR N is merged. keep going." — a small but real ergonomic win is at stake here. The recommendation should land that win cheaply (polling-in-loop) rather than getting blocked on long-session health questions.
- Evan's instinct toward "consistently hitting on a few touch points" matches what the PR data shows — the 3-touchpoint universal set (Motivation / Rollout / Checklist) is already the de-facto standard. The plan can ratify that, not invent it.
