# Substrate compositions

Named recipes the ev-linear loop bodies (`/ev-linear:ev-loop-interactive`,
`/ev-linear:ev-loop-confidence`) compose to perform substrate
operations against the linear-loom CLI. Parallel to the ev plugin's
`docs/SUBSTRATE-COMPOSITIONS.md` per DESIGN.md § 17, with two
structural differences:

1. **Every recipe targets `bin/linear-loom`**, not `bin/loom`. Verb
   shapes and Linear-side authority match Phase 6's substrate surface
   (DESIGN.md § 7, § 8, § 11, § 12).
2. **No griot recipes** (§ Capture finding, § Append finding,
   § Apply rewrite, etc.). DESIGN.md § 18 excises griot integration
   from ev-linear entirely. The skill bodies are simpler by a
   measurable margin.

## Recipe coverage

Phase 7 U1 shipped this file as a placeholder; Phase 7 U2 adds the
recipes `/ev-linear:ev-loop-interactive` cites. Phase 7 U3 will add
the recipes `/ev-linear:ev-loop-confidence` cites (tier-shaped
recipes that have no current consumer in U2).

Recipes that have NO linear-loom analog and are documented as gaps
rather than ported:

- **§ Save session** — linear-loom has no `session write/read` verb
  (DESIGN.md § 8 + operator scope choice for ev-linear). The
  ev-plugin recipe drives loom's session-handoff surface; ev-linear
  has none. The conversation transcript + partial checkin file are
  the only resume artifacts.
- **§ Capture finding / § Append finding / § Apply rewrite** —
  griot recipes (§ 18 — excised). No analog.
- **§ Compose PR** (full recipe with `linear-loom pr open/update/
  discover`) — linear-loom's `pr` namespace is a Phase 6 stub.
  Linear's native GitHub integration owns the PR ↔ Issue linkage,
  so a wrapping verb is currently undecided. See § Compose PR below
  for the fallback this loop uses in v1.

## § State refresh

**Purpose**: Refresh project state from Linear before every loop step
that depends on phase status or recent events. Run at the start of
every unit and after any operation that may have changed Linear-side
state (mutations via `linear-loom phase update` or
`linear-loom tasks generate --apply`).

**Wraps**:

```bash
bin/linear-loom project read <slug> --pretty
bin/linear-loom events read <slug> --limit=20 --pretty
```

The first query returns the manifest (phases + Linear-derived
status). The second returns the loom-compat events array
synthesized from Linear's native audit data (DESIGN.md § 8 +
Phase 6 U4 coverage scope: `project-initialized`, `phase-started`,
`checkin-created`).

**Failure modes**:
- `project-not-found` → forward verbatim; suggest `/linear-loom-plan`.
- `linear-project-not-found` (the Linear Project ID in linear.json
  doesn't resolve) → forward verbatim; suggest re-running
  `/linear-loom-plan` to re-bind.

**Used by**: `/ev-linear:ev-loop-interactive` (Step 0 pre-flight),
`/ev-linear:ev-run` (Step 1 Orient).

## § Phase update

**Purpose**: Transition a Linear ProjectMilestone's state to reflect
phase progress (in-progress / completed). Linear Milestone state is
the source-of-truth for phase status per DESIGN.md § 11.

**Wraps**:

```bash
bin/linear-loom phase update <slug> --phase=<N> --status=<loom-status>
```

Where `<loom-status>` is one of: `not-started`, `in-progress`,
`completed`, `canceled`. The verb maps to Linear's enum
internally; `blocked` is rejected with `status-not-mappable` (no
Linear analog — see DESIGN.md § 11 + Phase 6 U3 notes).

**Idempotency**: `fails-soft`. Repeated calls with the same status
are no-ops on Linear's side (Linear's API doesn't reject a state
write that matches the current state). The verb returns
`{before, after}` so the caller can detect a true transition.

**Failure modes**:
- `status-not-mappable` (status=blocked or unknown) → forward.
- `linear-project-not-found` → forward.
- `phase-not-found` → forward (the manifest milestone for the
  requested phase number doesn't exist; re-run `linear-loom tasks
  generate --apply` if the PLAN.md phase is new).
- `milestone-update-failed` → forward (Linear API reported
  success=false; check API key permissions).

**Used by**: `/ev-linear:ev-loop-interactive` (Step 2.6 + Step 3
phase close).

## § Checkin write

**Purpose**: Render a loom-shape Checkin JSON to markdown and post
it as a comment on the Linear Sub-Issue that represents the unit
(DESIGN.md § 7). Comments are append-only on Linear's side; the
issue's comment thread becomes the unit's history.

**Wraps**:

```bash
bin/linear-loom checkin write <slug> \
  --task=<composed-key> \
  --checkin-file=<path-to-json>
```

The checkin JSON shape mirrors loom's Checkin type
(`schema_version: 1`, `number`, `phase`, `branch`, `unit`,
`contract`, `execution`, `scope`, `changes_since_previous`,
`verdict`, `notes_for_pr`). The verb renders to markdown via
`renderCheckinToMarkdown` (Phase 6 U2) and posts via
`createComment` (Phase 6 U1).

**Idempotency**: `appends-on-every-run`. Comments do not deduplicate;
re-running creates a duplicate comment. The substrate doesn't
prevent this — legitimate use includes intentionally re-posting an
updated checkin.

**Failure modes**:
- `checkin-invalid-json` / `checkin-schema-invalid` → bug in the
  caller's JSON composition; surface verbatim and stop.
- `task-not-found` (composed_key absent from Linear state) → suggest
  `linear-loom tasks generate --apply`.
- `task-target-is-milestone` (composed_key resolves to a Phase) →
  the verb only accepts Issue-shaped targets (Batches and Tasks).
  Caller bug; surface and stop.
- `comment-create-failed` → forward (Linear API permission check).

**Used by**: `/ev-linear:ev-loop-interactive` (Step 2.4 commit path).

## § Triage PR comments

**Purpose**: Read review comments on a PR, classify each as
`blocker`, `suggestion`, `nit`, or `acknowledge`, and draft
inline-reply responses.

**Wraps**:

```bash
gh pr view <pr> --json comments,reviews,reviewThreads
```

(linear-loom does not own a wrapping verb here — `gh` is the
substrate-native surface for GitHub review data.)

The triage classification rules live in the loop body's
message-driven-redirect flow. Per-comment outputs are:

- `blocker` → becomes a new unit in the loop.
- `suggestion` → drafted response + recorded in the unit's
  `notes_for_pr` array.
- `nit` → drafted response acknowledging; not gated.
- `acknowledge` → no response needed; ignore.

**Used by**: `/ev-linear:ev-loop-interactive` (message-driven
redirects → "address feedback on #N").

## § Derive panel

**Purpose**: Compute the evaluator panel for a unit's checkpoint by
mapping the unit's file list to evaluator names per
`plugins/ev/docs/PANEL-COMPOSITION.md`.

**Wraps**:

```bash
bin/guild derive-panel <file1> <file2> ... <fileN>
```

(Same `bin/guild` verb the ev plugin uses — `guild` is substrate-
shared, not loom- or linear-loom-specific.)

Returns a comma-separated evaluator-name list on stdout. Passes
verbatim as the `agents=` argument to `/guild-validate`.

**Failure modes**:
- `panel-spec-unreadable` (the marketplace-installed guild CLI
  can't find PANEL-COMPOSITION.md from the consumer plugin's source
  tree — substrate-known gap, captured in the agents-repo memory
  `feedback_loom_pr_opened_orphan_and_guild_spec_path`): fall back to
  `node plugins/guild/cli/guild.ts derive-panel ...` locally for
  this repo's development workflow.

**Used by**: `/ev-linear:ev-loop-interactive` (Step 2.3 evaluate),
`/ev-linear:ev-loop-confidence` (Phase 7 U3).

## § Retro write

**Purpose**: Write a tactical retro between tiers (or a strategic
session retro) into `projects/<slug>/retros/`. Linear-loom uploads
the rendered markdown as a Linear Document with the standard
provenance header (DESIGN.md § 13).

**Wraps**:

```bash
bin/linear-loom retro <slug> --type=<session|strategic> \
  --retro-file=<path> [--phase=<N>] [--tier=<M>]
```

(linear-loom's `retro` namespace was wired in Phase 4.) The verb
reads the retro markdown, prepends the 3-line provenance header,
uploads to Linear as a Document, and emits the resulting Document
URL for inclusion in PR descriptions / archive bundles.

**Used by**: `/ev-linear:ev-loop-confidence` (tactical retro between
tiers).

## § Revise PLAN.md

**Purpose**: Trigger a PLAN.md revision via the linear-loom
revise-plan skill when scope-shift detection fires.

**Wraps** (via the Skill tool, not Bash):

```
Skill(skill: "linear-loom-revise-plan", args: "<slug> --flavor=<mechanical|research> --mode=auto")
```

The skill conducts the flavor-routed interview, runs the evaluator
pass, and commits via `bin/linear-loom revise-plan` internally. See
`plugins/linear-loom/skills/linear-loom-revise-plan/SKILL.md` for
the full surface.

**Used by**: `/ev-linear:ev-loop-confidence` (scope-shift step on
two-signal concurrence + accept),
`/ev-linear:ev-loop-interactive` (inner-RPI sub-sequence — spawns
this skill via the Agent tool with `--mode=auto`).

## § Compose PR

**Purpose**: Open or refresh the GitHub PR for the unit's branch.

**Wraps** — fallback shape in v1 (linear-loom-side stub):

```bash
# discover whether a PR already exists for this branch
gh pr list --head <branch> --json number,url

# if no PR exists yet:
gh pr create --base=<base-branch> --head=<branch> \
  --title=<title> --body-file=<path>

# if a PR exists:
gh pr edit <pr-number> --body-file=<path>
```

linear-loom's `pr` namespace is a Phase 6 stub — `linear-loom pr
open/update/discover` are not implemented (Linear's native GitHub
integration owns the PR ↔ Issue linkage; a wrapping verb is
currently undecided). Until a real linear-loom-side compose-PR
surface lands, the loop falls back to direct `gh` invocations.

When a real verb ships, this recipe upgrades to wrap it and the
fallback note can be removed.

**Idempotency**: `idempotent-on-body`. Re-running with the same
body produces the same PR state.

**Used by**: `/ev-linear:ev-loop-interactive` (Step 2.7 checkpoint
+ Step 3 phase close).

## Cross-plugin references

The following docs are NOT duplicated under `plugins/ev-linear/docs/`
because they're substrate-shared, not loom-specific. ev-linear
skill bodies cross-reference them via path:

- `plugins/ev/docs/AGENT-CONVENTIONS.md` — auto-mode posture,
  two-budget defaults, RECOVERY-STATUS.json shape.
- `plugins/ev/docs/PANEL-COMPOSITION.md` — file-type → evaluator
  mapping the § Derive panel recipe routes through.

Future cleanup: extract these to `plugins/commons/docs/` once the
marketplace structure supports the shape. Until then, the cross-plugin
path references are stable enough.
