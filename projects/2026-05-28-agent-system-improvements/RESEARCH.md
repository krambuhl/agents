# RESEARCH — what could be improved about our agent system (loom + guild + ev)

**Topic.** A research dossier on operator-experienced friction and missing capabilities across the three-plugin agent substrate (loom, guild, ev), grounded in the just-closed `guild-matrix-precompile` project and the substrate's current code.

**Scope.** Three lenses, per the operator's framing at session start:
1. Cross-plugin seams — places where two skills overlap on the same artifact without knowing the other exists.
2. Operator-Claude ergonomics — cognitive load of running a session through this stack.
3. Missing capabilities the system doesn't yet support.

The shallow layer (per-plugin bug list) is explicitly out of scope — `projects/2026-05-28-guild-matrix-precompile/retros/landed.md` already inventories five known follow-ups; this dossier addresses what those follow-ups don't name.

**Provenance.** Synthesized from a `/loom-research` interview (three shifts) plus a whiteboard panel per shift (5 engineers across 6 contributions total). Raw transcript + verbatim engineer contributions: `RESEARCH-NOTES.md`. Per-shift whiteboards: `whiteboards/research-shift-NN-*.md`.

---

## Constraints — evaluator verdicts have no per-unit scope

**Observation.** Judgment-heavy `/ev-loop-interactive` units (new abstractions, API design, schema work) pay an attention tax during `/guild-validate` because each evaluator in the panel exhaustively cycles through its full rubric in verdict prose even when only 2-3 dimensions are load-bearing for that unit. The operator confirmed this is the dominant heaviness shape for judgment-heavy units, not flag noise.

**Substrate hooks (where a fix would live).**
- `plugins/ev/skills/ev-loop-interactive/SKILL.md:295-349` — the dense-packet shape carries three sections (efficiency / contract / signals). None of them declare per-unit rubric scope.
- `plugins/guild/agents/personalities/personality-base.md` — no scope/applicability framing; the shared evaluator stance is unconditional.
- `plugins/guild/agents/retained/evaluator-contract-fit.md` — `scope` only appears as a flag classification (`scope-creep`), never as a panel-time narrowing mechanism.
- `plugins/guild/docs/PANEL-COMPOSITION.md:284-299` — per-phase and per-unit `Panel:` overrides ALREADY EXIST as a panel-composition escape hatch; the substrate-engineer whiteboard contribution flags this as an existing affordance the operator isn't reaching for.

**What's contested across the panel.** The skeptic raised a load-bearing alternate framing: the diagnosis may be misplaced one layer up — if contracts arrived at `/guild-validate` with sharp acceptance criteria, evaluators would have the information to self-narrow without a rubric-scope mechanism. The fact that operators feel the need to narrow at invocation time suggests **contracts are arriving under-specified** and evaluators are dutifully filling the gap. Under this framing, the missing feature is contract-quality scaffolding (a `/ev-loop-interactive` step that pressure-tests contract scope before spawning evaluators), not a rubric-narrowing knob on evaluators.

The substrate-engineer added a related caveat: stripping no-findings sections from verdicts wholesale would silently underspecify the verdict — was a dimension out of scope, or was it in scope and clean? The operator currently gets a confidence signal ("I checked X and found nothing") for free. The cleanest narrowing keeps that confidence signal as a short structured scope declaration ("scope: [acceptance criteria 2, 3]; not evaluated: rubric dimensions a, b, c") near the top of the verdict.

**Sequencing recommendation.** Try the upstream fix first: contract-quality scaffolding that produces sharper acceptance criteria. If operators still report the tax with sharp contracts, then reach for evaluator-layer scope-narrowing. The lowest-blast-radius nudge in the meantime is a doc/learning that surfaces the existing `Panel:` override — operators can opt into a narrowed panel today without any code change.

---

## Constraints — RESEARCH.md is a one-shot input, not a living fact-canon

**Observation.** The operator wants `RESEARCH.md` to become the canonical project fact-store, with three behavioral changes from today's substrate:
1. `/loom-plan` aggressively delegates fact-gathering to `/loom-research` in fresh-context sub-agents (keeping the planner's context clean), not just when RESEARCH.md is absent but also when the plan-interview surfaces a fact gap.
2. `PLAN.md` references `RESEARCH.md` by anchor rather than embedding facts.
3. Implementation phases (via `/ev-loop-interactive`) can amend `RESEARCH.md` when new facts surface mid-flight — bidirectional flow.

**Substrate hooks.**
- `plugins/loom/skills/loom-plan/SKILL.md:89-94` — auto-spawns `/loom-research` only on `RESEARCH.md` absence. No path for "exists but plan surfaced a gap."
- `plugins/ev/skills/ev-loop-interactive/SKILL.md:469-485` — inner-RPI hop already spawns `/loom-research` mid-execution. The skill body flags an OPEN question about whether research-on-already-researched-project appends or overwrites.
- `plugins/loom/cli/verbs/loom/research.ts:161-179` — `bin/loom research` is a `copyFileSync` over RESEARCH.md gated by a committed-state check (`research-exists-committed` error code for re-runs). Overwrite-by-default with a "don't do that" guard.
- `plugins/loom/skills/loom-revise-plan/SKILL.md` — flavor-routing grill pattern (mechanical | research) that a future `loom revise-research` could mirror; listed under Deferred at `loom-research/SKILL.md:402`.

**Design decisions surfaced by the panel.**
- **Append-with-provenance is the right shape** — but only if enforced at the write layer rather than by convention. Amendments append delimited blocks with structured provenance frontmatter (project slug + phase + amending session id + timestamp); amendments never edit prior blocks. Current state is a fold over blocks. Same shape as `manifest.toml`'s `[[events]]` table. Cross-PR concurrent amendments become git-mergeable by construction, the way two appends to a JSONL file merge cleanly.
- **A soft schema becomes mandatory once RESEARCH.md is referenced by anchor.** Heading conventions at minimum (`## Facts`, `## Open questions`, `## Decisions` as a starter taxonomy). The prose layer stays freeform; the provenance frontmatter is the one place to be strict because programmatic readers will key on it.
- **Section headings become a public API.** The design-systems engineer flagged that current `/loom-research` headings (`## Whiteboard contributions`, `## Shift N — <topic>`) name *how facts got gathered*, not *what facts are about*. A referenced fact-canon wants semantic headings (`## Constraints — token pipeline`, `## Observed costs — CI runner minutes`). Keep the literal-process structure in `RESEARCH-NOTES.md`; promote semantic-fact structure to `RESEARCH.md`. This dossier itself uses the semantic-heading shape as a concrete instance.
- **Verb naming for the amend operation.** `loom revise-research` (a hyphenated compound verb) breaks the existing CLI vocabulary, which is either single-word lifecycle verbs (`plan`, `research`, `checkin`) or noun-then-subverb verbs (`retro write`, `project read`, `events append`). The cohesive shape is `loom research amend <slug>` — noun-then-subverb matching `retro write`, with `amend` precisely meaning "add to a committed thing without rewriting it" (lined up with git vocabulary). Once `research` becomes a noun-with-subverbs, the natural family opens up: `loom research init` (today's `loom research`), `loom research amend`, `loom research append`, `loom research show`.
- **High-low abstraction parallelism for amendments.** Two clear tiers with a sharp seam: the high abstraction is `/loom-research --mode=amend` (fresh interview starting from existing canon); the low abstraction is `loom research append --section=<heading> --fact-file=<path> --citing=<source>` (single grounded fact, no interview, citation required). Both share one invariant — every fact in RESEARCH.md has a source. Trap to avoid: a third middle abstraction ("lightweight interview" mode) that's neither full grill nor single append.

**Cost-of-substrate honesty.** The bidirectional flow's payoff is *not* in-project (the operator can already read the PR). The payoff is **cross-project fact reuse** — a future project's `/loom-research` grounding against accumulated amendments from prior projects. That payoff is only earned if amendments are first-class queryable artifacts (provenance frontmatter, append-only, stable anchors). Half-measures get the substrate weight without the payoff; the simpler "embed corrections in PLAN.md, capture learnings in retros" answer is correct unless the full structured-provenance shape is committed to.

---

## Constraints — the substrate has no self-observation and no self-evaluation

**Observation.** The substrate emits events to per-project `events.jsonl` but has no cross-project aggregation verb, no usage telemetry, and no regression-testing framework for its own components. The griot family (`griot-judge`, `griot-rewriter`, `griot-operator`, `griot-rubric-author`, `griot-debate-summarizer`) implements a self-validating benchmark loop for *learnings* only. Evaluators, whiteboard engineers, and skill outputs have no equivalent. Tuning happens by operator vibes.

**Substrate hooks.**
- `plugins/loom/cli/verbs/loom/events.ts:13-27` — `readEvents` reads per-project events filtered by `--since`, `--event`, `--limit`. No cross-project aggregation.
- `plugins/commons/cli/lib/events.ts` — canonical event-emission helper, synced into every plugin's `cli/lib/`. Append-only by construction.
- `plugins/griot/agents/` — the full griot evaluation loop. No `benchmark-*` equivalent for evaluators or whiteboard engineers.
- `scripts/sync-shared.ts --check` — existing file-mirror invariant check; the closest existing analog to convention-drift detection.

**Three distinct missing features, sequenced by cost.**

1. **Convention-drift detector (smallest, highest leverage to ship first).** Generalize `scripts/sync-shared.ts --check` from file-mirror invariants to behavioral conventions. A new `scripts/check-conventions.ts` (or `commons doctor --conventions`) that asserts mechanical invariants: every plugin emitting events imports from `cli/lib/events.ts` rather than a local fork; every `evaluator-*.md` has the expected frontmatter keys; every `whiteboard-*.md` declares its boundary section; every rubric check is reachable from the body and vice versa. Idempotent, additive-only, runs in CI in milliseconds. The testing-strategy engineer named **rubric-body coherence** as the load-bearing tier-one check — silent edits that break the contract a downstream skill relies on are the most common substrate regression class.

2. **Cross-project event aggregation (medium, ships next).** Folded read over per-project `manifest.events` + `events.jsonl`. The right verb-family naming is `loom events aggregate --since=7d --cross-project` (matching the existing noun-verb pattern), not a sibling `loom stats` noun — `stats` becomes a junk drawer because the substrate has no other observability artifacts yet. Two metrics from existing event data catch most evaluator regressions without a corpus suite:
   - **Spawn-to-finding rate** — over the last N invocations, what fraction produced any findings? Sudden drop to zero means the evaluator silently broke or its prompt collapsed.
   - **Non-applicability rate** — what fraction recused? Sudden spike to 100% means the evaluator stopped recognizing its own domain.
   No cache to start with — the aggregator reads completed lines, drops trailing partials. If cardinality eventually forces a cache, the key is `(project, last-event-timestamp)` and the cache stays derived (regenerable from `loom events aggregate --rebuild`), never a source of truth. The manifest stays canonical.

3. **Substrate self-evaluation suites (largest, only ships when measured demand exists).** Extending the griot loop to evaluators is asymmetric in a way the panel surfaced: griot's `judge` scores prose against an open rubric, but an evaluator's regression check needs a fixture corpus of `(input, expected_flags)` pairs scored mechanically. That's not a rubric, it's a regression suite — a different substrate family. Naming it `benchmark-*` (sibling to `griot-*`, not a generalization) keeps griot meaning "learnings-quality loop" and leaves room for both families to evolve. Corpus shape: **factories for negative space** (synthetic clean inputs that should produce zero findings — stable because "clean" is stable) plus **fixtures for positive space** (a small curated corpus of real-world diffs that historically tripped the evaluator). Fixtures rot loudly and visibly; that's the signal, not noise. Pure-fixture suites rot silently as the evaluator surface evolves.

**Sequencing recommendation.** Ship convention-drift detection first (one afternoon of work); cross-project aggregation second (one week); benchmark-* substrate only after drift checks plus aggregated metrics surface a specific evaluator regressing in the wild. Building substrate self-evaluation before substrate observation is building the cure before measuring the disease.

---

## Open questions

These are deliberately not resolved by this dossier; they're load-bearing for the next planning round.

- **Is the verdict-padding diagnosis at the right layer?** The skeptic's framing (under-specified contracts as the upstream cause) competes with the operator-experienced framing (evaluator-side rubric scope as the lever). The dossier recommends trying the upstream fix first; if operators still report the tax with sharp contracts, the evaluator-side fix becomes the answer. The empirical test isn't designed yet.
- **What is the section taxonomy for `RESEARCH.md` as a fact-canon?** `## Facts`, `## Open questions`, `## Decisions` was the starter shape. A real taxonomy needs to survive cross-project use, support stable anchor slugs, and tolerate amendment without re-numbering. This dossier's own heading shape (`## Constraints —`, `## Open questions`) is a candidate worth pressure-testing.
- **Does `evaluator-substrate-engineer` exist?** The substrate-engineer whiteboard contribution flagged a meta-tension: the role's own prompt says "there is no `evaluator-substrate-engineer`" because substrate concerns are design-phase, not review-phase. If substrate work has become a first-class unit type that needs antagonist review (the recent substrate-* projects suggest it has), this statement is outgrown and a new family member is warranted. The decision is its own brief.
- **Does append-only RESEARCH.md need a `revision-trigger` classification on session-note captures?** The ev-loop SKILL.md flags this at line 466 as a Phase 7 follow-up. If amendments become a real workflow, every amendment should leave a session-note breadcrumb with its trigger so retros can fold "what facts did we learn mid-flight" without re-reading the diff.

---

## Recommended next steps

In order of decreasing leverage-per-cost:

1. **Doc nudge surfacing the existing `Panel:` override** (`PANEL-COMPOSITION.md:284-299`). Zero code. Immediate relief for operators who want narrower panels on mechanical units today.
2. **Convention-drift detector** extending `scripts/sync-shared.ts --check` to behavioral invariants. One afternoon. Catches the most common substrate regression class (silent contract drift between rubric and body).
3. **Decide append-vs-overwrite for `/ev-loop-interactive`'s inner-RPI hop.** Resolves the open question flagged at ev-loop SKILL.md:469-485. The substrate-engineer panel recommends append-with-provenance; the only blocker is committing to the structured-frontmatter shape.
4. **Vocabulary refactor: `loom revise-research` → `loom research amend`** (and the implied `loom research init` / `append` / `show` family). Re-shapes the verb family without changing behavior until a feature lands behind it. Cohesion compounds.
5. **`loom events aggregate --cross-project`** as the first cross-project observability verb. Two metrics (spawn-to-finding, non-applicability) tell the substrate whether benchmark-* is needed before any benchmark-* code gets written.
6. **Contract-quality scaffolding** as the upstream fix for verdict padding. New `/ev-loop-interactive` step that pressure-tests contract scope before panel spawn.
7. **`benchmark-*` family** only after items 1-6 reveal a specific evaluator regressing.

Each item is sized to a single `/loom-plan` invocation. Items 1-4 are substrate-shape; items 5-7 are substrate-extension.
