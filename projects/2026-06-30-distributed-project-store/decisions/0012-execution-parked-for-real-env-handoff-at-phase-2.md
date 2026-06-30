# 0012. execution parked for real-env handoff at Phase 2

- **Status**: accepted
- **Scope**: execution handoff
- **Date**: 2026-06-30

## Decision

Autonomous `/ev-goal` execution from a degraded sandbox (no guild panels,
no `gh`, loom/guild/griot not on PATH) is **parked** after completing every
sandbox-safe phase. The remaining phases hand off to a **real coder env**.

## Done (this session, sandbox)

- **Phase 1** — split format + dual-read (PRs #232, #233, merged). Readers
  resolve split-or-legacy; no writer flipped.
- **Phase 3** — `loom decision` verb (PR #234, merged).
- **Phase 6** — runbook scanner + `loom runbook scan` + `/loom-runbook`
  (PRs #235, #236, merged).
- **Phase 7** — `/loom-migrate` + `/ev-goal` runbook execution mode
  (PR #237, merged).

## Remaining — real env required

All funnel through Phase 2/4 (write-flips on the running substrate + the
guild validation gate):

- **Phase 2** — flip the writers (`checkin`/`events`/`session`/`retro`/
  `pr respond`/`findings`/`phase update`) + `revise-plan` to per-phase files.
  The dual-read (Phase 1) already resolves the split format, so this is the
  first phase that makes a project actually split. Highest-stakes — do it
  with real panels, isolated from the driving session.
- **Phase 4** — external repo + git-as-sync (deps 2). Point
  `LOOM_PROJECTS_ROOT` at a `krambuhl/projects` clone.
- **Phase 5** — migration converter + conventions guard (deps 2).
- **Phase 8** — decentralized claim/lease + concurrency (deps 7, 4).
- **Phase 9** — ADR-moment escalation, two buses (deps 3, 4).

## How to resume

From a real coder env (full loom/guild/griot + `gh`):
`/ev-goal 2026-06-30-distributed-project-store --env=coder`. It re-orients,
sees 1/3/6/7 completed, and picks up at **Phase 2**.
