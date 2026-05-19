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
state), and optionally record the branch + PR reference. Emits
the matching event (`phase-started`, `phase-completed`, etc) as
a side effect.

**Wraps**:

```bash
bin/loom phase update <slug> <phase-number> \
  --status=(not-started|in-progress|blocked|completed) \
  [--branch=<branch>] \
  [--pr=<number> --url=<url> --pr-state=(open|merged|closed)] \
  [--reason=<text>]   # required when --status=blocked
```

The verb is **single-writer-serialized** per
`projects/CONVENTIONS.md` § Category 3 (target:
`projects/<slug>/manifest.json`).

**Idempotency**: `safe` when the target state matches current
state (the verb is a no-op write). `not-idempotent` across
state transitions: calling with `--status=in-progress` on a
phase that's already `completed` overwrites the completion.
Loops should check current state before transitioning when
that distinction matters.

**Failure modes**:

- `missing-args` → required field absent (slug, phase number,
  status; or `--reason` when status=blocked, or `--pr` when
  `--url`/`--pr-state` supplied). Operator error; loop should
  surface to operator.
- `invalid-phase` (non-integer phase number) → operator error.
- `invalid-pr` (non-numeric pr value) → operator error.
- `invalid-pr-state` (not one of open/merged/closed) →
  operator error.
- `project-not-found` → forward the loom error verbatim.
- `phase-not-in-manifest` (the phase number doesn't exist on
  this project) → forward verbatim; likely indicates plan drift.

**Used by**: `/ev-loop-confidence` (lines 188, 370 / 374),
`/ev-loop-interactive` (lines 310, 385).

## § Checkin write

**Purpose**: Record a unit of work as an immutable JSON checkin
under `projects/<slug>/checkins/<branch>/<NN>.json`. The checkin
captures contract + execution + verdict + corrections + notes
for the PR. Auto-emits a `checkin-created` event.

**Wraps**:

```bash
bin/loom checkin write <slug> --checkin-file=<path-to-json>
```

The JSON file at `<path-to-json>` is the full Checkin record (see
[`LOOM-CONVENTIONS.md`](./LOOM-CONVENTIONS.md) § `checkins/<branch>/<NN>.json`
for shape). Loops compose the JSON in-memory or in a temp file,
pass the path here, and the verb writes it under the canonical
location.

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

## § Compose PR

**Purpose**: Open the phase's pull request on first checkpoint,
or update the existing PR's body and metadata on subsequent
checkpoints to reflect the latest checkins and verification
state. Composes the PR body from the phase's checkin record
trail.

**Wraps** — two-step composition (open-or-update):

```bash
# discover whether a PR already exists for this branch
bin/loom pr discover <slug> --branch=<branch>

# if no PR exists yet:
bin/loom pr open <slug> --branch=<branch> --title=<title> --body-file=<path>

# if a PR exists:
bin/loom pr update <slug> --pr=<number> --body-file=<path>
```

The `--body-file` is a markdown file the loop composes from the
phase's checkin record (typically: `## Summary` + per-unit
sections + `## Test plan` + `## Rollout` + `## Checklist`, per
CLAUDE.md PR conventions).

After open, the loop calls `§ Phase update` with `--pr=<number>
--url=<url> --pr-state=open` to record the PR reference in the
manifest.

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

**Purpose**: Write a `[portable]`-marked finding from a whiteboard
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

**Purpose**: Compose and write a session handoff under
`projects/<slug>/sessions/<YYYY-MM-DD>-<letter>.json`. The
handoff summarizes what happened in this working session, lists
open threads, and is the artifact the next session's `/ev-run`
reads to know what's in flight.

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
[`LOOM-CONVENTIONS.md`](./LOOM-CONVENTIONS.md) § `sessions/`)
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
