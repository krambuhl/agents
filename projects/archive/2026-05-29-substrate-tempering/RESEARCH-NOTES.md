# RESEARCH-NOTES — substrate-tempering foundation provenance

This file is the provenance map for `RESEARCH.md`. Unlike a normal `/loom-research` notes file (a raw interview transcript + verbatim whiteboard contributions), this project ran no fresh interview. `RESEARCH.md` is a digest of pre-existing, research-grade material. This file records, per claim cluster, exactly where each fact came from — so a reader can audit the digest against its sources, and so each phase's executor can pull depth from the anchor.

## Sources

- **PRIOR-DOSSIER** — `projects/archive/2026-05-28-agent-system-improvements/RESEARCH.md`. The original research dossier; three "Constraints" sections + a 7-item "Recommended next steps" list. Clusters B and D are drawn from it.
- **RETRO** — `projects/archive/2026-05-28-agent-system-improvements/retros/project.json`. The project-type retrospective; `kept-well` / `improvement` / `process-change` / `follow-up` findings. Clusters A and C are drawn from it.
- **PRIOR-PLAN** / **PRIOR-INTERVIEW** — the archived `PLAN.md` / `INTERVIEW.md`; the Phase 3 framing and Decision 4 (the mid-interview narrowing that closed the aggregation payoff).
- **CODE@2026-05-28** — direct verification of named hooks against the working tree on 2026-05-28.

## Per-cluster provenance

### Cluster A — loom CLI papercuts
- The five gaps: RETRO `follow-up` finding "Five substrate gaps surfaced during execution remain open" (verbatim: manifest backfill, plan-* events, parse-plan Goal/Exit, checkin update verb, Graphite sync). Cross-referenced to PR #139 body + Phase 2 `notes_for_pr`.
- Checkin create-once / contract-then-fill conflict: RETRO `process-change` finding "The /ev-loop-interactive skill body's 'write contract-only first, fill in after' pattern doesn't compose with the CLI's create-once `loom checkin write`."
- Hooks: CODE@2026-05-28 — `plan.ts:171-185`, `lib/plan.ts` (`plan-phase-missing-goal`), `checkin.ts:198-204`, `types.ts:59-96/405`, `events.ts:54`.
- The parser→backfill intra-cluster dependency: derived at digest time from CODE@2026-05-28 (both gap 1 and gap 3 touch the phase model in `lib/plan.ts`). Not stated in any source — a verification-time finding.

### Cluster C — convention-drift 2.1
- Deferred whiteboard-* checks: RETRO `follow-up` finding "Whiteboard-* convention checks deferred from Phase 2 MVP: bullet-pair coherence ... and sibling-engineer reference resolution." Cross-referenced to PRIOR-INTERVIEW Decision 3 (explicitly defers whiteboard-* to a 2.1 follow-up).
- The advisory triage: RETRO `follow-up` finding "check-conventions.ts surfaces 1 advisory finding on plugins/guild/agents/retained/evaluator-contract-fit.md."
- Hooks + the evaluator-only scope of today's convention: CODE@2026-05-28 — `scripts/check-conventions.ts:19-48,70-92`.

### Cluster B — evaluator observability
- The three events + spawn-to-finding/non-applicability metrics: PRIOR-DOSSIER § "the substrate has no self-observation and no self-evaluation," point 2; and § "Recommended next steps" item 5. The deferral rationale: RETRO `improvement` + `follow-up` findings on Phase 3 ("needs evaluator event emission ... to exist first ... That's its own focused project").
- Phase 3 was closed not shipped: PRIOR-PLAN Phase 3 + PRIOR-INTERVIEW Decision 4; confirmed by git log (Phase 1 + Phase 2 commits only, no Phase 3).
- Hooks: CODE@2026-05-28 — `types.ts:59-96/405`, `events.ts:54`, `events.ts:114` (subverb map, no `aggregate`), `guild-validate/SKILL.md` (no event emission).

### Cluster D — RESEARCH as fact-canon
- Verb family + append-with-provenance + high-low abstraction + cost honesty: PRIOR-DOSSIER § "RESEARCH.md is a one-shot input, not a living fact-canon" (the design-decisions bullets, carried largely verbatim) + § "Recommended next steps" items 3 and 4.
- Hooks: CODE@2026-05-28 — `research.ts:81-84,183-184` (copyFileSync + committed guard), `events.ts:114` (the noun-subverb pattern to mirror).

## Method note

The decision to digest rather than re-research is itself recorded in PRIOR-RETRO's `process-change` finding ("meta-research about the substrate IS legitimate /loom-research territory, not ceremony") read against the inverse risk: re-deriving an existing, evidence-anchored dossier is the ceremony. The digest re-organizes the prior material around *this* plan's four clusters (the prior dossier was organized around three different research lenses), which is the value a fresh-context sub-agent could not add without first re-reading these same sources.
