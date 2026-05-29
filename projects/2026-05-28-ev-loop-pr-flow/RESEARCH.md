# 2026-05-28-ev-loop-pr-flow research

## Scope of inquiry

This dossier supports `/loom-plan` for a project to fix two related friction points in the ev-loops' PR flow. **Thread 1**: when a phase closes and its PR opens, the loop returns to `/ev-run`, which surfaces "waiting on PR #X to merge" and stops — the operator must say "PR N is merged. keep going." on every phase. **Thread 2**: the `§ Compose PR` recipe leaves the body shape underspecified ("typically: `## Summary` + per-unit sections + `## Test plan` + `## Rollout` + `## Checklist`"), so PRs converge on Evan's CLAUDE.md conventions by feel rather than by spec.

Project shape: one project, two phases, each independently shippable as one PR. Out of scope: long-running session health (the user owns that), per-repo PR-style overrides (this is one-marketplace-repo scoped), GitHub-side merge automation (auto-merge, merge queues).

## Current state

### How the ev-loops handle PR creation today

The phase-close path is the same in both loops:

- `/ev-loop-interactive` Step 3 (`plugins/ev/skills/ev-loop-interactive/SKILL.md:697-702`):
  1. "Refresh the PR per § Compose PR so it reflects the final state."
  2. "Update the phase per § Phase update with `--status=completed`."
  3. Loop returns to the router. There is no merge-wait.
- `/ev-loop-confidence` Step 4 (`plugins/ev/skills/ev-loop-confidence/SKILL.md:241-248`) does the same.

`§ Compose PR` (`plugins/commons/docs/SUBSTRATE-COMPOSITIONS.md:265-315`) is a discover-then-open-or-update composition over three loom verbs:

```
bin/loom pr discover <slug> --branch=<branch>      # gh pr view → {number, url, state}
bin/loom pr open <slug> --branch=<branch> --title=<title> --body-file=<path>
bin/loom pr update <slug> --pr=<number> --body-file=<path>
```

The recipe is `safe` for idempotency; `pr discover` returns live `gh` state (`OPEN` | `MERGED` | `CLOSED`) — the primitive that any auto-resume mechanism would poll. The verb implementation is at `plugins/loom/cli/verbs/loom/pr.ts:52-72` (a single `gh pr view <branch> --json number,url,body,state`).

**The actual pause point is in `/ev-run`, not in the loops.** `plugins/ev/skills/ev-run/SKILL.md:197-210`, step 3:

> 1. If any phase is `in-progress`, that's the next phase.
> 2. Otherwise, pick the lowest-numbered `not-started` phase whose dependencies are all satisfied. […] a dependency is satisfied when that phase's manifest status is `completed` (its PR merged).
> 3. **If no phase qualifies, surface the blocker: "waiting on PR #X to merge" or "all phases completed — run `/loom-archive`."**

So today's flow is: loop closes phase → `--status=completed` recorded → loop returns → user (in next session, or same session via re-invoking `/ev-run`) types something like "PR 132 merged, keep going" → router runs step 0/1 (state refresh, including `loom pr discover` which sees `state: MERGED`) → step 3 picks the next phase. The "PR is merged, keep going" message isn't load-bearing for parsing — it's purely the wake-up signal. The router could have figured out the merged state on its own if it had been polling.

Worth flagging: `plugins/commons/docs/SUBSTRATE-COMPOSITIONS.md:291-293` still says "After open, the loop calls `§ Phase update` with `--pr=<number> --url=<url> --pr-state=open`" — but those flags were explicitly retired (the verb returns `pr-flags-unsupported` per `phase.ts:155` and `SUBSTRATE-COMPOSITIONS.md:99-101`). The doc contradicts itself; a follow-up cleanup will want to fix this.

### Current PR body shape — de-facto vs codified

**Codified, in `§ Compose PR`** (`SUBSTRATE-COMPOSITIONS.md:286-289`):

> The `--body-file` is a markdown file the loop composes from the phase's checkin record (typically: `## Summary` + per-unit sections + `## Test plan` + `## Rollout` + `## Checklist`, per CLAUDE.md PR conventions).

That's the only spec. "Typically" + "per CLAUDE.md PR conventions" — soft pointers, no enforcement.

**Codified upstream, in `/Users/krambuhl/.claude/CLAUDE.md` § PR conventions** (lines 488-531): five archetype shapes (Architectural / Migration / Bug fix / Refactor / Dependency), each with its own canonical section ordering. ALL shapes include `## Rollout` + `## Checklist` with specific sub-items (risk level, revert plan, feature flag, post-deploy watch; verified-locally, tests added, i18n strings, accessibility, Happo).

**De-facto, in the last 10 merged PRs of this repo (#123–#132)** — section heading frequency:

| Heading | Count (of 10) |
|---|---|
| `## Rollout` | 10 |
| `## Motivation` | 10 |
| `## Checklist` | 10 |
| `## Verification` | 9 |
| `## Solution` | 7 |
| `## Summary` | 4 |
| `## Substrate notes` | 2 |
| `## What's next` | 2 |
| `## Phase close + M1 close` | 1 |
| `## Retrospective (…)` | 1 |
| `## Retro highlights` | 1 |
| `## Process notes` | 1 |
| (other PR-specific) | 1× each |

The convergence is **`## Motivation`, `## Rollout`, `## Checklist`** universally; **`## Verification`** nearly always; **one of `## Solution` or `## Summary`** as the body proper. This matches Evan's "Architectural PR" archetype most closely (motivation → solution → verification), not the recipe's "Summary + Test plan" suggestion. Phase-close PRs sometimes add `## Phase close` / `## What's next` / `## Substrate notes` — phase-flavored coda sections that don't fit any one archetype.

**Rollout bodies converge on one shape** — sampled across PRs #123–#132, every one names a risk level (low / medium / minimal). Most also name what's affected ("additive CLI surface", "deletes a test that's been red for days") in one line. None use Evan's full template (revert plan, feature flag, ops dashboards) — that's heavier than these substrate-repo PRs need.

**Checklists are wildly inconsistent in detail** — sometimes `[x] Verified locally / [x] Tests added`, sometimes nothing beyond a single check.

The implicit convergence is real. The gap is that it lives only in the agent's pattern-matching off CLAUDE.md, not in a spec the substrate enforces. Different sessions drift — the `## Summary` vs `## Motivation` split in #126–#127 vs #128–#132 likely reflects different sub-agents drafting bodies.

## Thread 1 — Auto-resume on PR merge

### The gap

Concrete pause point: `/ev-run` step 3, line 209-210:

> 3. If no phase qualifies, surface the blocker: "waiting on PR #X to merge" or "all phases completed — run `/loom-archive`."

`/ev-run` has the primitive it needs — `loom pr discover` returns `state: MERGED` when the PR is merged. What's missing is the loop-back: the router *reports* the blocker and stops, instead of *waiting* and resuming.

There are two sub-questions hiding in "have it wait":

1. **Where does the wait live?** Inside the closing loop (between § Compose PR and return), inside `/ev-run` (after step 3 surfaces the blocker), or as a separate skill (`/ev-wait-merge` or similar) that the loops/router compose?
2. **How is the wait implemented?** In-conversation polling (chat-thread stays open, agent runs `gh` calls on a cadence), session-level scheduling (a harness tool wakes the agent up later), or out-of-band (cron / webhook posts back into the session)?

### Candidate approaches

#### (a) In-session polling via `gh pr view`

**Mechanism**: when phase close happens, the closing loop (or the router post-dispatch) enters a `while` loop: `loom pr discover` → if `MERGED`, break and dispatch next phase; if `OPEN`, sleep N seconds and re-check. Polling happens in-conversation via `Bash`. Each poll costs context tokens (the verb output lands in the transcript).

**Pros**:
- Zero new substrate. The verb is already there. Implementation is "add a wait sub-step to § Compose PR" or "add a § Wait for merge recipe."
- Trivially testable (mock `gh`).
- Survives `/clear` only if the loop is re-entered; doesn't try to keep state across true session boundaries.

**Cons**:
- Burns conversation context. A 30-minute review cycle at 60s polling = 30 lines of "still OPEN" Bash output cluttering the transcript.
- Requires the agent to actually sit and poll — if the user walks away mid-poll, the session can be reaped (long-session health is out of scope per user, but the polling loop *is* what makes that concern acute).
- Doesn't survive session boundaries — if the user closes Claude Code, the next session has to re-enter the loop manually.

**Fit with existing substrate**: clean. Composes the existing `loom pr discover` verb.

#### (b) `ScheduleWakeup` long-sleep loop

**Mechanism**: this harness exposes scheduling capabilities (the `schedule` / `loop` skills surface in the available-skills list — there's a remote-routine substrate). The closing loop ends with a scheduled callback: "in 5 minutes, re-run `/ev-run <slug>`" — fire and forget. Each wakeup checks merge state; if still open, re-schedule; if merged, dispatch.

**Pros**:
- No in-conversation context burn. The wakeup happens fresh.
- Naturally survives session boundaries (the scheduler outlives the chat).
- Polite to the long-session health concern even though it's out of scope.

**Cons**:
- Couples the loop body to harness-specific scheduling primitives that aren't documented in the substrate's CLI surface — adds a non-CLI dependency that other loops can't substitute around.
- Re-invocation cost: every wakeup is a fresh `/ev-run` with full state refresh, learnings load, etc. Cheap per-call but adds up.
- Unclear whether the existing `schedule` / `loop` skills are stable composables for in-loop calls vs operator-facing slash commands only.

**Fit with existing substrate**: medium-low. Pulls in harness-substrate the ev-loops have so far avoided depending on directly.

#### (c) `Monitor` tool against a background `gh` invocation

**Mechanism**: launch a background bash process that runs `until gh pr view <branch> --json state -q .state | grep -q MERGED; do sleep 30; done`, then have the conversation `Monitor` that process. The Monitor primitive returns a notification when the process exits — at which point the loop body resumes and dispatches.

**Pros**:
- The background process owns the wait; the chat doesn't accumulate poll output.
- Cleanly integrates with the harness's wake-on-event primitive.
- The bash command is testable in isolation.

**Cons**:
- The wait still happens inside a chat session — long-running session health is the same problem as (a), just with a quieter transcript.
- Background processes don't survive session restarts; have to re-launch on resume.
- Less portable across loops than a recipe (each loop has to know the Monitor incantation).

**Fit with existing substrate**: medium. Composes a harness primitive but doesn't pollute the CLI surface.

#### (d) Hybrid: short-poll then schedule fallback

**Mechanism**: closing loop polls (option a) for a window (say 10 minutes — typical "I'll merge this right now after CI" window). If still OPEN at the window expiry, schedule a wakeup (option b) for longer-horizon checking and exit the conversation cleanly.

**Pros**:
- Optimizes for the common case (PR merges within minutes) with cheap polling, and gracefully degrades to scheduling for slow cycles.
- Operator stays in flow for the fast case (no context switch); for the slow case, they get a clean handoff and a "I'll wake up when it merges" promise.
- Minimal context burn when it matters (the long tail).

**Cons**:
- Two failure modes to think about (polling exhaustion + schedule failure), not one.
- Most complex of the four — more recipe surface to maintain.
- "Schedule" half still has the harness-coupling concern from (b).

**Fit with existing substrate**: medium. The polling half lands cleanly as a recipe; the schedule half is heavier.

#### (e) External cron / GitHub webhook

**Mechanism**: a GitHub Actions workflow on merge fires `gh` against a queue; some external process re-invokes Claude Code with the right slug + phase.

**Pros**:
- Truly session-independent. No long-running anything.
- Captures merge as an event, not as a polled state — closer to "the right shape" architecturally.

**Cons**:
- Heavyweight. Requires new infra outside the substrate (workflow, queue, re-invocation harness).
- Out of band — the substrate's "no `pr-merged` event" design (Phase 6 U1 of substrate-consolidation, `LOOM-CONVENTIONS.md:260-263`) explicitly retired event-shaped PR state. A webhook would re-introduce it as an out-of-band event.
- Not portable — only works in repos with the right Actions setup.

**Fit with existing substrate**: poor. Contradicts the derive-on-demand-from-`gh` design decision.

#### (f) `loom pr wait` verb (new) composed by a § Wait for merge recipe

**Mechanism**: add a new loom verb `bin/loom pr wait <slug> --branch=<branch> [--interval=30] [--timeout=3600]` that internally loops `gh pr view` until `state != OPEN` or timeout, returning the final state JSON. Add a recipe `§ Wait for merge` to `SUBSTRATE-COMPOSITIONS.md`. Closing loops invoke the recipe after `§ Compose PR`; `/ev-run` step 3 invokes it before surfacing the blocker.

**Pros**:
- Encapsulates the wait inside the loom CLI surface — composable like every other recipe; testable like every other verb (mock `gh`).
- Returns control on merge or timeout — predictable.
- Both loops + the router compose the same recipe; no skill-body forking.
- Internally can implement polling, harness scheduling, or a hybrid — the recipe hides the choice behind a stable interface.

**Cons**:
- Still has the underlying "what does the wait look like" question — but pushes the answer down to the verb implementation where it's a single code path, not a per-skill convention.
- New verb adds surface area; needs tests, fixtures, docs.

**Fit with existing substrate**: excellent. This is the substrate-shaped answer — every other "do a thing" in the loops dispatches through a recipe over a loom verb.

### Recommendation

**Option (f): new `loom pr wait` verb composed by `§ Wait for merge`**, with the verb's internal implementation starting as **simple `gh` polling (option a)** behind that interface. This is the substrate's existing pattern (every behavioral concern lives behind a recipe + verb), keeps the closing loops + router uniform, and leaves the door open to swap in scheduling or hybrid later without touching skill bodies.

Where the wait lives: **after `§ Compose PR` in the closing loop's phase-close step**, OR **in `/ev-run` step 3** before the "waiting on PR #X" surface. Worth grilling Evan on — phase-close is the natural "I just opened a PR, of course I'd wait for it" spot; router-step-3 is the natural "I'm trying to dispatch the next phase and can't yet" spot. The recipe goes the same place either way; only the call site differs.

**Gap this leaves**: doesn't address what happens if the session ends mid-wait. Polling-in-conversation requires a live agent. If the user closes the session, the next `/ev-run` invocation will see `state: MERGED` and dispatch fine — so it degrades gracefully — but the "fire and forget" promise that ScheduleWakeup would deliver isn't there. Acceptable, since long-session health is out of scope per user.

## Thread 2 — PR-writing consistency

### The gap

The codified spec, in `§ Compose PR` (`SUBSTRATE-COMPOSITIONS.md:286-289`):

> The `--body-file` is a markdown file the loop composes from the phase's checkin record (typically: `## Summary` + per-unit sections + `## Test plan` + `## Rollout` + `## Checklist`, per CLAUDE.md PR conventions).

What's specified: nothing concretely. "Typically" + a one-line section list + an external pointer to CLAUDE.md. No archetype-by-PR-type guidance (Evan's CLAUDE.md has five archetypes; the recipe picks one — and not the one PRs in this repo actually use).

What's missing:
- Mapping from phase type / project shape to PR archetype.
- Spec for `## Motivation` (clearly universal in practice, recipe doesn't mention it).
- Spec for the per-unit-section shape (everyone interprets this differently — some PRs have a `Solution` block with prose, some have a file-action table, some have both).
- Spec for `## Rollout` body — risk level format, what else.
- Spec for `## Checklist` items — which are universal, which are conditional.
- Treatment of phase-close PRs (the "Phase close + M1 close" / "What's next" pattern that appears in PRs #124, #127).

### Touch-point inventory

From PRs #123–#132 (sample of 10 merged PRs, sorted by frequency):

| Touch point | Frequency | Status |
|---|---|---|
| `## Motivation` | 10 / 10 | universal |
| `## Rollout` | 10 / 10 | universal |
| `## Checklist` | 10 / 10 | universal |
| `## Verification` | 9 / 10 | near-universal |
| `## Solution` | 7 / 10 | majority |
| `## Summary` | 4 / 10 | minority (sometimes substitutes for Motivation, sometimes pairs with it) |
| `## Substrate notes` | 2 / 10 | repo-specific |
| `## What's next` | 2 / 10 | phase-close coda |
| Risk level line in `## Rollout` | 10 / 10 | universal (always "Risk level: low / medium / minimal") |
| Title bracket prefix `[<area>]` | 9 / 10 | near-universal |

**Universal core**: `## Motivation`, `## Rollout` (with explicit risk level), `## Checklist`. Title with bracket prefix.

**Archetype-specific** (varies by PR shape):
- `## Solution` vs `## Summary` — Solution dominates (Architectural archetype in CLAUDE.md); Summary tends to appear when the PR is more migration-flavored or summarizing many small mechanical changes.
- `## Verification` — appears whenever there are concrete steps to verify (which is almost always for this repo's PRs).
- `## Substrate notes` / `## What's next` / `## Process notes` — phase-flavored codas; appear at phase boundaries.
- `## Retrospective` — archive PRs only.

**Inconsistent**:
- Per-unit section shapes (table vs prose vs bulleted change-list).
- Checklist items (some `[x] Verified locally`, some empty, some elaborate).
- Whether per-unit sections appear at all (single-checkin PRs vs multi-checkin phase PRs).

### Candidate approaches

#### (a) Codify the body shape in `§ Compose PR` (markdown spec, no enforcement)

**Mechanism**: rewrite the recipe's body-shape paragraph as an explicit per-archetype spec with section ordering, "always include," "conditional," "phase-close coda" buckets. Reference CLAUDE.md by section, not by file (pin the specific archetypes). Sub-agents read the recipe at PR-compose time and follow it.

**Pros**:
- Zero new code. Spec lives where the recipe already lives.
- Composable — both loops cite `§ Compose PR` already; they pick up the change for free.
- Reflects how the substrate handles every other consistency concern (recipes + idempotency stories).

**Cons**:
- No enforcement. Sub-agents drifting from the spec still produce drifty PRs.
- Spec proliferation — the recipe was deliberately one paragraph; explicit archetype tables make it heavier.

**Fit**: clean, low cost.

#### (b) Ship a `bin/loom pr compose-body` verb that emits the body from checkin records + manifest

**Mechanism**: add a verb that takes `<slug>` + `--phase=<N>` + `--archetype=<name>` and produces a markdown body composed from the phase's checkin records (titles → per-unit sections, `notes_for_pr` arrays → checklist hints, verdict states → verification, manifest config → labels/reviewers context). Closing loops invoke this instead of hand-composing the body.

**Pros**:
- Deterministic body shape — every loop produces the same skeleton.
- Composable from checkin data (already structured, already in the manifest) — the body becomes derived state, like `loom pr discover`.
- Testable like other verbs.
- Loops still get to inject `## Motivation` / `## Solution` prose (the things sub-agents are good at) while the structural skeleton stays uniform.

**Cons**:
- More substrate surface. New verb, tests, fixtures, docs.
- "Composed body" still requires the loop to fill prose sections — splits responsibility between verb (skeleton) and loop (content).
- Archetype selection adds a contract surface (which archetype does this PR want? — probably grill-me at phase close).

**Fit**: heavy but substrate-coherent.

#### (c) GitHub PR template at `.github/pull_request_template.md`

**Mechanism**: add a `.github/pull_request_template.md` containing the section skeleton. `gh pr create` (when called without `--body` / `--body-file`) auto-uses the template. Loops would have to either drop `--body-file` (and let the template seed the body, then update later) or include the template's section headers in their body composition.

**Pros**:
- GitHub-native; survives PRs created outside the loom flow (manual `gh pr create`, GitHub web UI).
- Discoverable — a reviewer sees the same structure regardless of how the PR was opened.

**Cons**:
- Conflicts with the `--body-file` flow today (`pr open` always passes `--body-file`; template is overridden).
- Static — can't adapt by archetype (the template would have to be the universal-superset shape, which most PRs would over-fill).
- Easy to drift between template + recipe spec; two sources of truth.

**Fit**: clashes with the existing `--body-file` invariant.

#### (d) Linter / evaluator that flags PRs missing required sections post-open

**Mechanism**: add an `evaluator-pr-body` agent (or a `bin/loom pr lint` verb) that reads the PR body via `gh pr view <number> --json body`, checks for required sections (Motivation / Rollout / Checklist), and surfaces flagged-finding diagnostics. The loop runs the lint after § Compose PR; flagged → re-compose body.

**Pros**:
- Catches drift at the substrate layer rather than relying on sub-agent discipline.
- Fits the existing guild evaluator pattern.

**Cons**:
- Reactive, not generative — the body still has to be composed somewhere else; this is a gate after the fact.
- Slow feedback loop (eval → fix → eval).
- Adds an evaluator surface to maintain in lockstep with the spec.

**Fit**: complements (a) or (b) rather than replacing them.

#### (e) Hybrid — recipe spec + body-compose verb that fills it

**Mechanism**: do (a) AND (b). Spec lives in `§ Compose PR`; verb fills the skeleton deterministically from checkin records; loops invoke the verb, then layer prose into the named-section slots. Optionally add (d) as a post-open gate for catching drift in the prose sections.

**Pros**:
- Best of both worlds: structural consistency (verb output) + prose latitude (loop fills sections) + spec discoverability (recipe doc).
- Each layer reinforces the others.

**Cons**:
- Most surface area to ship. Spec + verb + tests + (optionally) eval.
- Risk of over-engineering — for two phases / two PRs of this project, (a) alone might be enough.

**Fit**: substrate-coherent but heavy for the size of the problem.

### Recommendation

**Start with (a): codify the body shape in `§ Compose PR`.** Make it concrete (section list with which are required vs conditional, per-archetype guidance pinned to CLAUDE.md's archetypes, what the Rollout body looks like, what the Checklist items are for this substrate). This is the cheap, high-leverage move — every closing loop already cites the recipe, so a spec update propagates everywhere for free.

**Leave (b) / (d) as deferred follow-ups** flagged in the PLAN.md `## Open questions` or `## Risks`. If after a few phases the recipe-only approach still produces drift, escalate to a body-compose verb or a lint evaluator. The substrate's bias toward "spec it once, see if the drift goes away" before "add enforcement infra" matches Evan's stated preference for incrementalism.

**Don't do (c).** GitHub templates fight the `--body-file` flow.

**Gap this leaves**: prose-section content (the actual `Motivation` text, the `Solution` description) is still up to the composing sub-agent. The spec can pin the *shape* but not the *content*. If sub-agents continue to write motivation-as-summary or skip verification details, the spec alone won't catch it — that's where (d) eventually earns its keep.

## Cross-thread considerations

The two threads intersect at one concrete spot and a few softer ones:

- **Post-merge body update**. If Thread 1 lands a wait-for-merge mechanism, the substrate now has a hook point at "the PR merged." That's a natural moment to do one final body update — close out the per-unit sections with their merged-state markers, freeze the verification snapshot, etc. Probably worth doing if § Wait for merge exists; not worth doing standalone.

- **Phase ordering**. The two phases are independently shippable, but Thread 2 is the more contained one (pure spec work in `§ Compose PR`, no new verbs, no harness coupling). Thread 1 has more open shape decisions (verb interface, call sites, what timeout looks like). Doing Thread 2 first means subsequent Thread 1 work benefits from the codified body shape (the post-merge body update has a target to update *toward*). Doing Thread 1 first means the auto-resume is in flight while body conventions are still informal — fine, but a missed compounding opportunity.

- **Recommended phase order**: Phase 1 = Thread 2 (codify body shape in `§ Compose PR`). Phase 2 = Thread 1 (auto-resume via `loom pr wait` + `§ Wait for merge`). This sequence also matches risk profile (low-risk doc edits first, new substrate verb second) and Evan's "setup → bulk migration → cleanup" decomposition pattern, even though it's only two phases.

- **Stale-doc cleanup opportunity**. While Phase 1 is in `SUBSTRATE-COMPOSITIONS.md` anyway, fix the stale "After open, the loop calls `§ Phase update` with `--pr=<number> --url=<url> --pr-state=open`" at lines 291-293 — those flags were retired and the verb returns `pr-flags-unsupported`. Either fold this into Phase 1 or call it out as scope-adjacent.

## Open questions for /loom-plan

1. **Where does the wait live?** Inside the closing loop's phase-close step (after § Compose PR), or inside `/ev-run` step 3 before the blocker is surfaced, or both compose the same recipe? The recipe-shaped answer wants both call sites to look identical, but the operator-experience answer might differ — "the loop that just opened the PR is the one that waits for it" vs "the router is the place that knows whether a wait is needed."

2. **Polling cadence + timeout?** 30s / 60s polling? 30min / 1hr / 6hr timeout? What does the loop do on timeout — save session and exit, or surface "still open, run `/ev-run` again later"? This affects the verb's flag surface.

3. **Auto-mode shape for the wait.** Today `--mode=auto` skips human-paired interactions; what does it do for a merge wait? Probably "wait the full timeout silently, no per-poll output" — but worth being explicit so the verb knows its UX modes.

4. **Archetype selection for the body.** Does the closing loop ask "which archetype is this PR?" (grill-me style) or infer from phase metadata (e.g. config.json adds a `pr_archetype` field, or PLAN.md phases declare one)? For this substrate repo, "Architectural" is the right default for most phases — but Evan's CLAUDE.md has five and the recipe should be explicit about which the substrate's loops default to.

5. **Per-unit-section shape.** When a phase has multiple checkins (multiple units), how do they render in the PR body? Table-of-actions (PRs #132 use this)? Prose summary per unit (PR #130 leans this way)? Bulleted change list? Worth picking one shape so sub-agents stop drifting.

6. **Checklist content.** What goes in the universal Checklist for this substrate repo? Evan's CLAUDE.md template includes i18n, Happo, accessibility — none apply here. The substrate-repo checklist is closer to `[ ] Tests added or updated`, `[ ] sync-shared run (if commons/cli/lib or commons/docs touched)`, `[ ] Verification commands pass`. Worth pinning explicitly.

7. **Cleanup of the stale `§ Compose PR` text**. In-scope for Phase 1 alongside the spec, or out-of-scope follow-up? Recommend in-scope — fixing the contradiction while you're in the file is cheap.

## Sources

- `plugins/ev/skills/ev-loop-interactive/SKILL.md:697-702` (phase close, hands back to router)
- `plugins/ev/skills/ev-loop-confidence/SKILL.md:241-248` (same shape)
- `plugins/ev/skills/ev-run/SKILL.md:197-210` (router step 3, where the pause surfaces)
- `plugins/ev/skills/ev-run/SKILL.md:123-140` (loom pr discover as the live-state primitive)
- `plugins/commons/docs/SUBSTRATE-COMPOSITIONS.md:265-315` (§ Compose PR recipe)
- `plugins/commons/docs/SUBSTRATE-COMPOSITIONS.md:286-289` (the soft body-shape spec)
- `plugins/commons/docs/SUBSTRATE-COMPOSITIONS.md:291-293` (stale `--pr-state=open` reference; conflicts with line 99-101 and `phase.ts:155`)
- `plugins/commons/docs/LOOM-CONVENTIONS.md:255-263` (Phase-6 U1 retirement of pr-event vocabulary; derive-on-demand rationale)
- `plugins/loom/cli/verbs/loom/pr.ts:42-72` (the `prDiscover` shape — number/url/body/state)
- `plugins/loom/cli/verbs/loom/pr.test.ts:60-108` (state OPEN/MERGED contract)
- `/Users/krambuhl/.claude/CLAUDE.md:488-531` (Evan's five PR archetypes + universal Rollout / Checklist)
- PRs #123–#132 (merged in this repo, sampled via `gh pr list --state merged --limit 12 --json number,title,body`) — section-heading frequency analysis
- No `.github/pull_request_template.md` exists; `.github/` directory absent
- `gh` version 2.81.0; `gh pr view` supports `--json state,mergeStateStatus,mergedAt`; no built-in `gh pr wait-merge`; `gh pr merge --auto` exists for the inverse direction
