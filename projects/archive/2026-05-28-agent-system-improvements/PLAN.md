# PLAN — substrate-observability foundation

**Project**: `2026-05-28-agent-system-improvements`
**Topic**: ship the three smallest, highest-leverage substrate-observability improvements from `RESEARCH.md`'s 7-item next-step list, in sequence, as independent PRs.
**Loop**: `/ev-loop-interactive` per phase
**Cadence**: stacked via `gt`, sequential 1→2→3, one PR per phase

## Context

This plan implements **Group A** from `RESEARCH.md`'s recommended next steps (items 1, 2, 5 of the 7-item list). The research dossier at `projects/2026-05-28-agent-system-improvements/RESEARCH.md` is the foundation; every phase below cites it.

The unifying theme is **substrate self-awareness as a precondition for substrate extension** — the substrate-engineer's sequencing argument from shift 3 of the research whiteboard: observation before evaluation, metrics before suites, drift-detection before benchmark suites. Items 1+2+5 deliver the observation signal; items 3, 4, 6, 7 (the remaining four next-steps) are deliberately out of scope and become candidates for future projects gated on what this project's observation surfaces.

The dossier called these out in decreasing leverage-per-cost order:
- Item 1 (doc nudge for existing `Panel:` override) — zero code, ~30min
- Item 2 (convention-drift detector extending `scripts/sync-shared.ts --check`) — one afternoon
- Item 5 (`loom events aggregate --cross-project`) — ~one week

Sequencing the project this way honors the dossier's argument that the cheapest leveraged items should ship first so each one's learnings inform the next.

## Scope

### In

- **Phase 1**: A new `## When to opt out: per-unit Panel: override` section in `plugins/guild/docs/PANEL-COMPOSITION.md` documenting the existing per-unit `Panel:` override affordance (already documented at lines 284-299 of that file but not surfaced as the *answer* to verdict-padding heaviness). Plus a captured learning demonstrating the affordance in use.
- **Phase 2**: A new `scripts/check-conventions.ts` (or extension of `scripts/sync-shared.ts`) enforcing exactly one convention at MVP: **rubric-body coherence** across `evaluator-*.md` and `whiteboard-*.md` (every check named in the rubric/frontmatter is reachable from the body; every body check is described in the rubric). The script ships with a documented extension pattern so future conventions land additively. CI gate wired up as advisory at MVP (escalates to blocking after the rule stabilizes).
- **Phase 3**: A new `loom events aggregate` sub-verb on `loom events` (sibling to `loom events read`, `loom events latest`) that folds per-project `manifest.events` + `events.jsonl` across the full `projects/` tree and emits a cross-project view filtered by `--since=<duration>`, `--event=<name>`, `--limit=<n>`. Output shape: counts per event-name × per project × across the time window. No cache. No new events emitted — aggregates EXISTING event types only.

### Out

- **Item 3** (append-vs-overwrite decision for `/ev-loop-interactive`'s inner-RPI hop). Substrate-shape decision worth its own project.
- **Item 4** (`loom revise-research` → `loom research amend` vocabulary refactor). Substrate-shape decision worth its own project.
- **Item 6** (contract-quality scaffolding as upstream verdict-padding fix). Larger design + behavior change worth its own project.
- **Item 7** (`benchmark-*` family). Explicitly gated on this project's metrics surfacing a real regression — see `RESEARCH.md`'s "Recommended next steps" item 7.
- **Evaluator event emission** (`evaluator-spawned`, `evaluator-finding-emitted`, `evaluator-recused` event types). Required for the testing-strategy whiteboard's spawn-to-finding + non-applicability metrics. Out of scope for Phase 3 (which ships generic aggregation over existing events only) and out of scope for the project. A future project can extend events and then add evaluator-specific aggregation; the surface here will accept new event types additively without restructuring.

### Deferred

- Extending convention-drift to additional conventions in Phase 2 (sibling-reference resolution, frontmatter-key coherence, events-import-path enforcement). Each is a follow-up extension of Phase 2's script; the framework supports it but the MVP doesn't ship it.
- A `loom events aggregate --rebuild` flag for a derived cache. Only built if/when cardinality forces it; substrate-engineer's recommendation is no cache to start.
- A `loom report` / `loom observe` namespace for cross-noun observability. Reserved until a real cross-noun aggregation surface exists; deferred per the design-systems engineer's "don't create junk-drawer verbs" guidance.

## Phases

### Phase 1 — Doc nudge: surface per-unit Panel: override

**Deliverable**: `plugins/guild/docs/PANEL-COMPOSITION.md` gains a `## When to opt out: per-unit Panel: override` section that names verdict-padding as the symptom, points at lines 284-299 as the existing affordance, and gives a copy-pasteable contract snippet showing `Panel: [evaluator-contract-fit]` for mechanical units. Plus one captured learning at `learnings/session-notes/<date>-panel-override-affordance.md` demonstrating the override in use on a real (or representative) contract.

**Verification**:
- The new section is in `PANEL-COMPOSITION.md`.
- The learning file exists at `learnings/session-notes/` with a citation back to PANEL-COMPOSITION.md.
- Manual readthrough: an AI agent reading PANEL-COMPOSITION.md at session start now learns the override IS the answer to "my panel feels heavy on this mechanical unit."

**PR**: one stacked PR off `main`, branch `ev-agent.agent-system-improvements.phase-1`.

**Risks**: None substantive. Doc-only phase. The risk is that the doc gets written and operators STILL don't reach for the override — but that's a discoverability problem the convention-drift script (Phase 2) and metrics (Phase 3) will eventually surface.

### Phase 2 — Convention-drift detector: rubric-body coherence

**Deliverable**: `scripts/check-conventions.ts` (or an extension to `scripts/sync-shared.ts`, decided at unit-contract negotiation) that parses every `plugins/*/agents/{personalities,retained,generated}/*.md` and asserts:
1. Every check or dimension named in the agent's rubric / frontmatter `description` is referenced (by name or near-paraphrase) in the body prose.
2. Every check/dimension the body discusses is described in the rubric / frontmatter.
3. (Whiteboard-*): every "what you lean toward" bullet pairs with a "what you don't do" boundary; sibling-engineer references resolve to actual sibling files in the registered roster.

The script runs in CI as an **advisory** gate at MVP. Output: a per-agent report listing rubric-vs-body diffs, with an exit code of 0 (advisory) on findings. The convention to escalate to a blocking gate is documented but deferred — the substrate-engineer's "start advisory, escalate after corpus stabilizes" guidance applies.

The script is structured to make adding new convention checks additive — a typed `Convention` interface with `name`, `appliesTo(file): boolean`, `check(file): Finding[]` so future PRs add a new convention by adding a new exported `Convention` object.

**Verification**:
- The script runs locally: `node scripts/check-conventions.ts` produces output.
- CI runs the script as a new job (advisory).
- Deliberate seeding test: introduce a rubric-body mismatch in a temp test fixture (e.g., delete a rubric line from an agent body in a throwaway commit), confirm the script flags it; remove the mismatch, confirm green. Document the test in the PR.

**PR**: one stacked PR on top of Phase 1, branch `ev-agent.agent-system-improvements.phase-2`.

**Risks**:
- **False positives on prose parsing**. Rubric-vs-body matching is heuristic — "regex hints" in a fragment might not literally appear in the synthesized body. Mitigation: start advisory; track false-positive rate via the per-agent report; escalate to blocking only after the corpus stabilizes. If false-positive rate is high enough that operators mute the gate, the framework lost its value and we revisit.
- **Convention scope creep within the phase**. The convention check is tempting to extend with 5+ checks in one PR. Mitigation: PLAN.md commits to exactly one check at MVP; additional conventions are explicit follow-ups.

### Phase 3 — Cross-project event aggregation

**Deliverable**: `loom events aggregate` sub-verb extending `plugins/loom/cli/verbs/loom/events.ts`. Flags:
- `--since=<duration>` — same shape as existing `--since` on `loom events read`.
- `--event=<name>` — filter to one event type (re-uses the `EventName` typed surface).
- `--limit=<n>` — leading-N cap on output rows.
- `--cross-project` — implied/required for `aggregate`; without it the verb errors with a "use `loom events read` for per-project" message.

Output shape (JSON, pretty when `--pretty`): an array of `{ project: <slug>, event: <name>, count: <n>, first_at: <iso>, last_at: <iso> }` rows. Sorted by `(project, event)`.

Implementation: walks `projects/*/manifest.toml` (the post-consolidation event store) and `projects/archive/*/manifest.toml`; folds events that match the filter; emits rows. No cache. Reads complete lines only when falling back to legacy `events.jsonl` (drops trailing partials per testing-strategy whiteboard).

**Verification**:
- `loom events aggregate --since=30d --pretty` produces output against this repo's projects/ and lists ≥3 event types with non-zero counts.
- Manual spot-check: pick one row, cross-reference against the corresponding project's `loom events read <slug>`, confirm counts match.
- Unit test: synthetic fixture of 2 projects × 3 event types, assert correct fold.

**PR**: one stacked PR on top of Phase 2, branch `ev-agent.agent-system-improvements.phase-3`.

**Risks**:
- **Cardinality** if `projects/` grows to hundreds. Mitigation: ship cache-free per substrate-engineer guidance; if/when cardinality bites, add a derived cache (regenerable from `loom events aggregate --rebuild`), never a source of truth. Today the project count is ~10; this is not load-bearing yet.
- **Partial-line reads on concurrent appends**. If an `/ev-loop-interactive` session is mid-flight appending to a project's `events.jsonl` while `loom events aggregate` reads it, a tail-truncated event could parse-fail. Mitigation: read complete lines only, drop trailing partials per testing-strategy whiteboard's recommendation. For the TOML-store case (`manifest.events`), the read is one shot via `readManifestFile` and the parse is atomic — no partial-read risk.
- **Event-shape evolution**: if future phases add new event types (e.g., evaluator events), the aggregator needs to NOT fail on unknown event names. Mitigation: filter is permissive — unknown event types appear in output with their name; only `--event=<name>` filtering depends on the `EventName` typed surface (and that's fine: filtering on an unknown name returns zero rows, which is the right behavior).

## Dependencies

- **Phase 1 → Phase 2**: none. Phase 2 doesn't depend on Phase 1's doc landing.
- **Phase 2 → Phase 3**: none. Phase 3 doesn't depend on Phase 2's script.
- **All three on `main`**: each phase ships sequentially via `gt` stack but is technically independent. The sequencing is for shipping cadence (Phase 1 fastest → Phase 3 slowest) and learning compounding, not technical coupling.
- **External**: none. No npm dep changes, no consumer-project changes, no marketplace-version bump required.

## Verification (project-level)

The project is "done" when:

1. All three phases have merged PRs (Phase 1, 2, 3).
2. The convention-drift script (Phase 2) runs in CI and is green on `main`.
3. The `loom events aggregate` verb (Phase 3) produces output against `projects/` and the captured spot-check from the Phase 3 unit contract is documented in the PR.
4. A project-level retro at `projects/2026-05-28-agent-system-improvements/retros/landed.md` (free-form markdown) names what the project's metrics + drift-checks have surfaced so far — even if "nothing surfaced yet, baseline established" is the answer.

The project does NOT block on:

- Item 7 (`benchmark-*` family) ever shipping — that's gated on what this project's metrics surface over time.
- Convention-drift escalating from advisory to blocking — that's gated on false-positive rate stabilizing.
- Evaluator event emission ever shipping — separate decision.

## Risks (project-level)

- **The metrics from Phase 3 might never surface a real regression**, which would make Phase 3's effort feel unjustified in hindsight. Mitigation: that's actually the *good* outcome — the substrate is healthy. The metrics' value is also informational (operator situational awareness), not only regression-detection.
- **Phase 2's convention-drift script might generate noise high enough to be muted before the load-bearing check matures**. Mitigation: start advisory; document the false-positive rate over the first month of CI runs; only escalate to blocking when the rate stabilizes below an agreed threshold (e.g., < 5% of runs flag a finding that isn't a real drift).
- **Phase 1's doc nudge might land and be ignored** — operators still don't reach for the `Panel:` override. Mitigation: Phase 3's metrics will eventually show whether mechanical units are still spawning full panels; that's the empirical test of whether the doc nudge worked.
- **Scope drift mid-execution**: the temptation to extend Phase 2 to 4 conventions or Phase 3 to evaluator-specific metrics is real once the framework is built. Mitigation: PLAN.md commits to exactly the MVP scope for each phase; extensions are explicit follow-ups, not phase-internal additions.

## Open questions (deferred to phase contracts or follow-ups)

- **Whether convention-drift extends to `whiteboard-*` agents in Phase 2's MVP or as a 2.1 follow-up**. The PLAN says MVP covers both `evaluator-*` and `whiteboard-*`; the unit contract for Phase 2 can sharpen this if implementation reveals the whiteboard-side check is materially more complex.
- **Whether `scripts/check-conventions.ts` is a new standalone script OR an extension of `scripts/sync-shared.ts`**. The unit contract decides; the substrate signal is that `sync-shared.ts` is file-mirror invariants while convention-drift is behavioral invariants — probably want them separate, but defer the final call.
- **Whether Phase 1's learning is captured via `bin/griot capture` or written manually**. The capture verb's classification surface may not have a precise match for "doc-affordance learning" — if not, write manually and flag the classification gap as a follow-up.
- **Whether the `loom events aggregate` output should also surface a `total` row** (sum across projects per event-name). Probably useful; can be a phase-3-internal decision at contract time.

## Decisions

Resolved by the plan interview:

1. **Scope = Group A from `RESEARCH.md`** (items 1+2+5; observation foundation). Selected over Group B (RESEARCH-as-fact-canon), Single-focused (convention-drift only), and verdict-padding fix.
2. **Three independent phases, sequential 1→2→3**. Selected over staged setup/build/polish and hybrid (1 standalone + 2+5 bundled). Honors the dossier's increasing-cost sequencing argument.
3. **Phase 2 MVP scope = one check (rubric-body coherence) + extension pattern**. Selected over starter-set (3-4 checks at MVP).
4. **Phase 3 MVP scope = generic aggregation over existing events**. Selected over "extend events + aggregate" and "generic + flag evaluator-events as Phase 4." Honest about the data we have today; evaluator event emission is a separate future project.
5. **Phase 1 doc lives in `plugins/guild/docs/PANEL-COMPOSITION.md`** (new section), not a standalone learning. Audience is AI agents primarily.
6. **Loop strategy: `/ev-loop-interactive` for all three phases**. Each phase is a discrete deliverable, not a bulk transform.
7. **PR cadence: stacked via `gt`, sequential**. Standard for this repo.
8. **Verification signals named per phase** (see Phases section above).
9. **Risks named explicitly per phase** (see Phases and Risks sections above).
10. **Open questions enumerated, not blocked on** (see Open questions above).
