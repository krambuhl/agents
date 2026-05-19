---
name: ev-run
description: >-
  Thin router over a project. Loads the manifest, picks the next
  actionable phase (or routes a message like "address feedback on #14"),
  and dispatches to the appropriate loop. Does no work itself —
  the loops own execution and the substrate owns state. Use when the
  user wants to make progress on a project without picking the phase
  by hand.
argument-hint: "<project-slug-or-path> [<free-form message>] [--mode=auto]"
user-invocable: true
disable-model-invocation: true
allowed-tools: Read, Skill, Bash, AskUserQuestion
---

# /ev-run

Router. Reads state via `bin/loom`, decides what to run next, invokes
the right loop. Owns no work of its own.

## Arguments

- `<project-slug-or-path>` — resolved by loom's standard slug resolution
  (full slug → date-less suffix → relative or absolute path).
- Optional free-form message — if present, interpret it as a redirect
  (e.g. "address feedback on #14", "pause and save session", "start
  phase 3 even though phase 2 isn't merged yet").

Invocations of `/ev-loop-*` and `/loom-archive` and `/loom-plan` skills
below mean `Skill(skill: <name>, args: "…")` — the Skill tool is how
the router dispatches. CLI invocations like `bin/loom project read`
mean `Bash("loom project read <args>")`.

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

Refresh state via the loom CLI:

```
loom project read <slug> --pretty
loom events read <slug> --limit=20 --pretty
loom session list <slug> --pretty   # for the last session's open_threads
```

Take in the manifest, recent events, and the latest session handoff.
This tells you:
- Current phase status (from `phases[].status`)
- Latest checkin (from manifest's `latest_checkin`)
- Open PRs (from `pr-opened` / `pr-updated` / `pr-merged` events; the
  latest event for each phase's branch is authoritative)
- Suggested next action (inferable from phase statuses)
- Open threads from the last session handoff (read it via
  `bin/loom session read <slug> --filename=<latest>`)

**PR-merged reconciliation**: if a PR was merged between sessions but
no `pr-merged` event has been recorded, the router should append one
via the upstream loop's checkpoint flow rather than auto-emit. (Loom
emits `pr-merged` only from explicit reconciliation, not a CLI verb
today — see the open question in projects/2026-05-15-trout-sunset/PLAN.md
about whether `bin/loom pr reconcile` should ship.) For now, surface
suspected drift as a one-line warning and let the user decide.

**Griot write on drift detection**: alongside the drift warning,
write a session-note via § Capture finding documenting the drift
shape (manifest-says-X vs git-says-Y). Substrate-wide signal
worth keeping: "what kinds of drift happen in practice." The
classification gap is the same as other Phase-7-wired captures
(no precise classification today for "manifest-vs-git drift
shape"); intent recorded; the event-stream + the warning surface
are the substrate trace until the verb supports a finer
classification.

### 1.5. Load learnings

Run `Bash("griot use --as=llm")`. The verb reads
`learnings/rollup.json` and renders it as LLM-friendly prose, prints
the status line and (if loaded) the content + citation contract to
stdout — the Bash result lands the load in conversation context. Do
this once per `/ev-run` invocation — the rollup is session-scoped,
not per-dispatch. The `--as=llm` flag is the default render mode and
is currently the only mode shipped; `/ev-run` calls the CLI directly
via Bash rather than composing the `/griot-load` skill, to keep the
loader-step path skill-composition-free.

Handle the three outcomes the verb's `griot-use:` status line reports:
- **`loaded N learnings`** — note it in the dispatch report.
- **`rollup empty`** — note "no rollup entries" in the dispatch report
  and proceed.
- **`no rollup yet`** — note "no rollup yet — `/griot-compact` has
  not run" and proceed. Do not stop.

A format-detection error from the verb (exit 1, stderr names
`learnings/rollup.md` as a legacy artifact requiring migration)
indicates a mid-flight session running an older skill body against
post-cutover on-disk state, or vice-versa. Surface the verb's stderr
message to the user verbatim and stop — the remedy is in the message
(run `node .claude/scripts/migrate-rollup-md-to-json.ts` and restart).

Do not read `learnings/session-notes/` or `learnings/nightly/` from the
router — the tier separation is a hard rule of the learnings system,
and the substrate must respect it.

### 2. Handle explicit redirects

If the user provided a message, parse its intent:

| Intent | Action |
|--------|--------|
| "address feedback on #N" | Verify #N belongs to this project. Dispatch to the loop that owns the branch, passing the redirect message. The loop's § Triage PR comments handles the rest. |
| "save session" / "wrap up" | Compose and write a session handoff per the ev-loop's § Save session recipe (`bin/loom session corrections` + `bin/loom events read` → compose Session JSON → `bin/loom session write`), then stop. |
| "archive" / "close out" | Verify all phases are complete (every `phases[].status == "completed"`). Invoke `/loom-archive <slug>`. |
| "skip to phase N" | Warn if dependencies aren't satisfied. Confirm with the user. If confirmed, dispatch to the loop for phase N. |
| "pause" | Stop and report. Do not dispatch. |
| ambiguous | Walk the user through a grill-me question (one at a time, recommendation first); in `--mode=auto`, defer to `evaluator-contract-fit` reading the redirect against open PRs. See § Grill-me + auto-mode below. |

### 3. Pick the next actionable phase

With no message, pick the phase using this policy:

1. If any phase is `in-progress`, that's the next phase.
2. Otherwise, pick the lowest-numbered `not-started` phase whose
   dependencies are all satisfied (all named prior PRs merged).
3. If no phase qualifies, surface the blocker: "waiting on PR #X to
   merge" or "all phases completed — run `/loom-archive`."

### 4. Dispatch

Determine which loop to invoke:
- Per-phase override in PLAN.md wins.
- Otherwise, use the preferred loop from `config.json`
  (`worker_bindings` field, e.g. `{"default": "ev-loop-interactive"}`).
- Otherwise, default to `/ev-loop-confidence`.

Invoke the loop with `<slug> <phase-number>` and, if a redirect message
is in play, pass it through.

Do **not** pass control back and forth. Once dispatched, the loop owns
the session until it returns or yields. If the user wants a different
loop mid-phase, they stop the current one explicitly.

### 5. Report briefly before dispatching

One paragraph in this shape:

```
Dispatching <slug> → phase <N> "<phase-title>" via <loop-name>.
<Dependency-check sentence.> <Learnings-loaded sentence.>
<Caveats or "No caveats.">
```

The learnings-loaded sentence is one of:
- `Loaded N learnings from rollup.json (citation contract active).`
- `No rollup yet — proceeding without citation contract.`
- `Rollup empty — proceeding without citation contract.`

Then dispatch. Don't ask for permission unless a redirect or drift
warrants it. Example dispatch:

```
Skill: ev-loop-confidence
args: "<slug> <phase-number> [<redirect-message>]"
```

## Grill-me + auto-mode

The router has three classes of ambiguity that historically fell to
ad-hoc clarifying prompts. They now follow the substrate's standard
grill-me + auto-mode pattern. Per `docs/AGENT-CONVENTIONS.md`,
defaults are **per-decision rounds = 3** and **per-session
ambiguities = 3** for this surface.

The three ambiguity classes:

1. **Ambiguous redirect** (step 2). The free-form message doesn't
   map cleanly to one of the documented intents. Example: the user
   types "look at #14" — that's likely an "address feedback on #14"
   but could also be "skip to the phase that produced #14." The
   skill grill-mes: surface 2-4 interpretations via
   `AskUserQuestion`, recommend the most likely one. In auto-mode,
   `evaluator-contract-fit` reads the redirect text against the
   project's open PRs (from the events.jsonl trail) and picks the
   highest-confidence match.

2. **Manifest-vs-git drift** (step 0.5 / step 1). The manifest's
   phase status doesn't match git state (e.g. phase shows
   `in-progress` but the branch is already merged). The skill
   grill-mes: surface the discrepancy + 2-3 reconciliation options
   (mark merged / pull and rebuild / treat as out-of-band). In
   auto-mode, `evaluator-contract-fit` reads the drift against the
   expected manifest shape (per `docs/LOOM-CONVENTIONS.md` § phase
   lifecycle) and picks the reconciliation matching the actual git
   state.

3. **Ambiguous next-phase** (step 3). Multiple `not-started` phases
   could be picked (rare: e.g. two phases have the same dependency
   set and both are unblocked). The skill grill-mes: surface the
   candidates with one-line PLAN.md descriptions, recommend the
   earlier-numbered one. In auto-mode, `evaluator-contract-fit`
   reads each candidate against its PLAN.md description + the
   project's last-decided direction (from the latest checkin's
   notes_for_pr) and picks the most coherent next step.

**Convergence**: silent panel (the evaluator returns `approved`
with a single high-confidence resolution) OR 3 × 3 budget exhaust.

**On budget exhaust**: emit `auto-mode-budget-exhausted` with
`{surface: 'ev-run', slug, decisions_completed, rounds_completed,
reason}`. Alongside the emission, write a session-note via
§ Capture finding documenting which ambiguity class exhausted +
the candidate options the panel considered. Substrate-wide signal
for "which router-level ambiguities resist auto-mode resolution"
— useful cross-skill input alongside the per-skill
budget-exhausted captures from /ev-loop-interactive and
/loom-archive.

The router falls back to declining to dispatch — it surfaces the
unresolved ambiguity to the operator (or upstream caller) with a
structured error and stops. The substrate posture matches
`/ev-loop-interactive`'s contract negotiation: ambiguity the
auto-mode panel can't resolve is too risky to dispatch through.

**Event emissions** (auto-mode only):
- On auto-mode entry: emit `auto-mode-entered` with `{surface:
  'ev-run', slug, decision_budget: 3, round_budget: 3}`.
- On silent-panel convergence: emit `auto-mode-converged` with
  `{surface, slug, decisions_completed, rounds_completed}`.
- On budget exhaust: emit `auto-mode-budget-exhausted` per above.

Human-paired mode emits no auto-mode events — the `AskUserQuestion`
exchange is the audit trail.

## Rules

- **Thin.** The router reads state and dispatches. No code changes, no
  file writes, no evaluator calls.
- **No cross-loop composition.** If a phase needs both loops, split it
  into two phases in PLAN.md.
- **Respect manifest state.** If the manifest says a phase is blocked,
  do not dispatch to it. Surface the blocker and stop.
- **No emojis.**

## Failure modes

- Project not found → forward the loom error; suggest `/loom-plan`
  to scaffold a new one.
- Manifest inconsistent with git state → stop, report the drift, let
  the user resolve.
- No actionable phase and not all phases done → list open blockers and
  stop.
- All phases done → recommend `/loom-archive` and stop.
