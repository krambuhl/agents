# 0014. loom commits project state into the store repo, and syncs it

- **Status**: accepted (implemented)
- **Scope**: loom git seam — `decision`/`adr`/`plan`/`research` verbs

## Context

Under `--env=coder` dispatch the two trees are deliberately separate
(operator's settled model): **code** lives in the work repo (cwd, e.g.
`~/patreon_react_features`) and **project state** lives in the external
store repo (`krambuhl/projects`, addressed by `LOOM_PROJECTS_ROOT`, e.g.
`~/projects`). This is the whole point of decision 0009's external layout.

But loom's committing verbs (`decision`, `adr`, `plan`, `revise-plan`,
`research`) had a latent conflation: they *write* the artifact under
`projectsRoot` (the store) but *commit* it with
`repoRoot ?? process.cwd()` — and `repoRoot` was never set, so every
commit ran in cwd. In the legacy monorepo that was invisible
(`projectsRoot = cwd/projects`, same repo). In the split model it breaks:
`git -C ~/patreon_react_features add ~/projects/…` → *fatal: path outside
repository*. State would fail to commit, or land in the wrong repo. This
is the seam decision 0012 parked for "real env handoff."

## Decision

**loom commits project state into the repo that holds the store, and — for
a distributed store — keeps it converged on the shared branch by
rebase-and-push after every state commit.**

Three pieces (all shipped):

1. **Commit target = the store repo.** `loom.ts` sets
   `ctx.repoRoot = git -C <projectsRoot> rev-parse --show-toplevel`
   (`resolveStoreRepoRoot`). The verbs' existing `repoRootOf(ctx)` now
   resolves to the store's git toplevel instead of cwd — **zero verb
   logic changed**, the fix is entirely in where `repoRoot` comes from.
   Backward compatible: in a monorepo the store's toplevel *is* cwd, so
   behavior is unchanged. `undefined` (store not yet a git repo) falls
   back to the old cwd default.

2. **Rebase-and-push after commit — for the distributed store only.** A
   new `commitState(runner, repoRoot, paths, msg, {push})` wraps
   `addAndCommit` and, when `push`, calls a new
   `GitRunner.syncToRemote(repoRoot)` that does
   `pull --rebase --autostash` then `push`, retrying once on a
   non-fast-forward race. `push` is decided **once** in `loom.ts`
   (`storeAutosync`): true iff the store repo is **distinct from the cwd
   repo** (so a monorepo is never auto-pushed) and `LOOM_STORE_NO_PUSH`
   is not set. `syncToRemote` is a no-op when the repo has no upstream (a
   local-only store), so it is safe everywhere.

3. **Append-mostly is what makes push-constantly work.** Everyone writes
   on the store's default branch; the per-phase-manifest + per-record
   monotonic-numbered-file layout (decision 0009) means concurrent
   writers usually touch different files, so `pull --rebase` is clean and
   the one-retry covers the push race. This is decision 0002
   (pull-before-act) realized as pull-rebase-before-push.

`syncToRemote` is **optional** on `GitRunner` so the many existing stub
runners in tests type-check unchanged; when absent, `commitState({push})`
commits without syncing.

## Consequences

- **The operator's model works:** `cd ~/patreon_react_features` for code,
  `LOOM_PROJECTS_ROOT=~/projects/…` for state; `loom decision/adr/plan/
  research` commit into `~/projects` and push it, while code commits and
  the code PR stay in the work repo. Verified by a real two-repo test
  (`git.test.ts`): a `decision` run with cwd = code repo commits into the
  store repo and leaves the code repo untouched; a real bare-remote
  round-trip proves `syncToRemote` rebases and pushes.
- **Monorepo dev is untouched:** store toplevel == cwd repo → no
  auto-push, commit-only, exactly as before.
- **Not yet covered:** `checkin`/`phase` write store files but do **not**
  commit (they never did) — so their mutations still ride on the next
  committing verb or a manual sync. Committing *all* store mutations
  (events, manifests, checkins) into the store repo is the remaining
  piece of the "loom owns the store's git" arc.

## Watch for / forward pointers

- **Number-collision on rebase.** Two writers can pick the same next
  `NNNN` (decision/adr) concurrently; `pull --rebase` merges both files
  (no textual conflict) but the numbers collide semantically. v1 accepts
  this; a future renumber-on-rebase or a reserve-number step closes it.
- **Rebase conflict = hard stop.** A genuine content conflict makes
  `pull --rebase` fail and `syncToRemote` throws `git-sync-failed` rather
  than leaving a half-rebased store — the run surfaces it instead of
  guessing. Append-mostly keeps this rare.
- **checkin/phase committing** (above) is the natural next PR toward the
  full distributed store.
