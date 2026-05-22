# linear-loom

A Linear-backed project substrate. Mirrors the loom plugin's CLI surface
(plans, research, sessions, checkins, retros, archives) but reads and
writes against a Linear workspace instead of `projects/<slug>/manifest.json`
+ `events.jsonl`.

## What this is

A personal-CLI tool. It expects one human operator with a Linear personal
API key, working on one workstream at a time. No orchestration layer, no
ephemeral compute, no automation polling — those were explicitly deferred
out of v1 during the round-2 design grill. The slash-commands operate
against the operator's own session, and Linear holds the cross-project
cursor for everything not in git.

linear-loom composes the `guild` plugin for antagonist-panel validation
and pairs with the `ev-linear` plugin (a parallel ev fork that targets
`bin/linear-loom` end-to-end). It does **not** depend on `loom` or
`griot` — the round-2 fork in `docs/DESIGN.md` § 17 + § 18 split the
linear-backed and loom-backed substrates apart at the plugin boundary.

## What lives where

- `bin/linear-loom` — bash shim, on PATH after plugin install. Same
  Node >= 24 enforcement as `bin/loom`.
- `cli/linear-loom.ts` — entrypoint. Routes `<namespace> <verb>` to the
  appropriate handler module. Phase 2 (this PR) ships namespace
  registration only; Phases 3-6 wire the verb handlers.
- `skills/` — operator-direct slash-command skills. Phase 4 ships
  `/linear-loom-research`, `/linear-loom-plan`, `/linear-loom-archive`
  per `docs/DESIGN.md` § 1.
- `contracts/` — JSON Schema files for read-verb outputs that downstream
  callers (ev-linear) depend on. Filled in as verbs ship.
- `agents/` — reserved for future Linear-aware subagents. Empty in v1.
- `docs/DESIGN.md` — the architectural spec (21 decisions, ~650 lines).
  Every Phase 3+ implementation decision grounds in a section reference.

## Phase status

Per `projects/2026-05-21-linear-loom/PLAN.md`:

| Phase | Status | Branch |
|-------|--------|--------|
| 1 — DESIGN.md | complete (PRs #31, #32, #33) | — |
| 2 — Plugin scaffolding | this PR | `ev-agent.linear-loom.scaffold` |
| 3 — Project lifecycle verbs | not started | `ev-agent.linear-loom.project-verbs` |
| 4 — Substrate mirroring (skills + research/plan/retro upload verbs) | not started | `ev-agent.linear-loom.mirroring` |
| 5 — Plan-to-tasks generation | not started | `ev-agent.linear-loom.tasks-generate` |
| 6 — Manual write-back verbs | not started | `ev-agent.linear-loom.writeback` |
| 7 — `ev-linear` plugin | not started | `ev-agent.linear-loom.ev-linear` |
| 8 — Dogfood | not started | `ev-agent.linear-loom.dogfood` |

## Getting started

See [`SETUP.md`](./SETUP.md) for the Linear personal-API-key bootstrap,
`linear.json` marker convention, and `linear-loom configure` flow.

The CLI is not yet wired — `linear-loom <namespace> <verb>` returns a
structured `not-implemented` error citing the phase that will ship the
verb. `linear-loom --help` lists the full namespace surface.

## Related docs

- [`docs/DESIGN.md`](./docs/DESIGN.md) — architectural spec, 21 decisions.
- [`projects/2026-05-21-linear-loom/PLAN.md`](../../projects/2026-05-21-linear-loom/PLAN.md) — phased delivery plan.
- [`plugins/loom/`](../loom/) — the loom-backed sibling substrate this
  plugin mirrors structurally.
