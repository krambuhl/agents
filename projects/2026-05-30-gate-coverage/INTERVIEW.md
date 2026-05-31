# INTERVIEW — gate-coverage

The grill that scoped this plan (2026-05-30), with the codebase findings that reshaped it mid-interview.

## Q1 — What's the deliverable of "digging in" on the May-2026 insights?

**A: A prioritized plan.** Triage the friction into a sequenced backlog rather than attacking an item ad hoc — matches the RPI discipline. (Alternatives weighed: attack the top item now; resolve the open empirical question first.)

## Q2 — How wide is the plan's scope?

**A: The live seam cluster** — the five "looks green, breaks later" code items (#2a/#2b/#2c/#3/#5).

Grounding pass (codebase, not a question) — the feedback is partly stale:
- **#2a** `CANONICAL_PHASES`: LIVE — still hardcoded (`axes-schema.test.ts:51`); `fixer` was hand-added, the exact recurrence boulder predicted.
- **#2b** `PHASE_PREFIX`: LIVE — two hand-synced copies (`recipe.ts:31`, `compile/derive.ts:26`).
- **#2c** node-real smoke: PARTIAL — the pattern exists (loom `*.smoke.ts`, shelled via `spawnSync('node')`) but covers loom-lib only; no guild, no bin-shims; no CI (gates are local).
- **#3** loom doctor → guild: LIVE — `doctor.ts` has no guild/cache references.
- **#5** derive-panel react-api: LIVE — `derive-panel.ts:145` still grants react-api to bare `*.ts`.

## Q3 — Homing the cluster (reshaped by a collision finding)

Finding: `guild-workflow-coverage` is active (P1 done, P2 in-progress, P3 not-started), and **P3 already owns #2b** ("simplify the name-mapping") and **#5** (derive-panel dangling-ref, logged as a P3 input). #2a is soft-noted in P3's D3 checkin. Verified across all four active plans that **#2c and #3 are genuinely unowned**.

**A: New small plan for the two unowned items (#2c + #3).** #2b/#5 stay with P3; #2a flagged for explicit P3 inclusion as a closing action. (Alternatives: fold into existing homes; one superseding plan that descopes P3 — rejected as disruptive to an active project.)

## Q4 — Plan shape

**A: Loom project, 2 phases**, `/ev-loop-interactive`, TDD-shaped. (Alternatives: bare PLAN.md; two independent micro-PRs.)

## Q5 — How to land it

**A: Register + PR** — branch via `gt`, `loom plan --no-commit` to generate the manifest, one tracked commit, PR (same cadence as #156). Registering on the branch sidesteps the loom-plan-commits-to-main gap.

## Decisions of record

- Scope narrowed to the unowned items after verifying P3 ownership — collision avoidance over a tidy-but-duplicative single plan.
- Smoke-first, doctor-second (replicate a proven pattern before designing a novel probe).
- Both items are executable now — neither depends on the plugin-cache re-sync blocking guild-workflow-coverage P2.
