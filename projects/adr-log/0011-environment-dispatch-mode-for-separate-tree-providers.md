# 0011. Environment dispatch mode for separate-tree providers

- **Date**: 2026-06-25
- **Status**: proposed

## Context

ADR-0010 introduced the loop-layer environment-provider seam and scoped
v1 to the **exec model**: the loop reasons and edits in the operator's
session, and routes a phase's build/test commands into the environment
via `ev env exec`. That model is coherent only when the environment
shares *this* working tree — an OrbStack bind-mount via `fella`, where
the bytes the loop edits are the bytes the env's commands run against.
ADR-0010 named this the **shared-tree requirement** and gated `--env` on
it, deferring "full Claude-in-env dispatch" to a v2 forward pointer.

A `coder` cloud workspace does not share the tree: it has its **own**
clone. Under the exec model, routing commands into a coder workspace
would run them against a different tree than the one being edited — so
ADR-0010's gate blocks `--env=coder` from being end-to-end. But coder is
the operator's **work** stack; "provision from outside and run the work
there" is a first-class use case, not a corner. The operator's existing
manual workflow for it is already the dispatch model: spin up the
workspace, install Claude inside, drive the work from within. The gap is
automating that, not inventing it.

Two ways to make a separate-tree provider work were on the table:

1. **Tree-sync** — keep editing in the session, and push the working
   tree into the workspace (git or rsync over `coder ssh`) before each
   `ev env exec`. Bidirectional, per-command latency, and a sync-back
   problem for generated files. This is the "dumb complicated" path.
2. **Dispatch** — run a Claude *inside* the workspace and hand it the
   phase; the workspace is both the tree and the executor, so there is
   nothing to sync. This is the literal automation of the manual flow.

## Decision

Bring the dispatch model forward from "v2 forward pointer" to a shipped
**per-provider mode**, alongside the existing exec model. A provider
declares `mode` in machine-local config:

- **`mode: exec`** (default) — shared-tree. The loop routes repo
  commands into the env via `ev env exec` (ADR-0010 behavior). `fella`
  ships `exec`.
- **`mode: dispatch`** — separate-tree. The loop does **no**
  exec-routing; the router hands the whole phase to a Claude running
  inside the env via `ev env dispatch <slug> --phase=<N>`. `coder` ships
  `dispatch`.

Load-bearing properties:

- **One seam, two modes, no fork in the loop bodies.** The mode branch
  lives in `/ev-run`'s § Environment provisioning. Exec mode keeps the
  loop-body `§ Environment-aware execution` routing; dispatch mode never
  enters a loop body in this session at all — it shells `ev env
  dispatch` and waits. The `ev-loop-*` bodies are unchanged by this ADR.

- **The `dispatch` template owns the in-env runner.** `ev env dispatch`
  renders a provider-configured template with `{handle}` (slug) and
  `{phase}`. The shipped `coder` default is
  `coder ssh {handle} -- bash -lc "cd ~/agents && claude -p '/ev-run {handle} {phase}'"`
  — a headless Claude re-invoking the loop **without** `--env` (it is
  already in the env, so it runs locally to the workspace). The repo
  path and runner are workspace-specific, so operators override the
  template; `ev` stays generic.

- **The in-env run is a normal local run.** Because the inner `/ev-run`
  carries no `--env`, it provisions nothing, edits the workspace's own
  checkout, commits, and opens the phase PR exactly as a local run does.
  No recursion, no tree-sync, no shared-tree requirement — the env owns
  the tree.

- **PR-wake re-entry is unchanged.** The in-env run opens the PR; the
  subscription + PR-activity wake re-enter `/ev-run` / `/ev-goal` in the
  operator's session on merge, advancing the drive loop. The wake still
  decides *when* to look; `loom pr discover` still decides *what is
  true*. Dispatch changes where the work runs, not how progress is
  observed.

- **The workspace-template contract.** A dispatch-mode env must provide,
  at the path the template names: an **authed** `claude` CLI, the
  substrate plugins (`commons`/`griot`/`guild`/`loom`/`ev`), and the
  repo checkout. This is the provider's (coder template's)
  responsibility, declared once, not something `ev` bootstraps per run.

- **Tree-sync is rejected** (option 1). It trades one clean handoff for
  per-command shuttling with a sync-back problem; dispatch matches the
  operator's actual workflow and the substrate's "open a PR, subscribe,
  move on" posture.

## Consequences

**Now easy that wasn't before.** `/ev-run <slug> --env=coder` (or
`/ev-goal`) from a thin session provisions the work coder workspace and
drives the phase inside it, opening the PR from there — the manual
"spin up, install Claude, work inside" flow, automated and re-entrant on
merge.

**Now harder.** A `mode` to keep coherent across the seam and the two
drivers, and a heavier provider contract for dispatch (the
authed-Claude-plus-plugins-plus-repo workspace). The shipped `coder`
dispatch default is a best-effort shape most operators will override.

**Cannot be validated in CI here.** The dispatch path requires a live
coder workspace with the workspace-template contract satisfied; the
substrate repo's tests cover the pure seam (resolution, mode, dispatch
command rendering) but not a real round-trip. The render is unit-tested
and dry-run-inspectable; the round-trip is verified on the operator's
machine.

**Watch for.** A dispatch template that silently succeeds at `coder ssh`
but whose inner `claude -p` never ran (missing auth, missing plugins,
wrong repo path) — the env must surface the inner failure, not a green
ssh. And an in-env run that opens a PR the operator's session isn't
subscribed to — dispatch must not bypass the § Compose PR "subscribe at
open" step inside the env.

## Forward pointers

- **Streaming + liveness.** v1 `ev env dispatch` blocks on the `coder
  ssh` round-trip with inherited stdio. A future version streams the
  in-env run's progress and supports detach/reattach for long phases.
- **Bootstrapping the workspace contract.** A helper that installs the
  plugins + checks `claude` auth inside a fresh workspace, so the coder
  template doesn't have to bake all of it.
- **Mode autodetection.** ADR-0010's v2 "agent decides env-need" extends
  naturally to "agent detects shared-tree vs separate-tree" instead of
  reading `mode` from config — deferred; explicit `mode` first.
- **Teardown at goal-converge.** Still manual in v1 (ADR-0010); a
  dispatch-mode env is a more expensive thing to leave running, which
  raises the priority of the `down`-at-archive forward pointer.
