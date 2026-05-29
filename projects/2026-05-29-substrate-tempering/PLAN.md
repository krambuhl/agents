# PLAN — substrate-tempering

**Project**: `2026-05-29-substrate-tempering`
**Topic**: ship the four follow-on work clusters surfaced by the closed `agent-system-improvements` project, in sequence, as one stacked program — loom CLI papercuts, convention-drift 2.1, evaluator observability, and RESEARCH as fact-canon.
**Loop**: `/ev-loop-interactive` per phase
**Cadence**: stacked via `gt`, sequential 1 → 5; phases are cluster-grained, so a single phase may produce multiple PRs (granularity resolved at unit-contract time)

## Context

This plan picks up directly where `2026-05-28-agent-system-improvements` left off. The research foundation is the per-cluster digest at `projects/2026-05-29-substrate-tempering/RESEARCH.md`, which re-organizes that project's archived `RESEARCH.md` + project retro around the four clusters below; every phase cites it.

The prior project shipped Phase 1 (a doc nudge) and Phase 2 (the `check-conventions.ts` drift detector), but **closed its Phase 3** (cross-project event aggregation) rather than ship plumbing whose payoff was gated on evaluator events that did not exist. That closure, plus five CLI gaps that surfaced during execution and a deferred "2.1" convention follow-up, is the raw material here.

The unifying theme is **substrate hardening**: making the substrate sturdier and more self-aware by running it on itself and fixing what that surfaced. The clusters are heterogeneous (CLI ergonomics, convention enforcement, observability, knowledge-canon) but share one reason to change together — they are the punch-list a real project produced about its own tooling.

The ordering is deliberate (RESEARCH.md § Sequencing): sharpen the saw (A) before the long job, close the open loop (C) while fresh, then build the self-observation arc (B) on a smoother substrate, and finish with the most independent, design-heavy thread (D). One non-obvious dependency drives Phase 1's internal order: manifest phase-backfill *requires* the `parse-plan` convention fix, because backfilling means parsing the PLAN.

Plan-birth surfaced a second sharpening: an archived `2026-05-28-substrate-followups` project already swept a *disjoint* set of CLI papercuts (`loom doctor` exit codes, `loom phase add`, `loom phase update` PR-field events). Its retro named the exact follow-up this plan's manifest-backfill gap covers — "wire `loom plan` to call `phase add` internally." (Note, 2026-05-29: `loom phase add` already exists in source — an earlier reading was misled by the cached `loom` binary, which lagged source and listed only `read`/`list`/`update`; the genuinely-missing piece was the `loom plan` backfill wiring, added in Phase 1. See Phase 1.) This program is effectively that project's round 2; the slug is kept distinct from its substrate-* siblings on purpose.

## Scope

### In

- **Phase 1 — Loom CLI papercut sweep.** Close the genuinely-remaining execution-surfaced gaps: `parse-plan` heading-vocabulary reconciliation and manifest phase-backfill at `loom plan`, plus Graphite-sync verification. The originally-listed `loom checkin write` update path and `plan-*` event emission are closed by prior decision (ADR-0002; `plan-*` already shipped) — see Phase 1.
- **Phase 2 — Convention-drift 2.1.** Two new `Convention` objects in `scripts/check-conventions.ts` covering `whiteboard-*.md` (bullet-pair coherence, sibling-reference resolution), plus triage of the existing contract-fit advisory finding. Advisory at MVP, matching the parent convention.
- **Phase 3 — Evaluator event emission.** Add `evaluator-spawned`, `evaluator-finding-emitted`, `evaluator-recused` to the `commons` event union (synced everywhere); emit them from the `guild-validate` panel flow against the active project's event log.
- **Phase 4 — Cross-project event aggregation.** A `loom events aggregate` subverb folding per-project event stores across `projects/` + `projects/archive/`. Surfaces spawn-to-finding and non-applicability metrics once Phase 3's events exist in the corpus. This is the prior project's closed Phase 3, built in the correct order.
- **Phase 5 — RESEARCH as fact-canon.** The `loom research init/amend/append/show` noun-with-subverbs family + append-with-provenance behavior (delimited blocks, structured provenance frontmatter, never editing prior blocks), with the high-low abstraction pair (`/loom-research --mode=amend` over `loom research append`).

### Out

- **Contract-quality scaffolding** (prior dossier item 6) — the upstream verdict-padding fix. A larger design + behavior change worth its own project.
- **`benchmark-*` family** (prior dossier item 7) — substrate self-evaluation suites. Still gated on a specific evaluator regressing in the wild; Phase 4 builds the metrics that would surface such a regression, so this becomes *reachable to decide* after Phase 4, but is not in this project.
- **Evaluator-specific aggregation UI / dashboards.** Phase 4 ships the verb + raw metrics; any presentation layer is out.

### Deferred

- **Additional conventions beyond the two whiteboard checks** (Phase 2) — frontmatter-key coherence, events-import-path enforcement. The framework supports them additively; this project ships exactly two.
- **A `loom events aggregate --rebuild` derived cache** (Phase 4) — only built if/when cardinality forces it; cache-free at MVP per the prior dossier.
- **A `loom research` middle "lightweight interview" mode** (Phase 5) — explicitly a trap to avoid; only the high (`--mode=amend`) and low (`append`) abstractions ship.
- **Backfilling `plan-*` events for the pre-commit orchestration steps** (Phase 1) — only the commit-time lifecycle event is in scope; pre-commit events have no project to write to (see Open questions).

## Phases

### Phase 1 — Loom CLI papercut sweep

**Revision (2026-05-29, pre-execution)**: a substrate reconciliation at phase start (whiteboard + ADR review) found this phase planned against a stale picture of the substrate. The sibling `2026-05-28` projects (`loom-adr`, `agent-system-improvements`) landed work the archived-research foundation (Decision #4) could not see. Two of the five original sub-units are closed by prior decision and one had a missing mechanism; the phase is re-scoped below. Sub-unit letters (a–e) are preserved for traceability.

**Deliverable**: the genuinely-remaining gaps from RESEARCH.md § Cluster A. Live sub-units, internal order constrained:
- **(a) `parse-plan` heading reconciliation** — `parse-plan` accepts the project PLAN heading vocabulary (`**Deliverable**` / `**Verification**`) so it stops cosmetically flagging `plan-phase-missing-goal` / `plan-phase-missing-exit` (10 such diagnostics fire on this very PLAN). Accept both vocabularies rather than swap, so existing PLANs keep parsing. `plugins/loom/cli/lib/plan.ts`.
- **(b) manifest phase-backfill** — `loom plan` backfills PLAN.md phases into the manifest so `[[phases]]` matches the PLAN; depends on (a) for the parse. This project exhibited the gap (manifest carried one placeholder phase; the PLAN has five). The `loom phase add` verb already exists in source (create-once, tested) — an earlier reading was misled by the cached `loom` binary that lagged source — so the genuinely-missing piece was the **wiring**, not the verb. Resolved by a `backfillPhases` lib reconcile (upsert by number, preserving status/branch on existing entries) called from `loom plan`'s adopt path, plus a one-off repair of this project's own manifest (which predated the wiring). `plugins/loom/cli/verbs/loom/plan.ts`, `plugins/loom/cli/lib/manifest-toml.ts`.
- **(e) Graphite-sync** — verify `gt submit --stack` works in the repo and record the runbook line. `gt` 1.7.5 is installed and the repo is gt-tracked, so this is a verify-and-document chore, done first, not a PR. If `gt submit --stack` is unusable, document the `gh`-PR fallback; non-blocking.

**Closed by prior decision (no work in this phase)**:
- **(c) `loom checkin write` update path — closed by ADR-0002.** `0002-loom-checkin-write-requires-full-schema` (2026-05-28) already adjudicated the exact fork this plan deferred, choosing full-schema-at-close in the skill body over a `--update` flag: conversation already supplies intermediate persistence, and an update path would invert the checkin's single-snapshot contract. No CLI change. Optional residual, tracked separately: confirm the `/ev-loop-interactive` Negotiate step reflects full-schema-at-close rather than the older "Contract section only" language.
- **(d) `plan-*` lifecycle event — closed, already shipped.** `plan-completed` (`{slug, plan_path, interview_path}`) and the full `plan-*` / `plan-revise-*` family already exist in `plugins/commons/cli/lib/types.ts`; `/loom-plan` emits `plan-completed` after commit. The original framing — emit from the `loom plan` *verb* — would reverse the documented decision that CLI verbs stay event-emission-free and the skills emit (`types.ts` Plan-events comment). No work. (Why this project's own log lacks `plan-completed` — the `[loom] capture stray research-completed event` commit hints at emission flakiness — is a separate, narrower question; file it if it recurs.)

**Verification**:
- `parse-plan` on this project's PLAN.md produces zero `plan-phase-missing-goal` / `plan-phase-missing-exit` diagnostics; unit test covering both heading vocabularies.
- `loom plan` against a fixture writes a manifest whose `[[phases]]` matches the PLAN.md phases; round-trip test. After backfill, this project's manifest reflects all five phases.
- `gt submit --stack` works in the repo, or the `gh` fallback is documented.
- `npm test` green; `node scripts/sync-shared.ts --check` green if `commons/` was touched.

**PR**: one stacked branch group on `main`, prefix `ev-agent.substrate-tempering.papercut-sweep`. Expected ~2 PRs (parser + backfill may pair, sharing `lib/plan.ts`; the graphite chore is verify-and-document, likely no PR). Granularity finalized at unit contract.

**Risks**:
- **Parser change breaks existing `parse-plan` consumers.** Mitigation: accept both vocabularies rather than swap; assert both shapes with tests before touching the backfill.
- **Backfill mechanism widens or couples the surface.** A new `loom phase add` verb widens the CLI surface; writing phases directly in the plan flow couples plan to the phase-model lib. Unit contract decides, guided by the verbs-do-state-writes / skills-do-events split (manifest mutation is legitimately verb territory; the emission-free rule governs events, not state).
- **Backfill idempotency on re-run.** `loom plan` may run against a manifest that already has phases. Mitigation: reconcile to the PLAN's phase set idempotently — do not duplicate entries or clobber existing phase status.

### Phase 2 — Convention-drift 2.1

**Deliverable**: two new `Convention` objects added to `scripts/check-conventions.ts` per its documented extension pattern (`:19-39`), both scoped to `whiteboard-*.md`: (1) **bullet-pair coherence** — every "what you lean toward" bullet has a paired "what you don't do" boundary; (2) **sibling-reference resolution** — sibling-engineer references resolve to actual files in the registered roster. Plus a resolution of the existing contract-fit advisory finding (refine description, refine heuristic, or document-as-accepted — unit-contract decides). Advisory at MVP, exit code 0 on findings, matching `rubric-body-coherence`.

**Verification**:
- Each new convention has a positive test (clean `whiteboard-*.md` → zero findings) and a negative test (seeded drift → expected finding) in `scripts/check-conventions.test.ts`.
- `node scripts/check-conventions.ts` runs clean on the live corpus (the contract-fit advisory either resolves to zero or is documented as accepted noise).
- CI runs the script (advisory).
- `npm test` green.

**PR**: one stacked branch on Phase 1, prefix `ev-agent.substrate-tempering.convention-drift-2-1`. Plausibly a single PR (the two conventions + triage are cohesive and small).

**Risks**:
- **Bullet-pair / sibling-reference heuristics are pattern-matching against freeform prose** — false-positive prone, same class as the parent convention. Mitigation: advisory at MVP; track false-positive rate; escalate to blocking only after stabilization.
- **Sibling-reference resolution needs the roster as ground truth.** Mitigation: derive the roster from the agents directory listing rather than a hand-maintained list, so it cannot drift.

### Phase 3 — Evaluator event emission

**Deliverable**: three new event types — `evaluator-spawned`, `evaluator-finding-emitted`, `evaluator-recused` — added as `EventBase<...>` variants in `plugins/commons/cli/lib/types.ts` (then `node scripts/sync-shared.ts` propagates the lib to every consumer plugin), emitted from the `guild-validate` panel flow (`plugins/guild/skills/guild-validate/SKILL.md`) via `appendEvent` against the active project's event log. Detail shapes (evaluator name, unit id, severity, recusal reason) resolved at unit contract.

**Verification**:
- Unit test: emitting each event appends a well-formed line to a fixture event store; `EventName` widens to include the three.
- A real `/guild-validate` run during a `/ev-loop-interactive` phase produces the events in the project log; assertable via `loom events read --event=evaluator-spawned`.
- `node scripts/sync-shared.ts --check` green (the synced `types.ts` is consistent across plugins).
- `npm test` green.

**PR**: one stacked branch on Phase 2, prefix `ev-agent.substrate-tempering.evaluator-events`. Likely 1-2 PRs (the type addition + sync is one unit; the guild-validate emission is another).

**Risks**:
- **Emission point ownership**: `guild-validate` may not hold the project path directly; it is composed by `/ev-loop-*`, which does. Mitigation: the unit contract decides whether the event is emitted in the skill or threaded from the caller; either way the path is reachable.
- **Sync drift**: editing `commons/types.ts` without running `sync-shared.ts` fails CI. Mitigation: the editing-workflow step is in the contract; CI `--check` is the backstop.

### Phase 4 — Cross-project event aggregation

**Deliverable**: a `loom events aggregate` subverb registered alongside `read` + `latest` in the dispatch map (`plugins/loom/cli/verbs/loom/events.ts:114`), folding per-project event stores across `projects/*` and `projects/archive/*`. Flags mirror existing `loom events` shape (`--since`, `--event`, `--limit`, `--pretty`). Output: per-`(project, event)` rows with counts + first/last timestamps. No cache; read complete lines, drop trailing partials. The two named metrics (spawn-to-finding rate, non-applicability rate) are derivable from the folded `evaluator-*` events emitted in Phase 3.

**Verification**:
- `loom events aggregate --since=30d --pretty` produces non-empty cross-project output listing ≥3 event types with non-zero counts.
- Spot-check: one row cross-references against the corresponding `loom events read <slug>` count.
- Unit test: synthetic fixture of 2 projects × 3 event types asserts the correct fold, including at least one `evaluator-*` event so the spawn-to-finding path is exercised.
- `npm test` green.

**PR**: one stacked branch on Phase 3, prefix `ev-agent.substrate-tempering.events-aggregate`. Likely a single PR.

**Risks**:
- **Hard dependency on Phase 3**: without `evaluator-*` events, the headline metrics fold to zero. Mitigation: ship generic aggregation that is useful on existing lifecycle events regardless; the evaluator metrics light up as Phase 3's events accrue. This is the explicit correction of the prior project's over-promise.
- **Cardinality** as `projects/` grows. Mitigation: cache-free at MVP (project count ~10); derived `--rebuild` cache only if forced, never a source of truth.
- **Partial-line reads** on concurrent appends. Mitigation: read complete lines, drop trailing partials (per the prior testing-strategy whiteboard).

### Phase 5 — RESEARCH as fact-canon

**Deliverable**: `loom research` becomes a noun-with-subverbs family — `init` (today's copy-in behavior), `amend`, `append`, `show` — modeled on the `loom events` dispatch pattern. `append` takes `--section=<heading> --fact-file=<path> --citing=<source>` and appends a delimited block with structured provenance frontmatter (slug + phase + session id + timestamp), never editing prior blocks. The high abstraction `/loom-research --mode=amend` (fresh interview from existing canon) is wired to call `append` under the hood. Provenance frontmatter is the strict, validated surface; prose stays freeform.

**Verification**:
- `loom research append` adds a provenance-stamped block to a committed RESEARCH.md without modifying any prior block; unit test asserts append-only.
- `loom research show` reads the dossier (and, if scoped, a single section); round-trip test.
- Two simulated concurrent appends produce a git-mergeable result (no overlapping edits); test or documented manual check.
- `loom research init` preserves today's behavior (back-compat); existing `research.test.ts` green.
- `npm test` green.

**PR**: one stacked branch on Phase 4, prefix `ev-agent.substrate-tempering.research-fact-canon`. Likely 2 PRs (the verb-family refactor + back-compat shim, then the append-with-provenance behavior).

**Risks**:
- **Verb-family refactor breaks existing `loom research` callers.** Mitigation: `init` retains today's exact behavior; `loom research <slug> --research-file=...` either keeps working or maps to `init` with a deprecation note. Back-compat test before behavior change.
- **Provenance schema is a forward commitment.** Mitigation: keep the schema minimal (the four frontmatter keys); the prose layer absorbs everything else; do not over-specify the section taxonomy in this project (Open question).
- **Scope creep into the middle "lightweight interview" mode.** Mitigation: explicitly out of scope; only high + low abstractions ship.

## Dependencies

- **Phase 1 internal**: `parse-plan` reconciliation (1a) blocks manifest backfill (1b) — same phase model in `lib/plan.ts`. Graphite-sync (1e) is a verify-and-document chore done first. Sub-units 1c and 1d are closed by prior decision (ADR-0002; `plan-*` events already shipped) — see Phase 1.
- **Phase 3 → Phase 4**: hard. Aggregation's headline metrics require the `evaluator-*` events; Phase 4 must follow Phase 3.
- **Phase 1 → Phase 3**: none. (Originally a soft link — Phase 1's `plan-*` work was to warm the event-union + `appendEvent` path Phase 3 extends. With 1d closed, Phase 1 no longer touches the event union; the path is already warm from the shipped `plan-*` / `research-*` families.)
- **Phases 2, 5**: independent of the others except for stack position. C is sequenced second for momentum, not coupling; D is last for design-heaviness, not coupling.
- **Cadence dependency**: until Graphite-sync (1e) lands, the stack submits via `gh` rather than `gt submit --stack`. Phase 1 unblocks the intended cadence for Phases 2-5.
- **External**: none. No npm dep changes, no marketplace-version bump. `commons/cli/lib/` edits (Phases 1d, 3) require `node scripts/sync-shared.ts` before commit (CI `--check` gate).

## Verification (project-level)

The project is "done" when:
1. All five phases have merged PRs.
2. `npm test` and `node scripts/sync-shared.ts --check` are green on `main`.
3. `node scripts/check-conventions.ts` runs clean (Phase 2's new conventions live; the contract-fit advisory is resolved or documented).
4. `loom events aggregate` produces cross-project output that includes `evaluator-*` events emitted by a real panel run (the end-to-end proof that Phases 3 + 4 compose).
5. `loom research append` demonstrably amends a committed dossier append-only.
6. A project retro names what the new observability (Phase 4 metrics) has surfaced so far — even if "baseline established, nothing surfaced yet."

The project does NOT block on:
- `benchmark-*` ever shipping (gated on Phase 4 metrics surfacing a real regression).
- Convention-drift escalating from advisory to blocking (gated on false-positive rate).
- The `loom research` section-taxonomy being finalized (Open question; the minimal provenance schema is enough to ship).

## Risks (project-level)

- **Program over-commitment.** Four heterogeneous clusters in one plan risks the drift the prior project's Phase 3 warned about. Mitigation: the phases are independently revertable and sequenced cheapest-first; the sequential `gt` stack means the project delivers value incrementally and can stop after any phase with a coherent partial result. B+D are explicitly the later, reassess-at-contract phases.
- **Phase 4 metrics may never surface a regression.** Mitigation: that is the healthy outcome; the metrics' value is also operator situational awareness, not only regression-detection. (Carried from the prior project.)
- **`commons/cli/lib/` edits forget the sync step.** Mitigation: the sync step is in every affected unit contract; CI `--check` is the hard backstop.
- **Heuristic conventions (Phase 2) generate noise before maturing.** Mitigation: advisory at MVP; track false-positive rate; escalate only after stabilization.

## Open questions (deferred to phase unit contracts)

- **Phase 1**: the manifest-backfill mechanism — add a `loom phase add` verb vs. write phases directly in the plan flow (unit-contract decides). (The `loom checkin write --update` and `plan-*` event-shape questions are resolved — see Phase 1 § Closed by prior decision.)
- **Phase 2**: the contract-fit advisory triage (refine description / refine heuristic / accept). Whether sibling-reference resolution derives the roster from the directory or a list.
- **Phase 3**: the three evaluator events' detail shapes; whether emission lives in `guild-validate` or the `/ev-loop-*` caller holding the project path.
- **Phase 4**: whether output includes a cross-project `total` row per event name.
- **Phase 5**: the section-heading taxonomy that survives cross-project use + amendment without re-numbering; whether `loom research init` is a rename-with-shim or an alias of today's `loom research`.

## Decisions

Resolved by the plan interview (see INTERVIEW.md for the walked tree):

1. **Scope = all four follow-on clusters, sequenced** (loom CLI papercuts, convention-drift 2.1, evaluator observability, RESEARCH fact-canon). Selected over picking a single cluster.
2. **Shape = one plan, ~5 cluster-grained phases.** Selected over one plan with ~10-12 PR-grained phases and over a roadmap-of-per-cluster-plans. Per-cluster PR granularity is resolved at unit-contract time (prior project's Decision 10 precedent).
3. **Ordering = A → C → B → D**, by risk-ladder + dependency (RESEARCH.md § Sequencing).
4. **Research foundation = self-authored per-cluster digest**, not a fresh `/loom-research` sub-agent — the foundation already exists and is research-grade; re-deriving it is ceremony.
5. **Project slug = `substrate-tempering`.**
6. **Loop strategy = `/ev-loop-interactive` for all five phases** — each is a discrete deliverable, not a bulk transform.
7. **PR cadence = stacked via `gt`, sequential**, with the Phase-1 Graphite-sync bootstrap unblocking the intended `gt submit --stack` cadence.
8. **Verification signals named per phase** (see Phases).
9. **Risks named per phase + project-level** (see Phases and Risks).
10. **Open questions enumerated, deferred to unit contracts, not blocked on** (see Open questions).

## Revision log

- 2026-05-29 — Re-scope Phase 1 to remaining work (parse-plan headings, manifest backfill, graphite verify); close 1c (ADR-0002) and 1d (plan-* already shipped) as resolved by prior decision after a pre-execution substrate reconciliation
