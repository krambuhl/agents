# Substrate compositions

Named recipes the loop bodies (`/ev-loop-interactive`,
`/ev-loop-confidence`, `/ev-run`, `/loom-archive`) cite when
calling the loom / guild / griot CLIs. Each recipe wraps
one or two CLI invocations in a small composition with a stable
idempotency story and named failure modes. Loops cite recipes by
section heading (`§ <Recipe>`); this file is the authoritative
resolution target.

Companion docs:
[`AGENT-CONVENTIONS.md`](./AGENT-CONVENTIONS.md) for the
citation rules and cross-skill rituals;
[`LOOM-CONVENTIONS.md`](./LOOM-CONVENTIONS.md) for the artifact
shapes the recipes mutate.

## Recipe template

Every recipe in this doc follows the same five-field shape, in
this order:

1. **Purpose** — one sentence describing what the recipe
   accomplishes at the behavioral level. Not "what the CLI does",
   but what the loop is trying to achieve by calling it.
2. **Wraps** — the exact CLI invocation shape, including
   canonical flags. If the recipe is a composition of multiple
   verbs, all of them appear here in invocation order.
3. **Idempotency** — what happens when the recipe is called
   twice in a row. One of: `safe` (re-running is a no-op or
   produces identical result), `fails-loud` (re-running errors
   with a named code), `not-idempotent` (re-running causes state
   drift; caller must guard).
4. **Failure modes** — the named errors the recipe can surface,
   and what the calling loop is expected to do about each. Loops
   that respond to failure with prose-parsing instead of named
   codes are anti-pattern; recipes carry their failure vocabulary
   here.
5. **Used by** — back-references to the skill bodies that cite
   this recipe. Maintained by the Phase 1.3 grep cross-check
   (expected to graduate to a CI-enforced test in a later phase).

A recipe with anything beyond these five fields is the exception,
not the norm. Examples (worked invocations in realistic context)
land inside the Purpose or Wraps fields as needed.

The substrate convention from
[`AGENT-CONVENTIONS.md`](./AGENT-CONVENTIONS.md): a bare
`§ <Recipe>` resolves here. A `§ <Section> below` is skill-local
to the citing skill body.

## § State refresh

**Purpose**: Synchronize the loop's view of project state before
making decisions. Refreshes git remote state, reads the manifest,
and reads the recent event log so the loop knows what's merged,
what's in flight, and what changed since the last checkpoint.

**Wraps**:

```bash
git fetch origin
bin/loom project read <slug> --pretty
bin/loom events read <slug> --limit=20 --pretty
```

The `git fetch` is mandatory; the loom reads are read-only and
side-effect free.

**Idempotency**: `safe`. Running twice produces the same view
(modulo any state that changed remotely between calls). Never
mutates local working tree.

**Failure modes**:

- `git-fetch-failed` (network outage, auth misconfiguration) →
  loop should stop and surface to operator; cannot proceed
  without remote refresh.
- `project-not-found` (slug unresolvable) → loop should
  forward the loom error verbatim and stop.
- `dirty-tree` is **not** a failure of this recipe; this recipe
  is read-only. Dirty-tree detection lives in the dispatch flow
  of `/ev-run` and individual loop pre-flight steps.

**Used by**: `/ev-loop-confidence` (line 127), `/ev-loop-interactive`
(line 124).

## § Phase update

**Purpose**: Update a phase's status (`not-started` →
`in-progress` → `completed`, with `blocked` as an off-path
state) and optionally record the branch. Emits the matching
event (`phase-started`, `phase-completed`, etc) as a side
effect.

**PR state is intentionally NOT recorded here**: loom's design
treats PR state as derived-on-demand via `bin/loom pr discover`
(gh pr view + the checkin marker), not cached in the manifest
and not emitted as events — see `manifest-toml.ts:299-302` and
`types.ts:83-86` for the architecture markers. Calling `phase
update` with `--pr` / `--url` / `--pr-state` returns
`pr-flags-unsupported` rather than silently dropping them.

**Wraps**:

```bash
bin/loom phase update <slug> <phase-number> \
  --status=(not-started|in-progress|blocked|completed) \
  [--branch=<branch>] \
  [--reason=<text>]   # required when --status=blocked
```

The verb is **single-writer-serialized** per
`projects/CONVENTIONS.md` § Category 3 (target:
`projects/<slug>/manifest.toml`'s `[[phases]]` section).

**Idempotency**: `safe` when the target state matches current
state (the verb is a no-op write). `not-idempotent` across
state transitions: calling with `--status=in-progress` on a
phase that's already `completed` overwrites the completion.
Loops should check current state before transitioning when
that distinction matters.

**Failure modes**:

- `missing-args` → required field absent (slug, phase number,
  status; or `--reason` when status=blocked). Operator error;
  loop should surface to operator.
- `invalid-phase` (non-integer phase number) → operator error.
- `pr-flags-unsupported` → operator supplied `--pr` / `--url` /
  `--pr-state`; use `bin/loom pr discover` instead.
- `project-not-found` → forward the loom error verbatim.
- `phase-not-in-manifest` (the phase number doesn't exist on
  this project) → forward verbatim; likely indicates plan drift.

**Used by**: `/ev-loop-confidence` (lines 188, 370 / 374),
`/ev-loop-interactive` (lines 310, 385).

## § Checkin write

**Purpose**: Record a unit of work as an immutable checkin entry
appended to `projects/<slug>/manifest.toml`'s `[[checkins]]`
section. The checkin captures contract + execution + verdict +
corrections + notes for the PR. Auto-emits a `checkin-created`
event.

**Wraps**:

```bash
bin/loom checkin write <slug> --checkin-file=<path-to-json>
```

The JSON file at `<path-to-json>` is the full Checkin record (see
[`LOOM-CONVENTIONS.md`](./LOOM-CONVENTIONS.md) § `[[checkins]]` for
shape). Loops compose the JSON in-memory or in a temp file, pass
the path here, and the verb appends it to the manifest's
`[[checkins]]` section under atomic temp + rename.

**Partitioned** per `projects/CONVENTIONS.md` § Category 2 — the
partition is `(branch, number)`.

**Idempotency**: `fails-loud`. Checkins are immutable. Re-writing
the same `<NN>` fails with `checkin-already-exists`. To record a
later state of the same unit (e.g. resolution after a flagged
verdict), the loop writes a new checkin with a fresh `<NN>`.

**Failure modes**:

- `missing-slug` → loop bug; surface to operator.
- `missing-args` (missing `--checkin-file`) → loop bug; surface.
- `checkin-file-unreadable` → loop wrote a bad path or the temp
  file disappeared; surface to operator.
- `invalid-checkin` (JSON parse error or missing required fields:
  `schema_version`, `number`, `branch`) → loop bug; surface.
- `checkin-already-exists` → the checkin number collided. Loop
  should re-pick the next number (next monotonic integer past the
  highest existing under the branch) and retry.
- `project-not-found` → forward verbatim.

**Used by**: `/ev-loop-confidence` (lines 239, 320, 369),
`/ev-loop-interactive` (line 309).

## § ADR-emit hook

**Purpose**: At unit close (between scope-shift detection and
phase update), scan the just-written checkin's `notes_for_pr`
array for entries containing the literal `[adr-candidate]` marker
and, per match, offer the operator the chance to lift the entry
into a real Architectural Decision Record via the `loom adr` verb.
The marker is the operator's intent; the recipe is the offer
mechanism. The emitted ADR rides the same git commit as the
manifest update (one revertable bundle), produced by the verb's
`--no-commit` flag and the loop's staging of the returned ADR
path.

**Wraps**:

```bash
node plugins/loom/cli/loom.ts adr "<title>" \
  --body-file=<tmp-path> \
  --no-commit
```

The body file at `<tmp-path>` is composed by the calling loop in
three sections: Context (paraphrase of the marked entry + the
unit's contract goal), Decision (the decision the operator named
in the entry), Consequences (a literal `TODO: operator to fill
before commit` line — the body is intentionally incomplete). The
loop captures the verb's returned ADR path from the JSON output
and stages it for the unit's git-add list so the ADR commits with
the manifest.

The `node plugins/loom/cli/loom.ts` invocation (rather than bare
`loom`) is the encoded substrate path — see
`2026-05-28-loom-adr`'s P2D2 `notes_for_pr` for the cached-PATH-
binary lag pattern that drove the choice.

**Idempotency**: `not-idempotent`. Each invocation produces a new
ADR with the next available number (max + 1; gaps are not reused).
The hook fires once per unit close, per match — re-running the
loop on the same already-committed unit does not re-surface
markers (the close path only fires once per unit), but a unit
with three marker entries produces three ADRs in three
invocations.

**Events emitted by the calling loop** (not by the verb itself):

- `adr-emitted` with detail `{slug, phase, unit, adr_number,
  adr_path, marker_excerpt}` — fires after the verb returns
  successfully and the ADR is staged for the unit's git-add list.
- `adr-emit-declined` with detail `{slug, phase, unit,
  marker_excerpt}` — fires when the operator picks "skip this
  marker" on the `AskUserQuestion` offer. Captures the substrate
  signal that a candidate was surfaced but declined, useful for
  forensics on marker-usage patterns.

**Failure modes**:

- `unknown-verb` (from a stale cached `loom` binary, NOT from this
  recipe's `node …/loom.ts` invocation) → would indicate the
  encoded calling pattern was downgraded to bare `loom`; surface to
  operator as a regression of the substrate convention.
- `body-file-unreadable` → loop wrote a bad temp path or the file
  disappeared; surface to operator.
- `adr-log-write-failed` (filesystem error writing to
  `projects/adr-log/`) → forward verbatim; the unit is not
  committable until the operator resolves.
- Marker present but operator declines on every match → no failure
  (this is the normal decline path); only the `adr-emit-declined`
  events fire.

**Operator-opt-in posture**: the hook never auto-emits. Every
candidate surfaces an `AskUserQuestion` before any ADR file is
written. In auto-mode (`--mode=auto`), the per-match
`AskUserQuestion` is replaced by `evaluator-contract-fit` reading
the marked entry against `ADR-0001`'s conventions (`approved` →
accept, `flagged` → decline); the title is synthesized from the
first ~7 words of the marked entry.

**Used by**: `/ev-loop-interactive` § Step 2 unit loop, sub-step
5.5 (ADR-emit). Other loops (e.g. `/ev-loop-confidence`) do not
cite this recipe today — bulk-transform shapes are out of scope
for ADR emission (architectural decisions surface in
human-paired work, not codemod sweeps).

## § Compose PR

**Purpose**: Open the phase's pull request on first checkpoint, or update the existing PR's body and metadata on subsequent checkpoints to reflect the latest checkins and verification state. Composes the PR body from the phase's checkin record trail under the body-shape spec below.

### Title

`[<area>] <descriptive verb>` — required bracket prefix. `<area>` is the project slug area or substrate area being touched (e.g. `loom-adr`, `guild-matrix-precompile`, `ev-loop-pr-flow`). Fallback `[meta]` is reserved for PRs that touch no plugin's authoritative content AND no shared `commons/` source — typically repo-wide chore / tooling / CI work. Most PRs have a real area; reaching for `[meta]` when uncertain is drift.

### Body shape

The body is composed top-to-bottom in three layers, preceded by a project-context callout.

**Project-context callout** (first line, every PR): a GitHub `> [!NOTE]` block containing (i) a markdown link to the project's `PLAN.md` (e.g. `[2026-05-28-ev-loop-pr-flow](../tree/main/projects/2026-05-28-ev-loop-pr-flow/PLAN.md)`) and (ii) one sentence naming how this PR slots into the broader goal — which phase, which unit if applicable, what gets unblocked next. Worked example:

```markdown
> [!NOTE]
> Part of [2026-05-28-ev-loop-pr-flow](../tree/main/projects/2026-05-28-ev-loop-pr-flow/PLAN.md) — closes Phase 1 (codify PR body shape in `§ Compose PR`), unblocks Phase 2 (auto-resume verb).
```

For the rare PR not tied to a loom-managed project (a one-off `[meta]` PR with no PLAN.md), the callout carries the orientation sentence alone; no broken link.

**Core layer** (required, every PR): `## Motivation` → `## Rollout` → `## Checklist`. The minimal viable PR ships only the Core layer plus the project-context callout.

**Body layer** (required when the PR has substantive code or observable verification): `## Solution` → `## Verification`. Pure-doc / pure-spec PRs may strike both. The action table (see below) renders inside `## Solution`. `## Verification` names observable claims a reviewer can re-run — *not* "we wrote tests" (that belongs in `## Checklist` as `Added tests`).

**Coda layer** (optional, phase-transition PRs only): one of `## What's next` (forward-pointing context about the next phase or unit) or `## Substrate notes` (cross-cutting impact the reviewer should keep in mind). Other ad-hoc coda headings (`## Process notes`, `## Phase close`, etc) are drift — fold their content into one of these two named codas or into the Motivation paragraph; strike before merge.

### Per-section content

**`## Motivation`** — one paragraph naming why this change exists. State the diagnosed problem and its evidence, not what the diff does. Test: if the Motivation could have been written by reading PLAN.md alone without seeing the diff, it has drifted into exit-criteria-as-prose; rewrite to anchor in the specific friction this PR removes.

**`## Solution`** — one short paragraph of connective tissue naming the through-line across units, followed by a markdown action table:

```markdown
| Action | Subject |
|---|---|
| Rewrite | § Compose PR body-shape spec |
| Fix | stale `--pr-state=open` text at the post-open paragraph |
| Sync | downstream consumer-plugin docs |
```

One row per unit. `Subject` names what the action is *about* at the conceptual level — a recipe, a verb, a section, a doc — *not* the file path. Concept references are short by nature; file dumps in the Subject column are an anti-pattern (the diff lists files; the table names concepts).

**`## Verification`** — observable claims a reviewer can re-run. Example: a specific command they can execute, a specific URL they can hit, a specific log line they can grep for. "I ran `npm test` and it passed" belongs in `## Checklist` (`verified-solution-works`); "the new `bin/loom pr wait` verb exits zero on `state: MERGED` after a real merge" is a Verification claim.

**`## Rollout`** — checklist of safety items, struck or N/A'd at compose time when inapplicable:

```markdown
- [ ] Safe to rollback — can be rolled back within 48 hours of merge without detrimental effects to users or systems
- [ ] Behind a feature flag: `{name}`
- [ ] Behind an experiment: `{name}` [variant1, variant2, ...]
```

Substrate-repo PRs typically tick only the rollback line and strike the other two; product-repo PRs may use all three.

**`## Checklist`** — substrate-default items, every PR. Per-phase override via `**Checklist-extras**: i18n, a11y` block in the PLAN.md phase heading adds product-flavored items when needed.

```markdown
- [ ] Verified that the solution works
- [ ] Added tests for new functionality
- [ ] `sync-shared` ran (if repo-root `docs/` was touched)
- [ ] `npm test` green
```

Adapt-at-compose-time: strike items that don't apply (e.g. "Added tests" for a pure-doc PR). Mark with `~~` strikethrough rather than removing — preserves the spec footprint and surfaces the omission.

### Voice and length

Terse, direct, third-person. State what changed and why. Trust the reviewer to read the diff for the *how* — re-narrating file changes that the diff already shows is the dominant drift this spec is designed to catch.

**Don't re-narrate the diff** (load-bearing rule):

- Bad sentence: "Adds three sections to the recipe: Motivation, Solution, Verification, plus updates to Rollout and Checklist." (The diff shows this.)
- Good sentence: "Codifies the body shape that PRs #123–#132 already converge on, removing the spec/practice gap." (Names the why; reviewer doesn't need the diff to verify the claim.)

**Don't re-narrate the diff at paragraph scale either** — the failure mode is subtler than per-sentence drift. A Motivation paragraph can read WHY-shaped while being the PLAN.md exit criteria reworded as prose. Test: if the paragraph could have been written by reading PLAN.md alone without seeing the diff, it has drifted into exit-criteria-as-prose. Motivation says *why this problem matters now*, not *what this PR does*.

Body length target: ~300 words, under 2 minutes to read. This is a *voice proxy*, not an enforced limit — terse third-person prose tends to hit it; confessional prose busts it. When a PR genuinely needs more (multi-domain phase, complex Verification claims), longer is fine. When over budget without good reason, cut: first per-unit prose that the action table covers, then Verification details that duplicate the action table, then Motivation that drifts into exit-criteria-as-prose.

### Archetype

Default: **Architectural**. In this substrate repo, most PRs land Architectural — substrate work is shape-defining by default. Refactor and Dependency apply on the margins; Migration and Bug fix are rare here. Per-phase override via `**Archetype**: <name>` block in the PLAN.md phase heading (convention-only; the loom CLI parser does not consume this block today — sub-agents read it from PLAN.md prose when composing the PR body).

If the compose-time work shape doesn't match the declared archetype (e.g. Phase 2 declared Architectural but landed as Refactor), update the PLAN.md archetype block alongside the PR body, or accept the declared archetype as the frame and note the divergence in `## Substrate notes`. Don't silently mismatch.

### After open

After `pr open` succeeds, the loop calls `§ Phase update` with `--status=in-progress --branch=<branch>` to record that the phase is now in flight. PR state (number, URL, merge status) is **not** cached in the manifest — it is derived on-demand from `gh pr view` via `bin/loom pr discover` whenever a loop needs it. The retired `--pr=<number> --url=<url> --pr-state=open` flags (see § Phase update) reflect this design choice: PR state lives in `gh`, not in substrate state.

**Subscribe to PR activity (first open only).** Immediately after a *fresh* `pr open` succeeds (not on `pr update` checkpoints — the subscription persists for the PR's life), register a PR-activity subscription for the new PR by calling the harness `mcp__github__subscribe_pr_activity` tool with the freshly-opened PR number. This is what lets the router *move on* instead of block-polling: once a PR is subscribed, review comments, CI results, and the eventual merge re-wake the session, so the router can park the run and resume on its own (`/ev-run` step 3). The subscription is a wake convenience, **never** a correctness dependency — PR state is still derived on demand via `pr discover` (see `LOOM-CONVENTIONS.md`, the no-`pr-*`-event note). If the subscribe tool is unavailable — a local `gh`-only session with no managed harness — skip it silently and report `PR subscription: unavailable` in the loop's return so the router falls back to the blocking § Wait for merge poll. A subscribe failure never blocks the open or the rest of the loop.

**Wraps** — two-step composition (open-or-update):

```bash
# discover whether a PR already exists for this branch
bin/loom pr discover <slug> --branch=<branch>

# if no PR exists yet:
bin/loom pr open <slug> --branch=<branch> --title=<title> --body-file=<path> \
  [--base=<parent-branch>]   # stacked PR: target the parent, not the repo default

# if a PR exists:
bin/loom pr update <slug> --pr=<number> --body-file=<path>
```

The `--body-file` is a markdown file the loop composes per the **Body shape** spec above.

**Idempotency**: `safe`. `pr discover` is read-only. `pr open`
fails-loud with `pr-already-exists` if invoked when a PR is
already open (so the loop's discover-first pattern is what
prevents double-open); `pr update` overwrites the body, which is
idempotent across same-body invocations.

**Failure modes**:

- `gh-cli-missing` / `gh-auth-failed` → operator must
  authenticate `gh` before the verb works.
- `branch-not-pushed` → loop must `git push -u origin <branch>`
  before `pr open` succeeds.
- `pr-already-exists` (from `pr open`) → loop's discover step
  should have caught this; if it fires, loop bug or race.
- `body-file-unreadable` → loop wrote a bad path; surface.
- `pr-not-found` (from `pr update`) → likely the PR was closed
  out-of-band; loop should re-discover and possibly re-open.

**Used by**: `/ev-loop-confidence` (lines 187, 372, 374, 427,
470), `/ev-loop-interactive` (lines 311, 314, 384, 409),
`/loom-archive` (line 166).

## § Wait for merge

**Purpose**: Block the router on an in-progress phase's PR until the PR reaches a terminal lifecycle state (merged, closed-without-merge), the wait times out, or the underlying `gh` CLI fails persistently — then route the next step by which of those four outcomes occurred. Composes `bin/loom pr wait` so the router never has to inline polling itself, and so a future implementation swap (in-conversation polling → `ScheduleWakeup` → hybrid → external webhook) doesn't ripple into the skill body.

**Fallback, not the default path.** The webhook leg of that swap has landed: PRs are subscribed at open (§ Compose PR, "After open"), so the router's default posture is event-driven — park and exit, let the PR-activity wake resume the run (`/ev-run` step 3). This blocking poll is the **fallback** for sessions where subscription is unavailable (a local `gh`-only run, where the loop reported `PR subscription: unavailable`). In a subscribed session the router does not call this recipe at all.

The verb the recipe wraps is **observation-only**: it reads `gh pr view` repeatedly, writes nothing to the manifest, emits no events. The "no pr-* event" decision (`LOOM-CONVENTIONS.md:255-263`, anchored at Phase-6 U1 of substrate-consolidation) is load-bearing for this design — adding `pr-wait-started` / `pr-wait-merged` events would re-open that closed argument by the back door.

The verb returns `{number, url, state, exitReason, mergedAt?, lastError?}` where `exitReason` is one of `'merged' | 'closed' | 'timeout' | 'gh-failed'`. The router uses `exitReason` as the dispatch discriminant (not the raw `state` field — `state: CLOSED` could mean either operator-merged-then-closed-the-branch or operator-closed-without-merging, only `exitReason` disambiguates). The router's four branches are documented in `/ev-run` step 3.

The verb re-resolves the PR from the branch on each poll (it does not cache the PR number from the first poll), so a force-push that closes the old PR and opens a new one with a different number is visible to the caller — the wait returns the LAST observed PR number, not the first.

**Silencing rule**: `--quiet` silences routine per-poll status output (one entry-line + one exit-line); it does NOT silence the `gh-failed` exit. Terminal failures (auth expired, rate limit, persistent gh non-responsiveness) break silence by design — silent during routine polls, informative during trouble. Auto-mode callers (the router under `--mode=auto`) pass `--quiet` through to the verb.

**Wraps**:

```bash
bin/loom pr wait <slug> --branch=<branch> \
  [--interval=30]    \
  [--timeout=1800]   \
  [--quiet]
```

Defaults: 30s polling interval, 30min total wait. Both flag values are SECONDS without a unit suffix (the upgrade path to `30s` / `30m` duration parsing is noted in the verb source, deferred until a second duration flag lands somewhere in the CLI). The verb exits 0 in all four `exitReason` cases — `timeout`, `closed`, and `gh-failed` are NOT errors, they're terminal exit reasons returned cleanly.

**Idempotency**: `safe`. Called twice against the same branch returns the same shape — the loop ends at the first terminal state. Two concurrent invocations against the same branch are harmless (both observe gh, no shared write state). Called after a timeout exit, the next invocation polls again from scratch with no memory of the prior timeout — the substrate's posture is "ask gh, don't remember."

**Failure modes**:

- `missing-slug` / `missing-args` → operator wiring error; surface verbatim and stop.
- `invalid-interval` / `invalid-timeout` → caller passed a non-positive integer; surface and stop.
- `pr-not-found` → first poll returned no PR for the branch. The wait verb assumes the PR already exists; opening it is `pr open`'s job. Surface "open the PR first via `pr open`, then re-run `/ev-run`" and stop.
- `gh-cli-missing` / `gh-auth-failed` → these surface inside the verb as the `gh-failed` exit reason (the verb tracks K=3 consecutive gh failures before emitting). The router translates this exit into "wait failed: gh CLI not responding (last error: `<msg>`); check `gh auth status` and re-run `/ev-run`" and stops.
- Note: `timeout` and `closed` are NOT errors — they're terminal exit reasons returned with exit code 0 and `exitReason` discriminant. The router treats them as routable outcomes, not failures.

**Used by**: `/ev-run` step 3, **fallback leg only** — the router composition that takes the wait result and dispatches by `exitReason` when the open PR is not subscribed (local `gh`-only session). Subscribed sessions park-and-exit instead; see § Compose PR "After open".

## § Revise PLAN.md

**Purpose**: Update the project's `PLAN.md` after the work shape
has changed — typically because a unit surfaced a scope shift
that the two-signal rule accepted (`/ev-loop-interactive` step 5
on the inner-RPI accept path, which composes this recipe via
`/loom-revise-plan` as a sub-agent).

**Wraps**:

```bash
bin/loom revise-plan <slug> \
  --revision-file=<path-to-revised-PLAN.md> \
  --rationale=<one-line summary>
```

The verb writes the supplied revision content to
`projects/<slug>/PLAN.md`, appends a dated entry to the
`## Revision log` section with the rationale, and commits via
the existing git seam. The grill-me interview that produces the
revision content lives in the `/loom-revise-plan` skill, not in
this CLI verb — the verb is the deterministic file IO seam. This
is **single-writer-serialized** per `projects/CONVENTIONS.md`
§ Category 3 (target: `projects/<slug>/PLAN.md`, exception:
`PLAN.md`).

**Idempotency**: `not-idempotent`. Each invocation appends a new
revision-log entry and prompts the operator for a fresh
revision. Re-running is meaningful (a second, separate revision).
Loops should call this exactly when the scope-shift acceptance
fires, not on every loop iteration.

**Failure modes**:

- `project-not-found` → forward.
- `interview-aborted` (operator cancelled the grill-me partway
  through) → no write happened; loop should treat as "revision
  declined" and continue without a plan change.
- `plan-write-failed` (filesystem error) → surface to operator.

**Used by**: `/ev-loop-confidence` (lines 331, 355),
`/ev-loop-interactive` (lines 271, 295).

## § Capture finding

**Purpose**: Write a `[portable]`-marked finding from a plan
engineer, an evaluator, or a checkin correction into the griot
learnings system as a session-note. The note becomes input to
`/griot-compact` for promotion into the substrate-wide rollup.

**Wraps** — two pathways:

```bash
# from a checkin's corrections array:
bin/griot capture --from-checkin=<path> --slug=<slug> [--correction-text=<text>]

# from an evaluator finding (recurring threshold or other classification):
bin/griot capture --evaluator-finding=<classification> \
  --evaluator-name=<name> --code=<code> --evidence=<text> \
  --slug=<slug> [--file-line=<path:line>] [--frequency-count=<N>]
```

Classifications supported by the current verb:
`recurring` (requires `--frequency-count`). Others are reserved
(`generator-antipattern`, `catalog-gap`, `evaluator-conflict`,
`sanctioned-exception`) — not yet implemented.

**Partitioned** per `projects/CONVENTIONS.md` § Category 2 — the
partition is the session-note folder under
`learnings/session-notes/<folder>/`.

**Idempotency**: `safe`. The verb's partition shape uses
timestamps + content hashes so duplicate captures don't collide;
the write is effectively content-addressed.

**Failure modes**:

- `capture-error` (missing required flag) → loop bug; surface.
- `not-yet-supported` (the named classification isn't
  implemented) → loop should fall back to a simpler
  classification or skip the capture.
- `from-checkin-unreadable` → bad path; loop bug; surface.

**Used by**: `/ev-loop-confidence` (lines 486 / 487),
`/ev-loop-interactive` (lines 251, 427).

## § Triage PR comments

**Purpose**: Read the PR's outstanding comments, classify each as
blocker / nit / out-of-scope / answered, and draft per-comment
responses to land in the unit loop's correction queue. Composes
the GitHub fetch with a per-comment response markdown.

**Wraps**:

```bash
# fetch the comments:
bin/loom pr comments <slug> --pr=<number>

# for each comment that warrants a written response:
bin/loom pr respond <slug> --pr=<number> --comment-id=<id> --body-file=<path>
```

`pr respond` writes the response markdown to
`projects/<slug>/checkins/<branch>/responses/<id>.md` per the
partitioned-write convention; the loop's later GitHub-post step
(or a separate `gh pr review` action) actually replies to the
thread.

**Partitioned** per `projects/CONVENTIONS.md` § Category 2 — the
partition is `(branch, comment-id)` under `responses/`.

**Idempotency**: `pr comments` is `safe` (read-only). `pr respond`
is `fails-loud` on duplicate `<id>.md` files (immutable response
records); to revise a response, write a new file with a suffixed
id (`<id>-v2.md` is the convention).

**Failure modes**:

- `pr-not-found` → operator passed a PR number that doesn't
  belong to this project. Surface.
- `gh-cli-missing` / `gh-auth-failed` → operator must
  authenticate `gh`.
- `response-already-exists` (from `pr respond`) → operator can
  inspect the existing response and choose to skip / suffix.

**Used by**: `/ev-loop-confidence` (line 466),
`/ev-loop-interactive` (line 407), `/ev-run` (line 137).

## § Derive panel

**Purpose**: Compute the evaluator panel for a unit's file list,
based on the file-type → evaluator mapping in
`docs/PANEL-COMPOSITION.md`. Called immediately before
`/guild-validate` so the spawned panel matches the artifact.

**Wraps**:

```bash
echo "<path>\n<path>\n..." | bin/guild derive-panel
# OR
bin/guild derive-panel --files=<comma-separated paths>
```

Returns a comma-separated evaluator list on stdout. Warnings (e.g.
fallback usage when `PANEL-COMPOSITION.md` is not loadable from
cwd) emit on stderr.

The verb composes the panel by:

1. Look up each file's applicable evaluators per the spec table.
2. Union the per-file sets.
3. Always include `evaluator-contract-fit`.
4. Sort by precedence order.

**Idempotency**: `safe`. Pure function — same input file list
always produces the same panel.

**Failure modes**:

- `panel-spec-unreadable` (the `docs/PANEL-COMPOSITION.md`
  file isn't at the expected path relative to cwd) — verb falls
  back to `FALLBACK_RULES` + `FALLBACK_PRECEDENCE` and emits a
  warning on stderr. The fallback is intentionally maintained in
  the verb source so the spec drift surfaces (Unit 1.1 of the
  loom-absorb-draft project sync'd the fallback with the live
  spec).
- `derive-panel-error: no-rules-parsed` (the spec file existed
  but contained no parseable rules) — verb errors hard; loop
  must surface to operator (likely a malformed spec).

**Used by**: `/ev-loop-confidence` (lines 250-258),
`/ev-loop-interactive` (lines 149-157).

## § Append finding

**Purpose**: Record an evaluator finding into the project's
`.guild-findings.jsonl` log, and (via the `count` subverb) query
how many times the same finding signature has been recorded.
Drives the recurring-threshold heuristic in
`/ev-loop-interactive` step 4.5.

**Wraps** — two subverbs:

```bash
# append a finding (append-only):
bin/guild findings append --slug=<slug> --evaluator=<name> --code=<code> \
  --evidence=<text> [--severity=blocking|advisory] [--branch=<name>] [--unit=<NN>]

# count occurrences of the same finding signature:
bin/guild findings count --slug=<slug> --evaluator=<name> --code=<code> \
  --evidence=<text>
```

The verb writes to `projects/<slug>/.guild-findings.jsonl` per
`projects/CONVENTIONS.md` § Category 1 (append-only).

**Idempotency**: `append` is `not-idempotent` by design — each
call appends a fresh record. Duplicate calls increase the count
returned by `count`. This is the substrate's mechanism for
counting recurrence.

**Quote-safety**: the `--evidence=<text>` flag is shell-passed.
Loops MUST shell-quote the evidence string (e.g. with `printf
%q` or by writing the text to a file and passing through an
alternate flag). Failure to quote will splinter multi-word
evidence into separate args.

**Failure modes**:

- `findings-error: missing-verb` → loop bug.
- `missing-args` (required flag absent) → loop bug.
- `evidence-too-long` (the recipe caps evidence at ~500 chars
  to keep the JSONL line readable) → loop should truncate and
  retry.

**Used by**: `/ev-loop-interactive` (lines 232, 238).

## § Save session

**Purpose**: Compose and write a session handoff appended to
`projects/<slug>/manifest.toml`'s `[[sessions]]` section (keyed
on `(date, letter)`). The handoff summarizes what happened in this
working session, lists open threads, and is the artifact the next
session's `/ev-run` reads to know what's in flight.

**Wraps**:

```bash
# scan recent corrections (from checkins on this session's branch):
bin/loom session corrections <slug> [--since=<timestamp>]

# scan recent events for context:
bin/loom events read <slug> --limit=50 --pretty

# compose the Session JSON in-memory and write:
bin/loom session write <slug> --session-file=<path>
```

The loop assembles the Session JSON (shape in
[`LOOM-CONVENTIONS.md`](./LOOM-CONVENTIONS.md) § `[[sessions]]`)
from the corrections + events reads + its own working memory of
what happened, then passes the in-memory shape via the
`--session-file=<path>` flag.

**Partitioned** per `projects/CONVENTIONS.md` § Category 2 — the
partition is `(date, letter)`.

**Idempotency**: `fails-loud` for `session write` (same
`(date, letter)` partition can't be written twice — pick the
next letter). `corrections` and `events read` are `safe`.

**Failure modes**:

- `session-already-exists` (partition collision) → loop should
  increment the letter (a→b→c…) and retry.
- `session-file-unreadable` → loop bug.
- `invalid-session` (missing required fields in the JSON) →
  loop bug.

**Used by**: `/ev-loop-confidence` (line 486),
`/ev-loop-interactive` (line 251), `/ev-run` (line 138).

## § Retro write

**Purpose**: Write a retrospective for a session, a phase tier, or
the whole project. Session retros land between tiers in
`/ev-loop-confidence`; the project retro is written by
`/loom-archive` at project close.

**Wraps**:

```bash
bin/loom retro write <slug> --retro-file=<path> --type=(session|project)
```

The JSON file at `--retro-file` is a full Retro record (shape in
[`LOOM-CONVENTIONS.md`](./LOOM-CONVENTIONS.md) § `retros/`),
including `findings[]` with `category` /
`description` / `evidence`.

**Partitioned** per `projects/CONVENTIONS.md` § Category 2 — the
partition is `(type, phase, tier)` for session retros;
`project` is a singleton path for the project retro.

**Idempotency**: `fails-loud` on partition collision. To revise
a session retro after writing, the loop must compose a fresh
record at a different `(phase, tier)` (typically the next tier).
The project retro is written exactly once per project at archive
time.

**Failure modes**:

- `retro-already-exists` (partition collision) → loop must pick
  a fresh partition or refuse.
- `retro-file-unreadable` / `invalid-retro` → loop bug.

**Used by**: `/ev-loop-confidence` (lines 69, 446).
