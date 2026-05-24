---
name: ev-linear:ev-run
description: >-
  Thin router over a linear-loom-backed project. Loads Linear state
  via bin/linear-loom, picks the next actionable phase (or routes a
  message like "address feedback on #14"), and dispatches to the
  appropriate ev-linear loop. Does no work itself — the loops own
  execution and the linear-loom substrate owns state. Use when the
  user wants to make progress on a project without picking the phase
  by hand.
argument-hint: "<project-slug-or-path> [<free-form message>] [--mode=auto]"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Skill, Bash, AskUserQuestion
---

# /ev-linear:ev-run

Router. Reads state via `bin/linear-loom`, decides what to run next,
invokes the right loop. Owns no work of its own.

Parallel to `/ev-run` per DESIGN.md § 17 — the substrate target is
linear-loom, not loom. Griot integration is excised entirely per § 18
(no rollup load, no capture writes). Event-emission sites in the
ev-side body have nowhere to land here (linear-loom drops events.jsonl
per § 8) and are dropped from this body; the auto-mode logic itself
stays, with the conversation as the only audit trail.

## Arguments

- `<project-slug-or-path>` — resolved by linear-loom's standard slug
  resolution (full slug → date-less suffix → relative or absolute path).
- Optional free-form message — if present, interpret it as a redirect
  (e.g. "address feedback on #14", "start phase 3 even though phase 2
  isn't merged yet", "pause").

Invocations of `/ev-linear:ev-loop-*` and `/linear-loom-archive` and
`/linear-loom-plan` skills below mean `Skill(skill: <name>, args: "…")`
— the Skill tool is how the router dispatches. CLI invocations like
`bin/linear-loom project read` mean `Bash("linear-loom project read
<args>")`.

## Preflight

Before doing anything else, verify the substrate CLIs are on PATH.
The marketplace `dependencies` cascade handles install-time + enable-
time correctness; this skill-body check catches the runtime case
where a user disabled a dep plugin mid-session.

Run:

```
Bash("command -v linear-loom guild >/dev/null 2>&1 || { echo 'ev-linear:ev-run requires linear-loom + guild plugins on PATH. Enable them with: claude plugin enable linear-loom@krambuhl guild@krambuhl' >&2; exit 1; }")
```

If exit code is non-zero, stop and surface the message to the
operator verbatim — do not dispatch to any loop.

## Process

### 0. Parse arguments

Treat the first whitespace-delimited token of `$ARGUMENTS` as the
project slug/path. Everything after it (if any) is the free-form
message. If `$ARGUMENTS` is empty, stop and ask for a slug.

### 0.5. Sync git state

Refresh git state before orientation so the autoload briefing reflects
what's actually merged on the remote — not a stale local snapshot.
This is the single point in the substrate where the working tree gets
synced; downstream loops trust the result.

1. `git fetch origin` — always; never modifies the working tree.
2. If currently on the base branch (typically `main`):
   `git pull --ff-only origin <base>`. If non-fast-forward (local has
   commits not on origin), stop and surface the error rather than
   auto-resolving — local main with unexpected commits is suspicious.
3. If currently on a feature branch: do not auto-rebase or auto-checkout.
   If `origin/<base>` has new commits ahead of local `<base>`, note the
   gap in the dispatch report so the user knows the next branch-cut
   should pull first.
4. `git status --porcelain` for tracked-modified files. Filter out
   `.claude/settings.local.json` (permitted user-local carry-over).
5. If any tracked-modified files remain, they are loose changes from a
   prior session that should have shipped with their original PR.
   Surface them as a one-line summary AND stop. Ask the user to choose:
   - **discard**: `git checkout -- <files>` and proceed.
   - **commit**: pause for the user to commit (then re-invoke the router).
   - **continue anyway**: proceed without resetting (escape hatch for
     intentional WIP).
   Never auto-discard — destructive actions require explicit consent.

Untracked files (`??` in `git status --porcelain`) are not surfaced —
they may be intentional WIP, substrate config, or scratch the user is
working with.

### 1. Orient

Refresh state via the linear-loom CLI:

```
linear-loom project read <slug> --pretty
linear-loom events read <slug> --limit=20 --pretty
```

Take in the project manifest and recent events. This tells you:
- Current phase status (from `phases[].status` — sourced from Linear
  Milestone state per DESIGN.md § 11).
- Open PRs — linear-loom does not synthesize `pr-opened` / `pr-merged`
  events in v1 (DESIGN.md § 8 coverage scope; PR attachments are a
  documented follow-up). For PR state, ask the operator or query
  GitHub directly via `gh pr list` if it matters for the dispatch.
- Suggested next action (inferable from phase statuses).

linear-loom has no session-handoff surface — the operator's
between-session context is whatever lives in the conversation +
Linear's native presence. Skip the loom-shaped session-list step.

**Manifest-vs-git drift**: if a phase shows `in-progress` in Linear
Milestone state but the branch is already merged on the git side
(or vice versa), surface as a one-line warning and let the user
decide how to reconcile. linear-loom has no `pr reconcile` verb;
the operator handles drift manually via `linear-loom phase update`.

### 2. Handle explicit redirects

If the user provided a message, parse its intent:

| Intent | Action |
|--------|--------|
| "address feedback on #N" | Verify #N belongs to this project (the branch matches a phase's recorded `branch` in the manifest). Dispatch to the loop that owns the branch, passing the redirect message. The loop's § Triage PR comments handles the rest. |
| "archive" / "close out" | Verify all phases are complete (every `phases[].status == "completed"`). Invoke `/linear-loom-archive <slug>`. |
| "skip to phase N" | Warn if dependencies aren't satisfied. Confirm with the user. If confirmed, dispatch to the loop for phase N. |
| "pause" | Stop and report. Do not dispatch. |
| ambiguous | Walk the user through a grill-me question (one at a time, recommendation first); in `--mode=auto`, defer to `evaluator-contract-fit` reading the redirect against open PRs. See § Grill-me + auto-mode below. |

linear-loom has no `session write` verb (DESIGN § 8 + the operator's
explicit scope choice for ev-linear) — a "save session" / "wrap up"
redirect has no substrate target and is not supported in this router.
If the operator types one, surface a one-line note ("ev-linear has no
session-write surface; conversation context is the session") and stop.

### 3. Pick the next actionable phase

With no message, pick the phase using this policy:

1. If any phase is `in-progress`, that's the next phase.
2. Otherwise, pick the lowest-numbered `not-started` phase whose
   dependencies are all satisfied (all named prior PRs merged).
3. If no phase qualifies, surface the blocker: "waiting on PR #X to
   merge" or "all phases completed — run `/linear-loom-archive`."

### 4. Dispatch

Determine which loop to invoke:
- Per-phase override in PLAN.md wins.
- Otherwise, use the preferred loop from `config.json`
  (`worker_bindings` field, e.g. `{"default": "ev-loop-interactive"}`).
- Otherwise, default to `/ev-linear:ev-loop-confidence`.

Invoke the loop with `<slug> <phase-number>` and, if a redirect message
is in play, pass it through. The loop skill names are
`/ev-linear:ev-loop-interactive` and `/ev-linear:ev-loop-confidence`
— **NOT** the bare `/ev-loop-*` names from the ev plugin. Cross-plugin
loop dispatch would route to the wrong substrate.

Do **not** pass control back and forth. Once dispatched, the loop owns
the session until it returns or yields. If the user wants a different
loop mid-phase, they stop the current one explicitly.

**Forward-reference note (Phase 7 U1)**: this U1 PR ships ev-run only.
The loop skills (`ev-loop-interactive`, `ev-loop-confidence`) land in
Phase 7 U2 + U3 respectively. Invoking the router before those merge
surfaces a `skill-not-found` error from the Skill tool at dispatch
time.

### 5. Report briefly before dispatching

One paragraph in this shape:

```
Dispatching <slug> → phase <N> "<phase-title>" via <loop-name>.
<Dependency-check sentence.>
<Caveats or "No caveats.">
```

Then dispatch. Don't ask for permission unless a redirect or drift
warrants it. Example dispatch:

```
Skill: ev-linear:ev-loop-confidence
args: "<slug> <phase-number> [<redirect-message>]"
```

ev-linear emits no "Loaded N learnings" sentence — griot is excised
(DESIGN § 18); there is no rollup load step.

## Grill-me + auto-mode

The router has three classes of ambiguity that historically fell to
ad-hoc clarifying prompts. They follow the substrate's standard
grill-me + auto-mode pattern. Defaults: **per-decision rounds = 3**
and **per-session ambiguities = 3** for this surface.

The three ambiguity classes:

1. **Ambiguous redirect** (step 2). The free-form message doesn't
   map cleanly to one of the documented intents. Example: the user
   types "look at #14" — that's likely an "address feedback on #14"
   but could also be "skip to the phase that produced #14." The
   skill grill-mes: surface 2-4 interpretations via
   `AskUserQuestion`, recommend the most likely one. In auto-mode,
   `evaluator-contract-fit` reads the redirect text against the
   project's open PRs (queried via `gh pr list` if necessary;
   linear-loom does not synthesize PR events) and picks the
   highest-confidence match.

2. **Manifest-vs-git drift** (step 0.5 / step 1). The manifest's
   phase status doesn't match git state (e.g. phase shows
   `in-progress` but the branch is already merged). The skill
   grill-mes: surface the discrepancy + 2-3 reconciliation options
   (mark Linear Milestone completed via `linear-loom phase update
   --status=completed` / pull and rebuild / treat as out-of-band).
   In auto-mode, `evaluator-contract-fit` reads the drift against
   the expected manifest shape per DESIGN § 11 and picks the
   reconciliation matching the actual git state.

3. **Ambiguous next-phase** (step 3). Multiple `not-started` phases
   could be picked (rare: e.g. two phases have the same dependency
   set and both are unblocked). The skill grill-mes: surface the
   candidates with one-line PLAN.md descriptions, recommend the
   earlier-numbered one. In auto-mode, `evaluator-contract-fit`
   reads each candidate against its PLAN.md description + the
   project's last-decided direction (latest comment on each phase's
   Sub-Issue, via `linear-loom events read --event=checkin-created
   --limit=1` per phase) and picks the most coherent next step.

**Convergence**: silent panel (the evaluator returns `approved`
with a single high-confidence resolution) OR 3 × 3 budget exhaust.

**On budget exhaust**: the router falls back to declining to dispatch
— it surfaces the unresolved ambiguity to the operator (or upstream
caller) with a structured error and stops. The substrate posture
matches `/ev-linear:ev-loop-interactive`'s contract negotiation:
ambiguity the auto-mode panel can't resolve is too risky to dispatch
through.

**No event emissions**: linear-loom has no `events append` verb
(DESIGN § 8 names the event-log as read-only synthesis from Linear's
native data). The ev-plugin's `auto-mode-entered` / `auto-mode-
converged` / `auto-mode-budget-exhausted` emissions have no substrate
home in ev-linear and are dropped. The conversation transcript is
the audit trail.

Human-paired mode is the same as ev: the `AskUserQuestion` exchange
is the audit trail; no event log to write to anyway.

## Rules

- **Thin.** The router reads state and dispatches. No code changes, no
  file writes, no evaluator calls beyond the auto-mode resolution
  panel.
- **No cross-loop composition.** If a phase needs both loops, split it
  into two phases in PLAN.md.
- **Respect manifest state.** If the manifest says a phase is blocked,
  do not dispatch to it. Surface the blocker and stop.
- **No cross-plugin loop dispatch.** ev-linear dispatches ONLY to
  `/ev-linear:ev-loop-*`; routing to the bare ev plugin's `/ev-loop-*`
  would send the loop body to the wrong substrate.
- **No griot.** § 18 is firm. If the operator wants griot's rollup
  inside an ev-linear session, they invoke `/griot-use` manually
  before/around the loop.
- **No emojis.**

## Failure modes

- Project not found → forward the linear-loom error; suggest
  `/linear-loom-plan` to scaffold a new one.
- Manifest inconsistent with git state → stop, report the drift, let
  the user resolve via `linear-loom phase update`.
- No actionable phase and not all phases done → list open blockers and
  stop.
- All phases done → recommend `/linear-loom-archive` and stop.
- Loop skill not yet shipped (Phase 7 U1 forward-reference) → surface
  the Skill tool's `skill-not-found` error verbatim; suggest waiting
  for the corresponding U2 / U3 PR to merge.
