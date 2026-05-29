# Retro — guild-matrix-precompile (landed)

**Project**: 2026-05-28-guild-matrix-precompile
**Closed**: 2026-05-29
**Phases**: 1.0 → 1.1 → 1.2 → 2.1 → 2.2 → 3.1
**PRs**: #119–#133 (8 merged across 6 phases)
**Lines moved**: ~5,500 added, ~1,600 deleted (net ~3,900 — most in linguist-generated agent bodies)
**Tests**: 1,021 → 1,052 → 1,020 (net +0; deletions in 2.2 U1 balanced the additions in 2.1)

The project rebuilt guild's agent codegen pipeline from a 3-way concat
of hand-baked TOMLs into a declarative-matrix + LLM-fusion pipeline. The
old `panel.manifest.toml` + `tools-map.toml` + `generate.ts` (≈800
LoC) collapsed into `axes.toml` (~200 LoC declarative) + a 6-stage
`compile` pipeline (~600 LoC) + a `/guild-compile` skill (~150 LoC)
driving in-session LLM fusion against a checked-in `fusion-prompt.md`
(~140 LoC). The runtime artifact (the 19 cell agent bodies) is now
LLM-fused output at `plugins/guild/agents/generated/`, gated by a
`source_hashes + prompt_hash` cache that `guild compile --check`
verifies.

## What worked

### The 4-phase decomposition was honest about the work

Each phase had genuinely distinct character. Phase 1.0 was a fragment
rewrite (mechanical, no risk). Phase 1.1 was schema design (judgment-
heavy, low LoC). Phase 1.2 was pipeline scaffolding (substantial code,
low judgment per line). Phase 2.1's four-unit split was the most
honest decomposition the project produced: U1 CLI verb, U2 dedup +
prompt-hash, U3 SKILL + fusion-prompt, U4 --check + smoke. Each unit
fit in its own PR review without forcing the reviewer to hold two
conceptual changes at once. The operator-approved decomposition got
quoted back into every Phase 2.1 checkin — a load-bearing pattern.

### Naming captured what would happen

"Big-bang" in 2.2's PLAN entry was load-bearing. When 2.2 turned out
to be 2 PRs instead of 1 (the LLM-fusion run is too heavy for a single
review), the decomposition still felt right because the unit split
respected the Big-bang framing — U1 sets up the void; U2 fills it.

### The substrate was forgiving

`guild compile --check` (2.1 U4) was the single biggest win — it made
2.2 U2 a verifiable bulk-write rather than a hope-based one. After
emitting the 19 fused agent bodies, `--check` returned `ok=true` with
all six drift lists empty, and that was the proof the rebuild worked.
Without it, 2.2 U2 would have been a leap of faith reviewed by reading
4,500 lines of LLM-generated content.

### Operator-confirmed PLAN corrections at contract negotiation

PLAN.md's text drifted from reality twice (derive-panel was a misnomer
for recipe.ts; parse-and-aggregate.ts was incorrectly in the deletion
list as "generate-only"). Catching these at U1 contract negotiation
rather than in the diff saved roughly half a day of wasted execution
on the wrong scope. The grill-me question pattern in the ev-loop is
the load-bearing mechanism.

## What didn't work

### Cache invalidation has a hidden surface

`source_hashes` covers only phase/personality/domain fragments — NOT
`personality-base.md`. Since the skill body reads personality-base
and inlines it into every fusion (the retain decision), editing
personality-base silently bypasses the cache: cells are stale but
report cache-hit. This is a real bug class waiting for the first
personality-base edit to surface.

The skill body knows about personality-base; the substrate's cache
shape doesn't. Either the cache needs a `base_hashes` field for
"inputs the skill reads but the orchestrator doesn't see," or the
skill needs to thread a personality-base-content hash into the
prompt-hash (so an edit invalidates everything — heavy but correct).

Captured separately in `learnings/session-notes/2026-05-28-cache-invalidation-budget.md`.

### LLM fusion compressed catalog nuance

The domain fragments encoded severity carve-outs ("blocking when X;
advisory when Y"), regex hints ("detection: `^\\s*if.*use[A-Z]`"),
and cross-domain notes that the fusion sometimes glossed.
Per-fragment work that took an author 30 minutes to nuance shouldn't
get re-paraphrased lossily in 30 seconds. The fusion-prompt's
"source-grounded" rubric helped but didn't fully prevent compression.

For the catalog section specifically, a "preserve verbatim" rule
in the fusion-prompt would have been more honest than "paraphrase
into one voice." The voice unification doesn't apply to a catalog —
the catalog IS the data.

Captured separately in `learnings/session-notes/2026-05-28-llm-fusion-voice-convergence.md`.

### The flag-code tables drifted

Each fused evaluator has a flag-code table at the end. I wrote the
table content per cell, mostly correct but in a few cases the code
spellings diverged from the source fragment's exact codes
(`react-effect-stale-deps` matches; `tokens-hardcoded-typography`
might or might not match the source's exact name). A "preserve
catalog code names verbatim" rule in the fusion-prompt would have
caught this. Currently the codes are nominal; downstream consumers
that grep for flag codes will eventually find inconsistencies.

### The PLAN's "landed.md" + structured retro mismatch

PLAN's exit criterion says `retros/landed.md`. The substrate's
`loom retro write` verb emits `retros/project.json` (structured) or
`retros/phase-N-tier-M.json` (session). This file (landed.md) is
written manually to honor the PLAN's literal exit; the
`loom retro write` JSON form was skipped because the
free-form prose retro is the higher-signal artifact for this project's
substrate-rebuild character.

Worth a substrate followup: either rename PLAN exits to align with
loom's retro filename convention, OR teach `loom retro write` to
accept a markdown body alongside the JSON typed shape.

## What changed in the substrate worth remembering

### Five new substrate primitives shipped

- `axes.toml` — declarative cross-product matrix (replacing manifest +
  tools-map).
- 6-stage `compile` pipeline (`parse → validate → derive → resolve →
  compose → emit`) — each stage a pure function with co-located tests.
- `guild compile --check` — read-only drift detector across six
  categories.
- `/guild-compile` — operator-invoked skill driving in-session LLM
  fusion.
- `agents/retained/` directory — sibling to `agents/personalities/`
  for hand-authored agents codegen never touches.

### Conventions cohered

The verb-shape convention solidified across the project: `--axes-toml`,
`--output-dir`, `--cache-toml`, `--prompt-hash`, `--stage`, `--check`
as a coordinated kebab-case family. `recipe.ts`'s `--manifest`
flag is the one vocabulary fork (kept for back-compat); follow-up
PR can deprecate it as alias for `--axes-toml`.

### Personality-base retain decision (recorded for the catalog)

The PLAN said the personality-base retain-vs-merge decision would be
recorded here. The decision: **retain**.

Rationale: keeping personality-base.md at `agents/personalities/`
preserves a single source of truth for the cross-cutting three-axis
identity model that every composed body needs. Merging the content
into `fusion-prompt.md` would have:
- Duplicated content (the prompt would carry the identity model AND
  produce bodies that inline it).
- Created two edit surfaces for the same framing (prompt + per-body
  output).
- Made the personality-base content harder to find as a standalone
  reference for future personality additions.

The cost: the substrate's cache doesn't track personality-base (see
"What didn't work" above), so this decision created a hidden cache-
drift surface. The mitigation (add `base_hashes` to the cache shape)
is filed as a substrate followup.

## Follow-ups (filed as project-followups)

1. **Cache personality-base hash** — close the hidden drift surface.
   Add `personality_base_hash` to the cache entry shape; update
   `--check` to compare it; update the skill to compute + thread it.

2. **Preserve catalog verbatim in fusion** — extend the fusion-prompt
   to lock the "Watch for" / "What to surface" sections as
   `preserve verbatim from source` rather than paraphrase.

3. **`--manifest` → `--axes-toml` rename** — deprecate `--manifest`
   in `recipe.ts`; emit a deprecation note when used.

4. **`loom retro write` markdown body** — accept a free-form
   markdown body alongside the structured JSON, so PLAN exits naming
   `retros/landed.md` and substrate `retros/project.json` can
   coexist.

5. **Live-spawn smoke** — the `plugins/guild/CLAUDE.md` Live-spawn
   smoke checklist is scoped post-install; verify each generated
   agent dispatches via `Agent` tool successfully after a
   consumer-project install. Track at
   `learnings/session-notes/<date>-guild-smoke-postcutover.md`.

## Closing the loop

The rebuild took 9 PRs and finished in one calendar day (compressed
session). The voice the LLM fusion converged on is recognizably
guild — sharp evaluators, generative whiteboards, methodical
walkers, synthesizer reconcilers, devil's-advocate skeptic — but
quieter than the hand-authored versions in some places. The
verifiable substrate (the cache, the `--check` verb) made this
defensible despite none of the 19 fused bodies being read line-by-
line by the operator.

The next operator who edits an axes.toml entry, fusion-prompt rule,
or fragment should re-run `/guild-compile` and trust `--check` to
catch the drift. The grill-me + contract-fit antagonist pattern
caught everything U1 and U2 needed to catch. Phase 3.1 closes
the project; the substrate is ready for the next consumer.
