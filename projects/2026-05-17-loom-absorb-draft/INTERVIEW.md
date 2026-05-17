# Interview trail: Absorb draft into loom + add research verb

## Frame

The user has shipped one project using the current `draft` + `loom`
split and concluded the seam is awkward — `draft revise` is
mid-project work but lives in the planning CLI. They want to merge
draft's verbs (`plan`, `revise`) into loom, add a new `loom research`
pre-planning verb (grill-me, fact-based), and update the surrounding
skills (`ev-loop-*`, `ev-run`, plan-revise recipe) to reference the
new home.

This interview was run in **no-stop mode** — the user asked for the
plan to be drafted without round-tripping clarifying questions.
Decisions below are the assistant's reasonable calls, presented for
the user to redirect after the fact.

## Q1: Where do the new verbs live in loom's namespace?

- **Recommendation**: Flat top-level — `loom plan`, `loom research`,
  `loom revise-plan` — matching the user's framing.
- **Answer**: Adopted. Noted in *Open questions* that namespacing
  (`loom plan {create,revise,read}`) is a small follow-up if the flat
  shape stops feeling right.
- **Why**: These are project-genesis verbs at the same conceptual
  level as `loom project scaffold`. Cheap to namespace later; not
  cheap to un-namespace if we lead with it.

## Q2: Does `bin/draft` survive as a compat shim?

- **Recommendation**: No. Delete outright in Phase 4.
- **Answer**: Adopted.
- **Why**: Project ethos (per global CLAUDE.md: "no compat layers")
  argues against shims. The user is the only consumer; one rename,
  one cost.

## Q3: What artifacts does `loom research` produce?

- **Recommendation**: Two files mirroring the plan pair —
  `RESEARCH.md` (synthesized fact dossier with citations) +
  `RESEARCH-NOTES.md` (rolling investigation transcript).
- **Answer**: Adopted. Both land in project root alongside `PLAN.md` /
  `INTERVIEW.md`.
- **Why**: The `PLAN.md` + `INTERVIEW.md` split (polished synthesis
  vs raw transcript) has worked well. Reusing the pattern keeps the
  mental model consistent and the CLI seam parallel.

## Q4: How does the research interview differ from the plan interview?

- **Recommendation**: Facts-first, not recommendations-first. The
  research skill asks "what does the evidence say" / "what sources
  back this", not "I recommend X — confirm?". Citations are
  first-class.
- **Answer**: Adopted. Documented in `/loom-research` SKILL.md
  (Phase 3) as the load-bearing contrast vs `/loom-plan`.
- **Why**: The user explicitly framed research as "extremely fact
  based". If the skill text doesn't make that contrast load-bearing,
  the skill drifts into a second flavor of `/loom-plan` and serves
  nobody.

## Q5: How is the work decomposed into phases?

- **Recommendation**: Four phases —
  1. Move existing draft verbs into loom (rename only).
  2. Add `loom research` verb + scaffolding.
  3. Rebuild planning skills (`/loom-plan`, `/loom-research`,
     `/loom-revise-plan`).
  4. Update loops/recipes and delete `bin/draft`.
- **Answer**: Adopted. Phase 1 is the load-bearing PR; Phase 4 is
  the cleanup.
- **Why**: Each phase is one conceptual change, one PR. Ordering
  ensures `bin/loom plan` exists before skills point at it, and
  ensures the old draft files survive until Phase 4 so any
  mid-flight state isn't orphaned.

## Q6: Loop strategy — confidence or interactive?

- **Recommendation**: Interactive (via `/ev-loop-interactive`).
- **Answer**: Adopted.
- **Why**: The work is architectural (CLI surface design, naming,
  skill rewrites) — too much judgment per unit for a tiered-transform
  loop. Confidence loops shine on bulk-mechanical work; this isn't
  that.

## Q7: PR cadence?

- **Recommendation**: One PR per phase, four PRs total. Land
  1 → 2 → 3 → 4.
- **Answer**: Adopted.
- **Why**: Each phase is conceptually unified; splitting further
  produces churn, batching collapses signal.

## Q8: Verification approach?

- **Recommendation**: Existing test suite (`npm test`) is the primary
  gate at every phase. Phase 4 adds a repo-wide grep for `bin/draft`
  / `/draft-plan` references as the cleanup gate.
- **Answer**: Adopted.
- **Why**: Tests already cover the verbs; renaming preserves their
  signal. The grep gate catches dangling references in docs and
  recipes — historically the easiest things to miss in a CLI move.

## Q9: Risks worth naming up front?

- **Recommendation**: Five risks, each with a one-line mitigation —
  recipe references in `SUBSTRATE-COMPOSITIONS.md`, interview-style
  drift between research and plan, muscle-memory cost of the skill
  rename, in-flight project orphaning, `plan-read` naming
  awkwardness.
- **Answer**: All five recorded with mitigations in PLAN.md.
- **Why**: Naming risks up front is cheaper than discovering them in
  PR review. Each one carries a one-line mitigation so the plan
  reads as a working document, not a worry list.

## Q10: What's deliberately deferred?

- **Recommendation**: Three things — `loom revise-research`,
  `--from-research` flag on `loom plan`, archive-aware research
  dossiers.
- **Answer**: Adopted. Listed in *Scope: Deferred* and surfaced in
  *Open questions*.
- **Why**: Each is a "nice if cheap, big if not" — building any of
  them speculatively before the simpler shape ships would risk
  over-fitting to a use case that hasn't materialized yet.
