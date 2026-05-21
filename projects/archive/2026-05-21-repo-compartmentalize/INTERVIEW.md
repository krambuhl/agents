# Interview — repo-compartmentalize

The walked decision tree behind `PLAN.md`. Each section captures the
recommended option, the answer that landed, and the rationale.

## Q1 — Shared plugin scope

**Recommendation**: `grill-me` + `review-skill` + `docs/` (option B of three).

**User answered**: Maximal (option C) — `grill-me` + `review-skill` + `docs/` +
selected floating skills. Asked to grill on which floating skills come in.

**Rationale**: User signaled appetite for real compartmentalization rather
than minimum scope. The maximal option matches the brief's "compartmentalize
better" intent.

## Q2 — Floating skills inclusion

**Recommendation**: `find-skills` IN; `moshi-best-practices` OUT (per follow-up
grilling).

**User answered**: "No preference" — deferred to my call.

**Rationale**: `find-skills` is a generic helper (wraps `npx skills`), matches
the cross-substrate utility shape. `moshi-best-practices` is personal Mosh/SSH/
tmux infrastructure — including it would muddy the shared plugin's identity
("cross-substrate utilities" vs. "Evan's grab bag"). The marketplace ships
under `@krambuhl`, but the plugin's semantic should still be clean.

## Q3 — Docs delivery mechanism

**Recommendation**: option A — sync `docs/` into every plugin that references
docs.

**User answered**: option A (recommended). Each plugin that needs docs gets
its own synced copy at install time; no cross-plugin path resolution required.

**Rationale**: Low-magic; matches what `docs/AGENT-CONVENTIONS.md:78-91`
already (incorrectly) claims is happening; ~250KB total duplication is
trivial; doesn't bet on uncertain Claude Code plugin-loader behavior.

## Q4 — Draft rename approach

**Recommendation**: option A — hybrid (rename git, collapse project).

**User answered**: option C (full restructure) with reframing — "the intention
was to remove draft entirely. once we added research and plan to loom, we
didn't need these."

**Rationale**: The "draft" concept itself is gone after `loom-absorb-draft`
landed. The leftover modules with "draft" in their names are remnants of a
separate-substrate world. So the right framing isn't "rename for clarity"
but "absorb the functionality into loom's existing modules." `cli/lib/
draft-project.ts` dissolves into `project.ts` (with both filter functions
exposed); `cli/lib/draft-git.ts` renames to `cli/lib/git.ts` (it was always
just loom's git wrapper).

## Q5 — `learnings/` fate

**Recommendation**: option A — move to `docs/seed-learnings/` (preserve,
disambiguate).

**User answered**: option B — run through `griot capture` pipeline; eat own
dog food.

**Rationale**: The marketplace ships griot to consumers; running its own
content through the pipeline aligns the marketplace's posture with what it
sells. Higher effort, but the philosophical fit is strong. The 4 notes are
substantive (bulk-transforms wisdom, biome-version foot-gun, generator/
antagonist pattern declaration, dependency-grep papercut) — they deserve
to live in the live rollup, not as inert root files.

## Q6a — `scripts/` home

**Recommendation**: option A — move to `cli/sync-shared.ts`; delete `scripts/`.

**User answered**: keep `scripts/`. With a forward-looking note: "my hope is
that the cli directory may not be needed."

**Rationale**: The user planted the seed for a much bigger architectural
question (Q7 below). Keeping `scripts/` makes sense if `cli/` at root might
go away entirely — `scripts/` becomes the surviving home for marketplace
maintenance scripts.

## Q6b — Root `bin/` shims

**Recommendation**: option A — regenerate to match plugin-shim shape.

**User answered**: option C — delete root `bin/` entirely.

**Rationale**: With the canonical-at-root layer dissolving (Q7), there's no
root `cli/` for the shims to wrap anyway. Plugin-local bin shims are the
only ones that survive. Dev-loop convenience is preserved via
`node plugins/<plugin>/cli/<cli>.ts`.

## Q7 — Canonical-at-root layer (the defining decision)

**Recommendation**: option A — dissolve canonical root entirely; each plugin
self-contained.

**User answered**: option A (recommended). Confirmed the architectural shift.

**Rationale**: The dissolution removes the edit-time layer that the
marketplace migration left behind. Each plugin owns its own skills/agents/
CLI files in its own tree; only `plugins/shared/cli/lib/` and `plugins/
shared/docs/` are mirrored to consumers via the shrunk `sync-shared.ts`.
No cross-plugin runtime imports required — each consumer ships its own
synced copy at install time. This is the cleanest expression of the user's
compartmentalize intent.

## Q8 — Sequencing posture

**Recommendation**: option A — strict serial, lowest-risk first.

**User answered**: option A (recommended).

**Rationale**: The chain is reviewable incrementally; any single PR
revertable without unwinding the rest. Slower calendar, but matches the
user's "one conceptual unit per PR" preference and the documented three-
phase pattern (setup → bulk → cleanup). Parallel waves were available
(PR6 draft restructure and PR7 learnings are independent of PR3-PR5) but
serializing keeps the cognitive load manageable.
