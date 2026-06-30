# RESEARCH-NOTES: Distributed project store

Raw interview + observations behind `RESEARCH.md`. Append-only.

## Origin

Spun out of the ev-env work. The user runs `/ev-run --env=coder`
(dispatch mode) across machines and wants `projects/` state to live in an
external shared repo all machines write to `main` async, anticipating
multi-write git conflicts when a project is parallelized across
containers.

## Interview — decided forks

1. **Conflict-handling approach → Hybrid (per-file collections + thin
   coordinated core).** Partition the append-only collections back to
   per-record files (conflict-free parallel writes); keep a thin
   `manifest.toml` for mutable singletons (meta/config/phases)
   coordinated with pull→rebase→push. Rejected: pure pull-rebase (the
   array-append conflict is the common case; needs a TOML merge driver
   and serializes the thing we parallelized); pure less-flat (per-phase
   status files complicate transitions; largest change).

2. **Does the shared repo replace ev-env #6 sidecar-sync? → Yes, git is
   the sync layer.** Every machine + coder workspace clones the projects
   repo; `LOOM_PROJECTS_ROOT` → the clone; writes commit + pull --rebase
   + push. Drops the planned tar-over-ssh dispatch sync.

3. **Scope → storage + repo only.** Remaining ev-env shipped-default
   fixes (#1/#2/#3/#4/#7) stay as separate quick PRs, not phases here.

## Observations (file-anchored)

- `manifest.toml` sections: `[meta]`, `[config]`, `[[phases]]`,
  `[[events]]`, `[[checkins]]`, `[[sessions]]`, `[[retros]]`,
  `[[replies]]`, `[[findings]]` — `manifest-toml.ts:481–502`.
- `projects/CONVENTIONS.md`: the manifest writers are Category 3; the doc
  explicitly notes checkins/sessions/retros/pr-responses were Category-2
  partitioned per-file before "the state-file consolidation," which
  "trades partition-independence for single-writer serialization."
- `loom.ts:187`: `LOOM_PROJECTS_ROOT ?? join(cwd, 'projects')` — the
  relocation hook already exists.
- `scripts/convert-loom-state-to-toml.ts`: prior forward migration; model
  for the reverse exploder.
- Naming: this project dogfoods the new short-slug rule (descriptive part
  ≤ ~3 words, no ballooning).

## Threads still open (→ PLAN.md)

- Core-write pull→rebase→push protocol + phase merge posture.
- Sortable event filenames for cross-writer ordering.
- Migration: hard cutover vs dual-read.
- Cross-file atomicity (checkin + phase flip span two files).
- CLI write-target + read-aggregation refactor; update
  `parallel-work-invariant.test.ts` + `CONVENTIONS.md` (collections back
  to Category 2).
- External repo auth/push from coder workspaces.
