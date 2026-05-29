# INTERVIEW — substrate-observability foundation

The walked decision tree for `/loom-plan agent-system-improvements`. Each section records one resolved question: the recommendation given, the answer chosen, and the rationale.

## Decision 1 — Plan scope: which subset of RESEARCH.md's 7 next steps?

**Recommendation**: Group A (items 1+2+5 — substrate-observability foundation). Three-phase project: doc nudge for existing `Panel:` override; convention-drift detector extending `sync-shared.ts --check`; `loom events aggregate --cross-project`.

**Alternatives offered**:
- B. RESEARCH-as-fact-canon foundation (items 3+4): append-vs-overwrite + verb refactor
- C. Single focused project — convention-drift only (item 2)
- D. Single focused project — verdict-padding upstream fix (item 6 + 1 as prereq)

**Answer**: A.

**Rationale**: A's three items are all read-only substrate self-awareness; they together produce signal the substrate doesn't have today. Per the shift 3 substrate-engineer whiteboard, observation must precede evaluation — these three items are exactly the observation precondition that would tell us whether item 7 (`benchmark-*`) ever earns its rent. Group A is the most leveraged target.

## Decision 2 — Phase shape: independent phases or one staged feature?

**Recommendation**: Three independent phases, one per item, each a standalone PR. Sequential 1→2→3 honors the dossier's increasing-cost sequencing argument.

**Alternatives offered**:
- Staged setup/build/polish (more PRs-per-phase, more unified narrative)
- Hybrid: Phase 1 standalone, Phase 2+5 bundled

**Answer**: Three independent phases.

**Rationale**: The three items are independent additions (not a migration), so setup/migrate/cleanup doesn't map. Bundling Phase 2+3 risks one flaky piece blocking the other from landing. Sequential ordering matches the dossier's increasing-cost argument: each phase's learnings inform the next. Stacked via `gt`, sequential, one PR per phase.

## Decision 3 — Phase 2 MVP scope: how many conventions does the script enforce?

**Recommendation**: One check — rubric-body coherence — plus an extension pattern. The testing-strategy whiteboard named rubric-body coherence as "tier one, load-bearing" — the most common silent regression class.

**Alternatives offered**:
- Two checks (rubric-body + sibling-reference resolution)
- Starter set of 3-4 checks (rubric-body + sibling-refs + frontmatter-keys + events-import-paths)

**Answer**: One check + extension pattern.

**Rationale**: Shipping with one well-shaped check is more honest than shipping with several where some don't earn their keep. The script's `Convention` interface makes adding future conventions additive (one new exported `Convention` object per follow-up PR). If false-positive rate on the one check is high, we fix it before extending; if low, we extend. Either way the framework matures incrementally.

## Decision 4 — Phase 3 MVP scope: generic aggregation only, or extend events first?

**Recommendation** (revised mid-interview): Generic aggregation over EXISTING event types only. Initial recommendation in framing was "ship spawn-to-finding + non-applicability metrics" but mid-interview verification of `plugins/loom/cli/fixtures/events-all-types.jsonl` revealed those event types don't exist today (existing events are project-lifecycle: `project-initialized`, `phase-started`, `checkin-created`, `retro-written`, `pr-opened`, ...). Spawn-to-finding requires `evaluator-spawned` + `evaluator-finding-emitted` event emission, which is its own substrate change.

**Alternatives offered**:
- Extend events + aggregate (add evaluator event emission + aggregator together)
- Generic aggregation + flag evaluator-events as Phase 4

**Answer**: Generic aggregation only. Evaluator events deferred entirely (not even named as Phase 4).

**Rationale**: Honest about the data we have. Phase 3 ships value against existing events; evaluator-event emission is its own project that can be planned later if/when the operator wants the evaluator-specific metrics. Keeping Phase 3 narrow keeps the project shippable in ~1 week.

## Decision 5 — Phase 1 doc location: PANEL-COMPOSITION.md or standalone learning?

**Recommendation**: Extend `plugins/guild/docs/PANEL-COMPOSITION.md` with a new `## When to opt out: per-unit Panel: override` section. Audience: AI agents primarily, operators secondarily.

**Answer**: Locked by default (no AskUserQuestion).

**Rationale**: PANEL-COMPOSITION.md is the canonical doc for panel composition (lines 284-299 already document the override mechanically). Adding a "when to use" section to the same file means an AI agent reading PANEL-COMPOSITION.md at session start gets both the affordance AND the heuristic in one place. A separate learning would fragment the knowledge; the captured learning (also written in Phase 1) serves a different purpose — demonstrating usage in a concrete project.

## Decision 6 — Loop strategy per phase

**Recommendation**: `/ev-loop-interactive` for all three phases.

**Answer**: Locked by default.

**Rationale**: Each phase is a discrete deliverable, not a bulk transform. `/ev-loop-confidence` is for tiered transform / find-replace work across many files; that doesn't apply to any of these phases. Phase 2 touches many agent files but only to *check* them, not to transform them — the script is the deliverable, not the touched files.

## Decision 7 — PR cadence

**Recommendation**: Stacked via `gt`, sequential, one PR per phase.

**Answer**: Locked by default.

**Rationale**: Standard for this repo per `~/.claude/CLAUDE.md`'s "Default to Graphite (`gt`) for the branch and PR workflow." Three-phase decomposition produces naturally stacked branches; each phase reviewable in one sitting; any single PR revertable without unwinding the rest.

## Decision 8 — Verification signals per phase

**Recommendation**:
- Phase 1: section exists + learning captured demonstrating usage
- Phase 2: script runs in CI, deliberately seeded mismatch flags red, removal returns green
- Phase 3: `loom events aggregate --since=7d` produces non-empty cross-project output with manual spot-check + unit test on synthetic fixture

**Answer**: Locked by default.

**Rationale**: Each phase has a concrete "ship it" signal that isn't just "the PR merged." Phase 1's hardest verification is "did anyone actually read the new section" — the captured learning is a proxy. Phase 2 and 3 have mechanical signals (CI green, spot-check matches per-project data).

## Decision 9 — Risks named explicitly per phase

**Recommendation**:
- Phase 2: false-positive parsing → start advisory, escalate after corpus stabilizes
- Phase 3: cardinality/cache → cache-free at MVP, derived cache only if forced
- Phase 3: partial-line reads on concurrent appends → read complete lines, drop trailing partials

**Answer**: Locked by default.

**Rationale**: All three risks named directly in the shift 3 whiteboard contributions (substrate-engineer for cardinality + cache, testing-strategy for partial-line reads, both for advisory-vs-blocking escalation). The PLAN.md surfaces them so phase contracts can carry the mitigations without re-deriving them.

## Decision 10 — Open questions deferred to phase contracts

**Recommendation**:
- Whether convention-drift covers `whiteboard-*` in Phase 2 MVP or as 2.1 follow-up
- Whether `scripts/check-conventions.ts` is standalone or extends `scripts/sync-shared.ts`
- Whether Phase 1's learning is captured via `bin/griot capture` or written manually
- Whether `loom events aggregate` output surfaces a `total` row across projects

**Answer**: Locked by default.

**Rationale**: Each of these is a phase-contract-level decision, not a project-level one. Forcing them into PLAN.md would either pre-commit to an answer without enough information, or over-specify the contract. The unit contracts at phase start are the right place to resolve them — by which point the implementer has more context.
