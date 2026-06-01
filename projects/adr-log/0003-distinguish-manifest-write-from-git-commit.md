# 0003. Distinguish manifest-write from git-commit

- **Date**: 2026-05-28
- **Status**: accepted

## Context

During Phase 3 P3D1 of `2026-05-28-loom-adr`, the new step 5.5 (ADR-emit) in `ev-loop-interactive`'s unit loop used the phrase "just-committed checkin" to specify when the marker scan fires. The dogfood at unit close revealed the phrase is ambiguous: it collapses two different commit boundaries in the unit's close path into one word.

The boundaries:
- **Step 4 — manifest-write**: `loom checkin write` appends the checkin's TOML section to `projects/<slug>/manifest.toml` via atomic temp + rename. The verb does NOT auto-commit to git. The "checkin" is now persisted in the manifest file but uncommitted as far as git is concerned.
- **Step 7 — git-commit**: the unit's checkpoint runs `git add` + `git commit` capturing the manifest update + the artifact files + any ADR file from step 5.5, as one revertable bundle.

Step 5.5 sits between these (it's positioned at step 5.5, between scope-shift detection at 5 and phase update at 6, all of which fire AFTER step 4 manifest-write and BEFORE step 7 git-commit). So when step 5.5 says "just-committed checkin," it actually means "the manifest entry written by step 4, not yet captured in a git commit."

Unit goal that surfaced this: Insert a new step 5.5 (ADR-emit) into ev-loop-interactive's unit loop, between scope-shift detection and phase update.

## Decision

Use **"just-written"** for the scan-trigger framing in step 5.5 (and any future hook that fires between manifest-write and git-commit). Reserve **"committed"** for the git-commit at step 7.

The ev-loop-interactive unit's close path has a two-stage commit shape: manifest-write at step 4 lands the checkin's substrate state; git-commit at step 7 captures the working-tree bundle including the manifest update, the artifact files, and any ADR file from step 5.5. The hook's `--no-commit` flag on `loom adr` is essential to this shape — it suppresses the verb's auto-commit specifically so the ADR can ride the same git commit as the rest of the unit's bundle. One revertable unit.

Substrate-wide application: every recipe in `SUBSTRATE-COMPOSITIONS.md` that wraps a manifest-mutating verb should use "writes" (or "appends") for its substrate-side action and reserve "commits" for the git-commit at the unit's checkpoint. The vocabulary distinction is small but load-bearing for any future hook positioned between manifest-write and git-commit.

## Consequences

- The unit close path has two distinct boundaries — a manifest-write (substrate state) and a later git-commit (the working-tree bundle) — and the substrate vocabulary keeps them separate: recipes say "writes"/"appends" for the manifest mutation and reserve "commits" for the git checkpoint.
- The manifest-write commits to whatever git branch is checked out, with no branch-awareness — a direct corollary of separating the two boundaries. `2026-05-30-shared-insights` Phase 6 codified the matching operator discipline (confirm `git branch --show-current` before the first substrate write) as a convention plus a loop preflight line, because a manifest-write on the wrong branch strands the work the later git-commit would have bundled.
- The `--no-commit` flag on `loom adr` (and any verb a between-write-and-commit hook invokes) is load-bearing: it lets the artifact ride the unit's single git commit rather than racing a sibling commit. One revertable unit.
- Watch: any new hook positioned between manifest-write and git-commit must keep the vocabulary distinction, or "committed" silently re-collapses the two boundaries.
