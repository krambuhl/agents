# RESEARCH — substrate-tempering foundation

**Topic.** Foundation digest for the `substrate-tempering` program: the four follow-on work clusters surfaced by the closed `2026-05-28-agent-system-improvements` project, re-organized around the clusters *this* plan sequences (rather than the prior project's three research lenses).

**Provenance.** This is not a fresh research interview. It is a synthesis of three sources, verified against current code:
1. The prior project's research dossier — `projects/archive/2026-05-28-agent-system-improvements/RESEARCH.md` (the original 7-item next-step list; clusters B and D are drawn from it).
2. The prior project's project-type retro — `projects/archive/2026-05-28-agent-system-improvements/retros/project.json` (the execution-surfaced gaps; clusters A and C are drawn from it).
3. Direct verification of the cited code hooks on 2026-05-28 (see `RESEARCH-NOTES.md` for the per-claim provenance map).

Re-running `/loom-research` from scratch was deliberately declined: the foundation already exists and is research-grade, and the prior project's own retro flagged that the substrate-self-observation story over-promised once already. The cheaper, honest move is to digest what we have and let each phase's unit contract pull depth from the cited anchors.

**Scope.** Four clusters, sequenced A → C → B → D:
- **A — loom CLI papercuts** (retro follow-up, five gaps).
- **C — convention-drift 2.1** (retro follow-up, the deferred whiteboard-* checks).
- **B — evaluator observability** (dossier items 5 + 7's prerequisite; the revived, closed Phase 3).
- **D — RESEARCH as fact-canon** (dossier items 3 + 4).

Out of scope (carried forward): contract-quality scaffolding (dossier item 6) and the `benchmark-*` family (dossier item 7) — the latter still gated, but cluster B builds the gate.

---

## Constraints — loom CLI papercuts degrade every substrate project (Cluster A)

**Observation.** Five small substrate gaps surfaced *during* the prior project's execution that were invisible from outside it. Each is individually minor; together they tax every future substrate project. They are not in the prior dossier — they are execution scar tissue, recorded only in the retro and the PR bodies (#139, #140).

**The five gaps** (retro `follow-up` finding, the "five substrate gaps" item):
1. **Manifest does not backfill PLAN.md phases at `loom plan`.** The Phase 2 manifest entry had to be added manually before `loom phase update` worked.
2. **`/loom-plan` emits no `plan-*` events.** The orchestration trail has no session boundary marker. (This skill run hit exactly this — there was nowhere to emit `plan-started`.)
3. **`parse-plan` expects `**Goal**` / `**Exit**` but project PLANs use `**Deliverable**` / `**Verification**`,** so `parse-plan` cosmetically flags `plan-phase-missing-goal` on every real PLAN.
4. **`loom checkin write` is create-once with no update verb,** which conflicts with the `/ev-loop-interactive` skill body's "write contract-only first, fill in after" pattern (Phase 1 worked around it with a manual `manifest.toml` edit).
5. **Graphite sync is not enabled for this repo,** blocking `gt submit --stack`.

**Substrate hooks (verified 2026-05-28).**
- `plugins/loom/cli/verbs/loom/plan.ts:171-185` — `loom plan` auto-adopts loom and calls `synthesizeManifestInit(slug, todayString(ctx))`; the manifest is seeded from slug + date only, with no PLAN.md phase parse. (Gap 1.)
- `plugins/loom/cli/lib/plan.ts` — the `parse-plan` parser + the `plan-phase-missing-goal` diagnostic live here. (Gap 3.)
- `plugins/loom/cli/verbs/loom/checkin.ts:198-204` — `appendCheckin` throws `checkin-already-exists` on a duplicate `(branch, number)`; the create-once guarantee is enforced at the store layer. (Gap 4.)
- `plugins/commons/cli/lib/types.ts:59-96` + `:405` — the `Event` union is a set of discrete `EventBase<'name', detail>` types; `EventName = Event['event']`. Adding `plan-*` events is additive here. (Gap 2.)
- `plugins/commons/cli/lib/events.ts:54` — `appendEvent(path, event)` requires a project path; pre-commit orchestration events have no home until the project exists. (Gap 2 nuance.)

**Load-bearing finding (the intra-cluster dependency).** Gap 1 (manifest backfill) *depends on* gap 3 (parse-plan convention): backfilling phases into the manifest means parsing the PLAN.md, and the parser is exactly what is mismatched on `Goal/Exit` vs `Deliverable/Verification`. Both touch the phase model in `plugins/loom/cli/lib/plan.ts`. The parser-convention fix must land before — or in the same change as — the backfill. This is the sequencing constraint inside Phase 1.

**Gap-2 nuance (where `plan-*` events can live).** `appendEvent` needs a project path, which does not exist until `loom plan` commits. So pre-commit skill-orchestration events (`plan-panel-spawned`, etc.) genuinely cannot persist; the reachable fix is to emit a plan-lifecycle event at `loom plan` commit time (the project now exists). The unit contract resolves the exact event name + detail shape.

---

## Constraints — convention-drift coverage stops at evaluators (Cluster C)

**Observation.** The convention-drift detector shipped in the prior project's Phase 2 (`scripts/check-conventions.ts`) registers exactly one convention — `rubric-body-coherence` — and it applies only to `evaluator-*.md`. The whiteboard-* checks named in the original design were explicitly deferred to a "2.1" follow-up. The framework was built to make that follow-up additive.

**Deferred checks** (retro `follow-up` finding, the "whiteboard-* convention checks" item):
- **Bullet-pair coherence** — every "what you lean toward" bullet in a `whiteboard-*.md` body has a paired "what you don't do" boundary.
- **Sibling-engineer reference resolution** — sibling references in a `whiteboard-*.md` resolve to actual sibling files in the registered roster.

**Plus a triage** (retro `follow-up` finding, the "1 advisory finding" item): `check-conventions.ts` currently surfaces one advisory finding on `plugins/guild/agents/retained/evaluator-contract-fit.md` — a `rubric-body-coherence` heuristic edge case where the description's "whether a unit of work meets its agreed contract" phrasing is not literally present in the body. Operator triage: refine the description, refine the heuristic, or accept as substrate noise.

**Substrate hooks (verified 2026-05-28).**
- `scripts/check-conventions.ts:70-74` — the `Convention` interface (`name`, `appliesTo(file)`, `check(file, content)`).
- `scripts/check-conventions.ts:80-92` — `runConventions`, the pure files × conventions fold.
- `scripts/check-conventions.ts:19-39` — the documented extension pattern: add a `Convention` object, add it to the `CONVENTIONS` array, add a positive + negative test in `check-conventions.test.ts`. "One file, one array."
- `scripts/check-conventions.ts:43-48` — today's only convention (`rubric-body-coherence`) is scoped to `evaluator-*.md`; the whiteboard-* surface is unbuilt.

**Note on sizing.** This cluster is the smallest — two additive `Convention` objects + one triage. It is plausibly a single PR. It is included as a phase here for sequencing and retro cohesion; if execution shows it is genuinely one PR, that is a fine phase, not a failure.

---

## Missing capability — the substrate emits no evaluator events (Cluster B.1)

**Observation.** The prior project's Phase 3 (cross-project aggregation) was *closed, not shipped*, because its load-bearing metrics (spawn-to-finding rate, non-applicability rate) require evaluator events that do not exist. `guild-validate` runs the antagonist panel but emits nothing to any event log. This is the prerequisite that the prior project named as "its own focused project."

**The three events** (prior dossier § "the substrate has no self-observation," and retro `improvement` + `follow-up` findings):
- `evaluator-spawned` — an evaluator was dispatched against a unit.
- `evaluator-finding-emitted` — an evaluator produced a finding (with severity).
- `evaluator-recused` — an evaluator declined as out-of-domain.

**Substrate hooks (verified 2026-05-28).**
- `plugins/commons/cli/lib/types.ts:59-96` — the precedent `EventBase<'name', detail>` shapes (e.g., `PhaseStartedEvent` carries `{ phase, name }`). New evaluator events slot in as siblings; `EventName` (`:405`) widens automatically.
- `plugins/commons/cli/lib/events.ts:54` — `appendEvent(path, event)` is the append-only emission helper, synced into every plugin's `cli/lib/`.
- `plugins/guild/skills/guild-validate/SKILL.md` — the panel coordinator; emits no events today. It is composed by `/ev-loop-*`, which carries the active project context (so the emission target path is reachable).

**Why metrics, not a suite.** The prior dossier's sequencing argument holds: two metrics over existing event data (spawn-to-finding, non-applicability) catch most evaluator regressions without a corpus suite. `benchmark-*` (dossier item 7) is still gated on these metrics surfacing a real regression in the wild.

---

## Missing capability — no cross-project observability (Cluster B.2, the revived Phase 3)

**Observation.** `loom events` reads a single project's log; there is no fold across projects. This is the prior project's closed Phase 3 — but built *after* cluster B.1, so it has real signal to aggregate rather than being plumbing with no water.

**Substrate hooks (verified 2026-05-28).**
- `plugins/loom/cli/verbs/loom/events.ts:114` — the subverb dispatch map currently registers `read` + `latest`; `aggregate` is absent. The new verb is a sibling, matching the noun-with-subverbs pattern (prior dossier's naming guidance: `loom events aggregate`, not a sibling `loom stats` junk-drawer noun).
- `plugins/loom/cli/lib/events.ts` — `readEvents` reproduces the legacy filter semantics; the aggregator folds over per-project event stores.

**Design constraints (prior dossier § self-observation, point 2).** No cache to start; read completed lines, drop trailing partials; if cardinality forces a cache later, the key is `(project, last-event-timestamp)` and the cache stays derived (regenerable from `--rebuild`), never a source of truth. Walks `projects/*` and `projects/archive/*`. Unknown event types pass through (the filter is permissive).

**Hard dependency.** B.2's headline metrics (spawn-to-finding, non-applicability) require B.1's events. B.2 ships generic aggregation that *also* surfaces the evaluator metrics once B.1's events exist in the corpus. Building B.2 before B.1 repeats the prior project's over-promise.

---

## Constraints — RESEARCH.md is a one-shot input, not a fact-canon (Cluster D)

**Observation.** `bin/loom research` is a `copyFileSync` over `RESEARCH.md` gated by a committed-state check — overwrite-by-default with a "don't do that" guard. There is no path to *amend* a committed dossier with new facts (the bidirectional flow the operator wants). This entire foundation digest is itself an instance of the problem: it re-derives the prior dossier by hand because there is no amend operation.

**Substrate hooks (verified 2026-05-28).**
- `plugins/loom/cli/verbs/loom/research.ts:81-84` + `:183-184` — `--research-file` / `--notes-file` are `copyFileSync`'d into the project; re-runs are blocked by the committed guard.
- `plugins/loom/cli/verbs/loom/events.ts:114` — the noun-with-subverbs dispatch pattern that `loom research` would adopt to become `research init/amend/append/show`.

**Design decisions (prior dossier § fact-canon).**
- **Verb naming:** `loom research amend` (noun-then-subverb, matching `retro write`), not `loom revise-research`. Opens the family: `loom research init` (today's behavior), `amend`, `append`, `show`.
- **Append-with-provenance, enforced at the write layer:** amendments append delimited blocks with structured provenance frontmatter (project slug + phase + amending session id + timestamp); amendments never edit prior blocks. Cross-PR concurrent amendments become git-mergeable by construction (same shape as `manifest`'s append-only events).
- **High-low abstraction parallelism:** high is `/loom-research --mode=amend` (fresh interview from existing canon); low is `loom research append --section=<heading> --fact-file=<path> --citing=<source>` (single grounded fact, citation required). Shared invariant: every fact has a source. Trap to avoid: a third "lightweight interview" middle mode.
- **A soft schema becomes mandatory once RESEARCH.md is referenced by anchor:** semantic heading conventions at minimum; the provenance frontmatter is the one strict surface because programmatic readers key on it.

**Cost honesty (carried verbatim from the prior dossier).** The payoff is cross-project fact reuse, not in-project. It is only earned if amendments are first-class queryable artifacts (provenance frontmatter, append-only, stable anchors). Half-measures get the substrate weight without the payoff. This is the most design-heavy cluster and the most independent — hence last.

---

## Open questions (deferred to phase unit contracts)

These are deliberately unresolved here; each is a unit-contract decision, not a project-level one (per the prior project's INTERVIEW Decision 10 precedent).

- **Cluster A:** `loom checkin write --update` flag vs. canonicalizing "write-once-at-end" in the `/ev-loop-interactive` skill body (the retro `process-change` offers both). Whether `parse-plan` accepts *both* heading vocabularies or the PLAN template migrates to one. The exact `plan-*` event name + detail shape, given pre-commit events have no home.
- **Cluster C:** the contract-fit advisory triage (refine description / refine heuristic / accept). Whether sibling-reference resolution needs the registered roster as an input or can infer it.
- **Cluster B:** the detail shapes for the three evaluator events; whether emission lives in `guild-validate` directly or in the `/ev-loop-*` caller that holds the project path.
- **Cluster D:** the section-heading taxonomy that survives cross-project use and amendment without re-numbering; whether `loom research init` is a rename-with-shim or an alias.

---

## Sequencing

A → C → B → D, by risk-ladder and dependency:
1. **A first** — sharpen the saw. Fixes execution friction every later phase hits; its `plan-*` events work (gap 2) warms the same event-emission path B extends. Highest certainty. Graphite-sync (gap 5) is a one-time bootstrap chore done first so the stack can `gt submit`.
2. **C second** — close the Phase 2 loop while fresh; smallest, independent, low risk.
3. **B third** — the self-observation arc, on a smoother substrate. B.1 (events) strictly before B.2 (aggregation).
4. **D last** — most orthogonal and most design-heavy; absorbs lessons from A's `loom` CLI work (same surface).
