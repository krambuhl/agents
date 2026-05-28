# Substrate consolidation

Kill the experimental substrate forks and fold their good ideas back into the canonical `loom` / `guild` / `ev` plugins. Three forks were built to explore alternatives — the jelly family (`jelly`, `jelly-guild`, `jelly-loom`, `jelly-run`) and the Linear family (`linear-loom`, `ev-linear`). The exploration surfaced several designs that are strictly better than the originals, and one (`jelly-run`'s `/goal` wrapper) that is structurally dead. This project harvests the winners into the canonical plugins, then deletes all six forks.

See [RESEARCH.md](./RESEARCH.md) for the empirical foundation each decision rests on.

**Constraint relaxed**: no backwards compatibility is required, and no in-flight loom projects need protecting. The plan is written as if the slate is clean — old state formats and old agent files are replaced outright, not migrated.

## Context

The forks were a testbed. The point of the testbed was always to find the good ideas and bring them home; maintaining a permanent parallel family is just paying rent on a fork. Two findings made the consolidation decision concrete:

- The forks' best ideas (3-axis agents, single-file TOML state, co-located revision logs, named recipes) are clean wins the originals should simply adopt.
- Nothing in `loom`/`guild`/`ev` imports any fork; the only reference is an entry in the marketplace-manifest test. Deletion is mechanically safe (RESEARCH.md § 6).

## Scope

### In
- **Single-file TOML state** (`loom`): all machine state consolidated into one sectioned `manifest.toml`, replacing `manifest.json` + `config.json` + `events.jsonl` + `checkins/` + `sessions/`. State is committed but rides *inside* the feature commit — the loop never makes a state-only commit.
- **Agent collapse** (`guild`): the ~21 baked agent files become a 3-axis source model (personality x domain x phase) compiled to scoped agent files by a `guild generate` build step.
- **Shared plan-parser lib** (`loom`): typed, tested PLAN.md parsing, extracted from skill prose.
- **Revision split** (`loom`): machine record in `manifest.toml` `[[revisions]]`; human rationale in PLAN.md's `## Revision log`.
- **Recipes** (`guild`/`ev`): named multi-domain/multi-agent dispatch patterns as a first-class concept (absorbs the `design-systems` perspective and the ev-linear recipe pattern).
- **ev integration** (`ev`): commit-discipline (state rides the feature commit), recipe references, preflight `command -v` checks.
- **Deletion**: remove all six fork plugins and their marketplace-manifest test entries.

### Out / deferred
- **JSON-schema output contracts** for CLI read verbs — deferred. The consumer that justified them (`ev-linear`) is being deleted, and `manifest.toml` already carries `schema_version`. Revisit only if ev's parsing of loom read-verbs proves fragile.
- **Composed stable keys** + **marker files** (from `linear-loom`) — out. They solved Linear's two-source reconciliation (PLAN.md ↔ Linear state); single-source loom has nothing to reconcile (RESEARCH.md § 5).
- **A reviewer-phase `performance` evaluator** — out for now; `performance` stays a planner/researcher domain.

## Phases

### M1 — loom state model

#### Phase 1 — Shared plan-parser lib

**Goal**: Extract PLAN.md parsing into a typed, unit-tested loom CLI lib so the manifest and revision work lean on one parser instead of re-deriving it in skill prose.

**Exit**:
- `loom/cli/lib` exposes a typed `parsePlan()` that returns phases, exit criteria, and dependencies as a typed tree.
- Unit-tested against real PLAN.md fixtures, including this project's PLAN.md.
- No skill body re-implements PLAN.md parsing.

**Depends on**: nothing.

#### Phase 2 — Single-file TOML state

**Goal**: Consolidate all of loom's machine state into one sectioned `manifest.toml`.

**Exit**:
- loom reads/writes a single `manifest.toml` with sections `[meta]`, `[config]`, `[[phases]]`, `[[events]]`, `[[checkins]]`, `[[sessions]]`.
- A hand-rolled, zero-dependency TOML parser (Node strip-only safe — no parameter properties, no `*/` JSDoc footgun) ported and adapted from `jelly-loom`, with round-trip tests against real manifests.
- CLI state verbs (`phase update`, `pr merged`, `checkin write`, …) are **working-tree writers**: they mutate `manifest.toml` and never commit. Writes are atomic (temp + rename). Append-only sections (`[[events]]`, `[[checkins]]`) are only ever appended to, by CLI discipline.
- `manifest.json`, `config.json`, `events.jsonl`, `checkins/`, `sessions/` are removed from the state model.
- A real-artifact regression test covers a genuine `manifest.toml`, not only fixtures.

**Depends on**: Phase 1.

#### Phase 3 — Revision split

**Goal**: Record plan revisions in both layers — machine record in the manifest, human rationale in the plan.

**Exit**:
- `loom revise-plan` appends a `[[revisions]]` entry (`timestamp`, `target`, `seq`) to `manifest.toml` **and** a dated rationale entry to PLAN.md's `## Revision log` section, atomically (one write rewrites PLAN.md and the manifest together).
- Test: a revision produces exactly one `[[revisions]]` entry and one PLAN.md log line; the two never drift.

**Depends on**: Phase 1, Phase 2.

### M2 — guild agent collapse

#### Phase 4 — Author the 3-axis source

**Goal**: Express guild's agents as orthogonal axes instead of ~21 baked files.

**Exit**:
- Source authored: **5 personalities** (skeptic, methodical, generative, pragmatist, synthesizer), **12 core domains** (a11y, react, naming, tokens, test-unit, test-integration, css-architecture, nextjs, composition, abstraction, performance, substrate), **4 phases** (researcher, planner, implementer, reviewer), and a **domain→tools map** keyed by (domain, phase).
- `contract-fit` retained as a hand-authored special — the always-on baseline reviewer, the taxonomy's one principled exception.
- Cross-cutting perspectives expressed as **recipes** (named multi-domain dispatch), starting with `design-systems` = composition + abstraction + tokens + naming @ planner.
- Domain prose adapted from `jelly-guild`'s mode files (harvest-first ordering keeps the source available).

**Depends on**: nothing (independent of M1).

#### Phase 5 — Codegen + panel migration

**Goal**: Compile the axes into scoped runtime agents and retire the baked files.

**Exit**:
- `guild generate` emits the needed personality x domain x phase combinations as real agent files with correct least-privilege frontmatter (phase base posture + domain-specific Bash grants) and inlined mode content (zero dispatch-time reads). Only needed combinations are generated, from a manifest — not the full 5 x 12 x 4 cross-product.
- Project-local domains flow through the same `guild generate` command (the off-rails escape hatch; sketch-ideation becomes an aart.camp-local domain rather than core).
- The old baked `evaluator-*` / `whiteboard-*` / `generator-*` files are removed.
- Tests: generated files parse and carry correct frontmatter tools; a panel smoke test confirms the collapsed panel still emits verdicts; the decision on committing vs gitignoring generated files is recorded (see Open questions).

**Depends on**: Phase 4.

### M3 — ev integration

#### Phase 6 — Commit-discipline, recipes, preflight

**Goal**: Adapt ev's loops to the new state model and harvested patterns.

**Exit**:
- ev-loop unit commits fold `manifest.toml` state mutations into the same commit as the code — no state-only commits (kills the orphan-event-carries-into-next-unit papercut; state and work now share a clock). Achieved via commit-discipline option (d) **derive-on-demand**: the `pr-opened` / `pr-merged` / `pr-updated` event vocabulary is retired and PR open/merged state is derived from `gh` via `loom pr discover` — there are no pr-events to carry, so the recurring phase-tail-carry wart is dissolved.
- ev skill bodies reference recipes by name rather than inlining ad-hoc dispatch.
- ev skill bodies run preflight `command -v loom guild` checks to fail fast on missing dependencies.
- `docs/SUBSTRATE-COMPOSITIONS.md` and `LOOM-CONVENTIONS.md` are swept from the pre-M1 JSON state model (`manifest.json` / `events.jsonl` / `checkins/` / `sessions/`) to the single-file `manifest.toml` model. The ev loops resolve every `§ Recipe` against `SUBSTRATE-COMPOSITIONS.md` as authoritative, so this doc-drift is load-bearing, not cosmetic.

**Depends on**: Phase 2 (manifest.toml), Phase 5 (recipes + generated panel).

### M4 — Salt the earth

#### Phase 7 — Delete the forks

**Goal**: Remove all six fork plugins now that their good ideas are home.

**Exit**:
- `jelly`, `jelly-guild`, `jelly-loom`, `jelly-run`, `linear-loom`, `ev-linear` deleted.
- Marketplace-manifest test entries for the deleted plugins dropped; marketplace tests green.
- No dangling references anywhere in the repo.

**Depends on**: Phases 1–6 (all harvests landed).

## Loop strategy

`ev-loop-interactive` throughout. This is craft/architecture work (state-model design, codegen, taxonomy reconciliation), not a bulk transform — it wants human-paired checkpoints, not tiered confidence batches.

## Verification

- **Real-artifact regression tests** for every author→consumer artifact pair, not just fixtures. This is the lesson the predecessor project (`loom-pr-reconcile-verb`) was born from: fixtures passed green while a real shipped template was broken. Applies to the TOML parser (round-trip against real manifests) and `guild generate` (emitted files parse + carry correct frontmatter).
- **Node strip-only e2e smoke** for the TOML parser, run under real `node` (not just vitest, which masks strip-only failures like parameter properties).
- **Panel verdict smoke** post-collapse: the generated panel still produces verdicts on a sample diff.
- **Commit-discipline check**: an ev-loop run produces no state-only commits.

## Risks

- **TOML parser under Node strip-only**: parameter properties and the `*/`-in-JSDoc footgun both throw under Node's built-in TS stripper and are masked by vitest. Port `jelly-loom`'s parser carefully; gate on a real-`node` smoke test.
- **Codegen cross-product explosion**: 5 x 12 x 4 = 240 possible combinations. Generate only the combinations actually needed (from a manifest), never the full product.
- **Single-file state integrity**: a rewrite-the-whole-file model loses jsonl's incidental append-only property. Mitigate with atomic temp+rename writes and CLI discipline that only appends to `[[events]]`/`[[checkins]]`. Acceptable at loom's scale (kilobytes, single-operator) per RESEARCH.md § 3.
- **Losing fork source mid-build**: mitigated by harvest-first / delete-last ordering (M4 is last).

## Open questions

- The exact domain→tools map per (domain, phase) — resolved during Phase 4.
- Whether `guild generate` output is committed or gitignored-and-generated-on-install — resolved during Phase 5.

## Decisions

See [INTERVIEW.md](./INTERVIEW.md) for the full decision tree (13 resolved decisions, each with the recommendation, the answer, and the rationale).

## Revision log

- 2026-05-27 — Phase 6 gains a 4th exit criterion: sweep the load-bearing pre-M1 doc-drift in SUBSTRATE-COMPOSITIONS.md + LOOM-CONVENTIONS.md to the manifest.toml model. Also records the commit-discipline decision: option (d) derive-on-demand, retiring the pr-opened/pr-merged/pr-updated event vocabulary in favor of loom pr discover.
