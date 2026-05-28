# Interview — substrate consolidation

The decision tree walked during planning. One decision per heading: the recommendation, the operator's answer, and the rationale.

## 1. Kill scope

**Recommendation**: Salt the earth — delete all six forks (jelly, jelly-guild, jelly-loom, jelly-run, linear-loom, ev-linear).
**Answer**: Salt the earth.
**Rationale**: linear-loom is ~57 TS files of working code and jelly-run ~18, so this deletes real implementation — but maintaining a parallel family is rent on a fork. ev-linear strictly depends on linear-loom and can't outlive it. Harvest first, then delete with no survivors.

## 2. State model direction

**Recommendation**: (open — the operator redirected from a secondary-harvest menu.)
**Answer**: Go all-in on `manifest.toml` — anything that is machine state lives in that one file, organized into feature sections. Motivated by disliking, in practice, PRs that were *just* machine files.
**Rationale**: At loom's scale (kilobytes of state, single operator), the textbook objections to folding an append-only log into a rewritten file (append integrity, concurrent writes) do not bite — append-only was always a CLI discipline, not a jsonl guarantee. The consolidation is the right call; the multi-file spread was the source of the machine-file churn.

## 3. State ↔ git relationship

**Recommendation**: Committed, riding inside the feature PR — state mutations fold into the same commit as the code; the loop never makes a state-only commit.
**Answer**: Committed, rides inside the feature PR.
**Rationale**: Keeps git as state history and cross-machine sync, while killing the machine-only PR. Derived consequence (asserted, unobjected): loom CLI verbs become working-tree writers; committing moves to the loop at the unit boundary, where one `git add` sweeps state and code into one commit. This is the actual fix for the orphan-event-on-a-different-clock papercut.

## 4. Agent collapse scope

**Recommendation**: Whiteboard-only collapse; leave evaluators baked (least-privilege + turn-budget safety).
**Answer**: Full collapse (both whiteboards and evaluators), solving the costs — and walk the capabilities one at a time.
**Rationale**: The operator chose the ambitious version that fully pays off the "name the same concept once" principle, accepting the machinery needed to preserve least-privilege and turn budget. The capability-by-capability walk (decisions 5–10) builds the canonical taxonomy.

## 5. Testing domain granularity

**Recommendation**: Split test-unit + test-integration (load-bearing — distinct tools, distinct rubrics).
**Answer**: Split.
**Rationale**: guild split them for real reasons (`npm test` vs `npm run test:e2e`; mock-boundary vs fixture-leakage catalogs). Since tool grants key off domain, merging would force one domain to carry both grants and a muddied rubric. Sets the precedent: a domain stays split when tools or rubric genuinely differ; it merges when the difference was only phase or personality.

## 6. contract-fit

**Recommendation**: Keep it special — one always-on baseline reviewer, the taxonomy's single exception.
**Answer**: Keep it special.
**Rationale**: contract-fit checks contract conformance, not domain knowledge — it applies to every unit. Distributing it across N domain reviewers would produce N redundant/conflicting contract verdicts. It is a panel-level baseline, not a per-domain lens; one authoritative verdict beats many.

## 7. design-systems

**Recommendation**: Decompose — it is a dispatch pattern (recipe), not a domain.
**Answer**: Decompose.
**Rationale**: token-vs-literal is the tokens domain, semantic-naming is naming, composition-over-config is composition + abstraction. A `design-systems` domain would re-duplicate three domains' knowledge — the exact sin being killed. The perspective is reconstructed by running those domains together at planner phase. Establishes recipes as the home for cross-cutting perspectives.

## 8. Domain extensibility

**Recommendation**: Core + project-local domains; substrate stays core, sketch-ideation goes local.
**Answer**: Core + project-local domains.
**Rationale**: substrate is cross-project knowledge for a substrate-builder (core); sketch-ideation is aart.camp-specific (project-local). Extensible domains are the off-rails escape hatch to the on-rails core — the operator's own high/low-abstraction philosophy applied to the agent system. Core never bloats to accommodate one project.

## 9. Composition timing (the tool-grant mechanism)

**Recommendation**: Build-time codegen — author the axes, `guild generate` compiles scoped agent files.
**Answer**: Build-time codegen.
**Rationale**: The Agent tool fixes a subagent's tools from frontmatter, so a domain-agnostic personality can't carry domain-scoped grants at runtime. Generating files at build time gives each combination correct least-privilege frontmatter AND inlined content — solving both costs (scoping and turn budget) with one mechanism. The runtime looks like today's baked agents; the DRY win is purely at authoring time. jelly-guild's runtime composition (read mode files at dispatch) would instead need two mitigations (a hook for scoping, raised maxTurns for the reads) and still carry broad grants.

## 10. Revision record location

**Recommendation**: Split — machine record in `manifest.toml` `[[revisions]]`, human rationale in PLAN.md.
**Answer**: Split.
**Rationale**: A revision has two parts. The record (timestamp, target, seq) is machine state → manifest. The rationale (why the plan changed) is documentation → PLAN.md, where it travels with the plan. Complementary, not duplicated. Respects both the all-state-in-toml rule and the history-travels-with-the-artifact property.

## 11. JSON-schema output contracts

**Recommendation**: Deferred / out of scope.
**Answer**: Deferred (asserted, unobjected).
**Rationale**: The consumer that justified them (ev-linear) is being deleted, and `manifest.toml` already carries `schema_version`. Speculatively building versioned output contracts now is over-engineering; revisit only if ev's parsing of loom read-verbs proves fragile.

## 12. Delete timing

**Recommendation**: Harvest-first, delete last.
**Answer**: Harvest-first, delete last.
**Rationale**: Nothing imports the forks, so the deletion is independent — but jelly-guild's domain prose and jelly-loom's TOML parser are real source material to adapt, not reinvent. Building while the source still exists, then deleting as the close-the-loop PR, keeps the reference available.

## 13. Track order

**Recommendation**: Sequential, loom-state first (M1 → M2 → M3 → M4).
**Answer**: Sequential, loom-state first.
**Rationale**: M1 and M2 are independent, but review is operator-paired one-at-a-time regardless, so parallelism would only add review-surface context-switching. loom-state goes first because it is the foundational change everything commits into and it unblocks M3.

## 14. Slug

**Recommendation**: `substrate-consolidation`.
**Answer**: `substrate-consolidation`.
**Rationale**: The operator's working title was "collapse-agents", but the agent collapse is only M2; the project also rewrites loom's entire state model and deletes two plugin families. The chosen slug names the meaning of the whole effort rather than one feature.
