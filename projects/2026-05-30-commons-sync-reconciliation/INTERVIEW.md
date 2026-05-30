# INTERVIEW — commons-sync-reconciliation

Planning context: this project was scoped mid-flight during `substrate-tempering` Phase 3, which it unblocks. The decisions below were walked with the operator at the whiteboard.

## Why this project exists (root cause)

The cli/lib fork happened because:

1. `[PR3]/[PR6]` moved cli/lib canonical into `commons` and left each consumer a mirror copy — a duplicate-file state safe only if kept in lockstep.
2. The `sync-shared --check` gate that should keep them in lockstep is documented in CLAUDE.md ("CI will fail otherwise") but NOT enforced — there is no `.github/`, no CI, no npm script, no git hook running it. Honor-system sync.
3. Honor-system sync collapsed under a burst of ~6-7 parallel-agent PRs (#142-#150). Evidence: `commons/cli/lib/types.ts` has ONE frozen [PR3] commit; loom's `types.ts` has many `[loom]` commits (kept evolving); `.github/` is absent.

The operator's hypothesis ("a period where ~3 agents were committing on top of each other") is confirmed at the fleet level: the parallel-agent load was the trigger; the missing enforced gate was the failure. A real `--check` gate would have bounced the first divergent PR.

## Decisions

1. **Scope = reconcile + enforce** (both), not reconcile-only. Reconcile-only leaves the root cause and the fork recurs. The gate (Phase 4) is the most important phase.
2. **Loom keeps its loom-specific lib** (`manifest-toml.ts`, `plan.ts`, `toml.ts`, `commit-discipline.ts`) — not migrated to commons's split files (`commons/manifest.ts` is a different 42-line file). Reconcile the SHARED files only.
3. **Phase-2 reconcile approach**: extract loom-specific content (the ~110 lines of parse-plan/manifest types currently inside the mirrored `types.ts`; the loom-only deltas in `adopt/config/project.ts`) into loom-local, marked files, so the mirrored files become clean commons-mirrors. The exact loom-local destination is deferred to the unit contract.
4. **Phase order**: 1 (orphan-preservation) + 2 (reconcile) precede 3 (resync); 4 (gate) lands LAST, on an already-green tree.
5. **ADR-0005 is already accepted** (orphan-preservation) but was never implemented — itself part of this same drift. Phase 1 implements it. A new ADR (Phase 4) records the enforce-the-gate decision + the root cause.
6. **Separate project** from substrate-tempering (which surfaced it and is blocked by it). substrate-tempering Phase 3 resumes after Phase 3 here lands.

## Open questions (carried to unit contracts)

- Phase 2: new `loom-types.ts` vs folding extracted types into existing loom-local files.
- Phase 4: CI-only vs CI + pre-commit hook + npm script.
- Whether ev/griot consumer libs have the same fork (audit in Phase 2).
