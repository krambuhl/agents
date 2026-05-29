# RESEARCH-NOTES — what could be improved about our agent system (loom + guild + ev)

**Topic.** Raw interview transcript + per-engineer whiteboard contributions, attributed verbatim. Synthesized dossier: `RESEARCH.md`. Per-shift whiteboards: `whiteboards/research-shift-NN-*.md`.

## Interview transcript

### Framing

Operator invoked `/loom-research` with the topic "what could be improved about our agent system (loom+guild+ev)?". Pre-flight surfaced:
- `griot use --as=llm` returned "no rollup yet — run `/griot-compact` once captures exist".
- No active project with `RECOVERY-STATUS.json`.
- `projects/2026-05-28-guild-matrix-precompile/` had just closed (retro at `retros/landed.md` on the current branch).
- Two recent archived substrate projects: `2026-05-26-substrate-consolidation`, `2026-05-28-substrate-followups` — signal that substrate-quality is an active thread.

Skill-side framing question offered four lens options (cross-plugin seams; per-plugin punch list; operator-Claude ergonomics; external-consumer onboarding). Operator selected: **"1 and 3, maybe on new features which our system don't support"** — combining cross-plugin seams + operator-Claude ergonomics + missing capabilities as the three-fold lens.

### Shift 1 — evaluator verdict padding

Operator named two anchor candidates from a four-option grill (substrate friction moments in recent sessions): **"3 and 4"** — ev-loop ↔ guild-validate handoff feels heavy + `/loom-research` has never been used on this repo. Skill chose to drill #3 first.

On unit-type where heaviness was acute, operator selected: **"Judgment-heavy units (new abstractions, API design, schema)"**. The panel is appropriate in fleet size but each evaluator's full rubric runs even when only 1-2 dimensions are load-bearing. Friction is rubric-irrelevance, not fleet size.

On heaviness flavor, operator selected: **"Verdict padding (Recommended)"** — operator reads through evaluators' exhaustive prose covering dimensions not in scope, looking for the load-bearing findings. Attention tax, not action tax.

Substrate evidence gathered inline:
- `plugins/ev/skills/ev-loop-interactive/SKILL.md:295-349` defines the three-section dense packet (efficiency / contract / signals); no rubric-scope section exists.
- `plugins/guild/agents/personalities/personality-base.md` grep for `scope|applicab|verdict shape` returned only references to general verdict shape, no scope/applicability framing.
- `plugins/guild/agents/retained/evaluator-contract-fit.md` `scope` only as a classification (`scope-creep`), not panel-time narrowing.

### Shift 2 — research as a living fact-canon

Skill explicitly named the shift: vocabulary moved from "evaluator/rubric/packet/verdict" to "skill-adoption/RESEARCH.md/operator-as-researcher" (≥40% vocab delta + explicit reorient cue — both shift-detection signals fired).

Skill offered four model options for why `/loom-research` is skipped (operator-already-has-research; skill-too-heavy-mid-thread; RESEARCH-doesn't-pay-rent; interview-for-one-shot-agents-not-paired-sessions). Operator answered: **"i this 4 and 2 are similar reasons why we have issues which is fine, but i would still like the loom-plan skill to push all that to loom-research (in a new context, important) so we can focus on formalizing the fact based research. plans will reference RESEARCH.md and update it if we learn something mid implementation"**.

This was a substrate-shape design proposal, not just a friction observation:
1. `/loom-plan` auto-delegates research to `/loom-research` in fresh-context sub-agents (planner's context stays clean).
2. RESEARCH.md is the canonical fact-store.
3. PLAN.md references RESEARCH.md.
4. Implementation phases can write BACK to RESEARCH.md with new facts learned mid-flight — bidirectional.

Substrate evidence gathered inline:
- `plugins/loom/skills/loom-plan/SKILL.md:89-94` — `/loom-plan` ALREADY auto-spawns `/loom-research` as fresh-context sub-agent when RESEARCH.md is missing. Operator may not have known. Gap: only fires on absence, not on plan-interview fact gap.
- `plugins/ev/skills/ev-loop-interactive/SKILL.md:469-485` — inner-RPI hop already spawns research mid-execution; flags OPEN question on append-vs-overwrite.
- `plugins/loom/cli/verbs/loom/research.ts:161-179` — `bin/loom research` refuses re-runs on committed projects with `research-exists-committed`. A `loom revise-research` verb is "Deferred".

### Shift 3 — substrate self-observation and self-evaluation

Skill offered three missing-feature options (cross-project memory; substrate self-observation; composable skills) plus a "close" option. Operator answered: **"Substrate self-observation / metrics"**. Then, while skill was gathering substrate evidence, operator added: **"or possible evaluation suites"** — expanding shift 3 to cover both telemetry AND regression-style benchmarks for substrate components.

Substrate evidence gathered inline:
- `plugins/loom/cli/verbs/loom/events.ts:13-27` — `readEvents` is per-project, filters on `--since`, `--event`, `--limit`. No cross-project aggregation. The verb file lists `events` plus `events.aggregate` as not currently implemented.
- `plugins/commons/cli/lib/events.ts` — canonical event-emission helper, synced into every plugin's `cli/lib/` via `scripts/sync-shared.ts`.
- griot agent family (`griot-judge`, `griot-rewriter`, `griot-operator`, `griot-rubric-author`, `griot-debate-summarizer`) is the only substrate self-evaluation pattern that exists today; targeted at *learnings*, not at evaluators or whiteboard engineers.

Skill offered to close interview (recommended), drill more on shift 3, or open shift 4. Operator selected: **"Close interview — move to whiteboards (Recommended)"**.

## Whiteboard contributions

Six engineer contributions across three shifts. Two engineers per shift (substrate-engineer in every panel; rotating second voice: skeptic for shift 1, design-systems for shift 2, testing-strategy for shift 3). Full attributed contributions in `whiteboards/research-shift-NN-*.md`; the load-bearing arguments are excerpted below.

### Shift 1 — verdict padding

**whiteboard-substrate-engineer** identified three fix layers (orchestrator / artifact / escape-hatch) with different blast-radius–leverage tradeoffs. Critical insight: per-tier `Panel:` overrides ALREADY EXIST as an affordance at `plugins/guild/docs/PANEL-COMPOSITION.md:284-299` — operators simply aren't reaching for them. Highest-leverage fix is teaching the evaluator base (`evaluator-base.md` or the equivalent personality-base section) to derive scope from the existing Contract section of the dense packet. Skeptical note: stripping no-findings sections wholesale loses the operator's confidence signal that the evaluator DID check a dimension; the cleanest design replaces padding with a short structured scope declaration the evaluator echoes back.

**whiteboard-skeptic** pressure-tested the diagnosis. Three load-bearing concerns: (1) verdict padding may be the feature — exhaustive cycling catches surprise concerns the unit contract didn't anticipate, and that's exactly the antagonist panel's job; (2) the diagnosis may be misplaced one layer up — contracts arriving under-specified at `/guild-validate` are what forces panels to cycle everything; the missing feature might be contract-quality scaffolding, not evaluator narrowing; (3) lock-in risk on a rubric-scope API — operators learn to set it aggressively to dodge attention tax, the "exhaustive panel" default quietly becomes the "narrow panel" default, and six months later "does our panel evaluate a11y on this unit?" has a non-obvious answer.

### Shift 2 — research as living fact-canon

**whiteboard-substrate-engineer** confirmed append-with-provenance as the right shape but flagged it must be enforced at the write layer, not by convention. Today `bin/loom research` is `copyFileSync` with a committed-state guard — overwrite-by-default with "don't do that." An `--amend` flag inverts this: read existing, append delimited block with structured provenance frontmatter (project slug + phase + amending session id + timestamp), write concatenation, commit. Cross-PR concurrent amendments become git-mergeable by construction — same shape as `manifest.toml`'s `[[events]]`. Soft schema becomes mandatory once headings are citation targets. Pushed back on the "PLAN.md embeds corrections" alternative: the bidirectional flow's payoff is cross-project fact reuse, not in-project; half-measures get substrate weight without payoff.

**whiteboard-design-systems** raised three vocabulary-and-shape concerns: (1) current `/loom-research` heading vocabulary (`## Whiteboard contributions`, `## Shift N`) leaks the interview process into what's about to become a citation API — should be promoted to semantic-fact headings (this dossier follows that advice); (2) don't build a flag-bloat verb like `loom research --append --from-phase=N --citing-evidence=...` — compose small primitives (`loom research append --section=<heading> --fact-file=<path> --citing=<source>`); (3) `loom revise-research` is the wrong vocabulary shape — `loom research amend` (noun-then-subverb matching `retro write`, `project read`) cohesions with the existing CLI family. High-low abstraction parallelism for amendments: high is `/loom-research --mode=amend` (full interview from existing canon), low is `loom research append` (single grounded fact, citation required), share one invariant (every fact has a source). Avoid a middle abstraction.

### Shift 3 — substrate self-observation and self-evaluation

**whiteboard-substrate-engineer** sequenced three distinct missing features by cost. (1) Convention-drift detection generalizing `scripts/sync-shared.ts --check` from file-mirror invariants to behavioral invariants is the smallest substrate change with highest leverage — one afternoon. (2) Cross-project aggregation as `loom events aggregate --cross-project` (NOT `loom stats` — `stats` becomes a junk drawer because there are no other observability artifacts yet). No cache to start with; cache only if cardinality forces it, and then as a derived artifact (regenerable from `--rebuild`), not a source of truth. (3) Self-evaluation suites are asymmetric to griot: griot scores prose against an open rubric, but evaluators need fixture-driven regression suites (`(input, expected_flags)` pairs scored mechanically). That's a different substrate family — `benchmark-*`, not `griot-*` generalization. Sequencing: ship (1), let metrics from (2) tell us if (3) is needed before writing any (3) code.

**whiteboard-testing-strategy** named three tiers of evaluator failure: rubric-body coherence (unit-shaped, cheapest); flag accuracy on a corpus (integration-shaped, expensive); panel verdict stability (end-to-end, slowest, most fragile). Tier-three-first is the common trap. Corpus shape: pure fixtures rot silently as evaluator surfaces evolve; pure factories drift because synthetic diffs miss real bugs. The hybrid that fits: factories for negative space (synthetic clean inputs that should produce zero findings — stable because "clean" is stable) plus fixtures for positive space (small curated corpus of real-world diffs that historically tripped the evaluator). Load-bearing question isn't "did this evaluator catch every bug" (coverage metric, gameable) but **"is this evaluator still doing work at all?"** — two cheap metrics from existing events answer it: spawn-to-finding rate, non-applicability rate. Generalize `sync-shared.ts --check` to rubric-body coherence FIRST; benchmark suite is a second move, not a first move.

## Resolved tensions

A few places where engineer contributions disagreed with the operator's interview framing, and how the synthesis resolved them:

- **Operator's framing**: "rubric scope at panel invocation time" (a dense-packet section or a contract-derived scope). **Skeptic's framing**: under-specified contracts are the upstream cause; contract-quality scaffolding is the better fix. **Synthesis**: try the upstream fix first; only reach for evaluator-layer narrowing if operators still report the tax with sharp contracts. Empirical test isn't designed yet.

- **Operator's framing**: extend griot to evaluators. **Substrate-engineer's framing**: griot's `judge` scores prose against a rubric; an evaluator's regression check needs a fixture corpus scored mechanically. That's a different shape (`benchmark-*`), not a griot generalization. **Synthesis**: `benchmark-*` family, sibling to `griot-*`, ships only after observation metrics prove a specific evaluator is regressing.

- **Operator's framing**: `loom stats --since=7d` as the cross-project rollup verb. **Substrate-engineer's framing**: existing verb family is noun-verb; cross-project aggregation is events-shaped; `loom events aggregate` cohesions, `loom stats` becomes a junk drawer. **Synthesis**: `loom events aggregate --cross-project`. The `loom report` / `loom observe` namespace stays reserved for when a real cross-noun aggregation surface exists.

- **Operator's framing**: `loom revise-research` as a sibling of `loom revise-plan`. **Design-systems's framing**: hyphenated compound verb breaks vocabulary; the cohesive shape is `loom research amend`. **Synthesis**: refactor `loom revise-research` proposal to `loom research amend`; the `loom research` noun opens a natural verb family (`init`, `amend`, `append`, `show`).
