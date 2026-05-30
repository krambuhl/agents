# PLAN — commons-sync-reconciliation

**Topic**: reconcile loom's forked `cli/lib` with `commons` and turn the documented-but-unenforced `sync-shared --check` invariant into a real, enforced gate — so the substrate's shared-lib sync can't silently fork again.
**Loop**: `/ev-loop-interactive` per phase
**Cadence**: stacked via `gt`, sequential 1 → 4; PRs via `gh` until Graphite server-sync lands.

## Context

The `[PR3]/[PR6]` "move cli/lib + docs canonical into commons" restructure made `plugins/commons/cli/lib/` the source of truth and left each consumer plugin a mirror copy, kept aligned by `scripts/sync-shared.ts`. CLAUDE.md documents that alignment as a CI gate ("run sync-shared before committing — CI will fail otherwise").

It is not enforced. There is no `.github/`, no CI workflow, no npm script, and no git hook that runs `sync-shared --check`. The invariant was honor-system. Under a burst of ~6-7 parallel-agent PRs (#142-#150 — substrate-tempering, guild-workflow-coverage, workflows-adoption, loom-plan, raw claude/* agents), the copies forked: `commons/cli/lib/types.ts` froze at its one [PR3] commit while loom's `types.ts` kept evolving (parsePlan, ManifestToml, Revision, PR-state), accumulating ~110 lines of loom-specific types; `adopt/config/project.ts` diverged bidirectionally too. And `sync-shared` is now destructive — its orphan-sweep deletes loom's plugin-local lib (`manifest-toml/plan/toml/commit-discipline.ts`), the lib-level twin of the ADR-0005 docs bug (itself accepted-but-unimplemented).

Net: `sync-shared --check` is RED on main (19 records), running `sync-shared` breaks loom, and any `commons` edit is unsafe — which blocked `substrate-tempering` Phase 3 (it edits the commons event union). This project unblocks that and closes the loop so it can't recur.

## Scope

### In
- Implement the accepted ADR-0005 orphan-preservation in `sync-shared` and mark the plugin-local files.
- Reconcile the forked files so loom's mirrors are clean and loom-specific content lives in loom-local files.
- Resync; green `--check`; loom + guild intact.
- Wire `--check` into a real enforced gate (CI + hook); write the ADR; make CLAUDE.md's claim true.

### Out
- Migrating loom onto commons's split files (`manifest.ts`/`checkin.ts`/etc.) — loom keeps its loom-specific lib (`manifest-toml.ts` etc.; `commons/manifest.ts` is a different 42-line file). Reconcile the SHARED files only.
- The substrate-tempering phases themselves (this is their prerequisite, not a tempering phase).

### Deferred
- Auditing ev/griot consumer libs for the same fork (likely present; same mechanism). Phase 2 audits guild + loom; extend if drift is found.

## Phases

### Phase 1 — ADR-0005 orphan-preservation in sync-shared

**Deliverable**: implement the accepted ADR-0005 in `scripts/sync-shared.ts`: a `plugin-local` marker convention (`// sync-shared: plugin-local` for `.ts`, `<!-- ... -->` for `.md`) excludes a file from the orphan-sweep; the default orphan behavior flips to fail-safe-preserve (no deletion); `--strict-orphan` restores deletion of unmarked unknowns. Mark the existing plugin-local files: loom `cli/lib/{manifest-toml,plan,toml,commit-discipline}.ts` + the `.smoke.ts`/`.harness.ts`; guild `cli/lib/toml.ts` + `docs/AGENT-CODEGEN.md`.

**Verification**: a default `sync-shared` run deletes nothing; marked files survive `--strict-orphan`; unit tests for marker + default-preserve + strict modes; `npm test` green.

### Phase 2 — Reconcile the forked files

**Deliverable**: for each forked file (`types/adopt/config/project.ts`; audit guild's `cli/lib`), diff loom vs commons, classify each delta as shared (belongs in commons) or loom-specific (extract to a loom-local, marked file — e.g. lift loom's parse-plan/manifest types out of the mirrored `types.ts`). Reconcile so loom's mirrored files become clean commons-mirrors and loom-specific content lives in clearly loom-local files; update loom's imports.

**Verification**: post-reconcile, loom's mirrored files are byte-equal to commons (the sync is a no-op for them); loom's CLI imports resolve; loom verbs spot-run (parse-plan, checkin, phase); `npm test` green.

### Phase 3 — Resync + green

**Deliverable**: run `sync-shared` (now safe + files reconciled); consumer libs mirror commons cleanly; plugin-local files preserved.

**Verification**: `node scripts/sync-shared.ts --check` → green (0 records); `npm test` green; loom + guild CLIs work.

### Phase 4 — Enforce the gate (close the loop)

**Deliverable**: wire `sync-shared --check` into a real blocking gate so a divergent commit fails before merge — create `.github/workflows/` running `--check` (+ `npm test`), and/or a pre-commit hook + an `npm run check` script. Write an ADR recording the decision (enforce the commons-sync invariant via CI, not honor-system) + the root cause (documented-but-unenforced gate + the parallel-agent fork). Update CLAUDE.md so its "CI gate" claim is true.

**Verification**: a deliberately-divergent commit makes the gate fail (tested); CI runs `--check` + `npm test` on PRs; the ADR is committed.

## Dependencies

- Phase 1 + Phase 2 → Phase 3 (orphan-preservation + reconciled forks must precede a safe resync, else the resync clobbers loom).
- Phase 4 lands LAST — wire the gate on an already-green tree.
- External: `substrate-tempering` Phase 3 is blocked on this project; it resumes after Phase 3 here lands.

## Verification (project-level)

Done when: `sync-shared --check` is green on main; default `sync-shared` is non-destructive; loom + guild CLIs work and `npm test` is green; the `--check` gate is wired into CI and demonstrably fails a divergent commit; the ADR + CLAUDE.md reflect the enforced invariant.

## Risks (project-level)

- **Reconciling the fork mis-classifies content → breaks a consumer.** Mitigation: per-file diff review + test after each; per-file divergence is small (6-110 lines).
- **The fork exists in ev/griot too.** Mitigation: Phase 2 audits; extend if found.
- **Enforcing the gate retroactively flags other latent drift.** Mitigation: that is the point — surface + fix in Phase 3 before wiring the gate in Phase 4.

## Open questions (deferred to unit contracts)

- Phase 2: exact loom-local file for the extracted types (a new `loom-types.ts` vs folding into `plan.ts`/`manifest-toml.ts`).
- Phase 4: CI-only vs CI + pre-commit hook + npm script (belt-and-braces); whether to run `npm test` in the same workflow.
- Whether ev/griot need the same reconciliation (audit in Phase 2).

## Decisions

1. **Two-part fix**: reconcile the fork (symptom) AND enforce the gate (root cause). The gate (Phase 4) is the most important — without it, the fork recurs.
2. **Loom keeps its loom-specific lib** (`manifest-toml.ts` etc.) — not migrated to commons's split files. Reconcile the SHARED files only.
3. **Fail-safe-preserve default** (ADR-0005): `sync-shared` stops deleting by default; deletion is `--strict-orphan` opt-in.
4. **Separate project** from substrate-tempering (which surfaced it and is blocked by it).
