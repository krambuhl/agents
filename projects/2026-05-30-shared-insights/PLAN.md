# PLAN — shared-insights: substrate papercut remediation

**Project**: `shared-insights`
**Loop**: per-phase (mechanical transforms `/ev-loop-confidence`; design/judgment/authoring `/ev-loop-interactive`)
**Cadence**: stacked via `gt`, three waves (setup → code-fix → convention/posture), one PR per phase
**Grounding**: `INSIGHTS.md` (the May-2026 three-take friction diagnosis) cross-referenced against all 14 archived project retros (`projects/archive/*/retros/project.json`) and the 8 ADRs (`projects/adr-log/`). This plan is the remediation half of that diagnosis.

## Context

`INSIGHTS.md` consolidated three independent `/insights` analyses (main, nebula, boulder) into a ranked friction catalog. Mining the archived retros + ADRs corroborates it: the same papercut classes recur across 6+ projects, and several are already half-addressed (ADRs 0004-0008 hardened sync-shared; gate-coverage shipped a guild verb-skew probe; `loom phase add` and `events append` landed). This plan completes the partially-done work and closes the open classes, organized around boulder's through-line:

> Most friction is integration-seam / authoring-vs-runtime failure, not reasoning failure. The verify-and-correct loop catches it reliably but *late*. **The lever is moving the catch earlier** — derive-don't-duplicate, a once-per-dispatch preflight, a `node`-real smoke.

Each phase RE-VERIFIES its premise against current source at contract time (cluster B's own lesson — PLANs go stale between authoring and execution), so already-shipped follow-ups are dropped rather than redone.

## Scope

### In
- The recurring substrate-code papercuts: cache/registry freshness (A), duplicated-truth drift (C), authoring-vs-consumer path resolution (D), evaluator-panel contract brittleness (E), the genuinely-missing substrate verbs (F/G).
- The agent-behavior conventions: AskUserQuestion discipline, skill-prose-vs-CLI reconciliation, declaring-done-before-demonstrating, branch-hygiene preflight (H/J/L).
- A diagnose-before-fix pass on the disputed output-token/overload class (I).
- A cleanup sweep (ADR TODO Consequences, K).

### Out / deferred
- Already-shipped follow-ups confirmed at draft time: `loom phase add` (exists), `events append` (exists), `pr reconcile` (obviated by the derive-don't-store PR-state model — `pr discover` reads live `gh`).
- The "fully autonomous multi-phase loop" / "parallel agents on isolated worktrees" horizon items from INSIGHTS — capability bets, not papercuts; separate effort.
- Anything requiring a harness/platform change outside this repo (the output-token cap, if it proves to be a real platform limit rather than a config bug — P7 decides).

## Phases

> **Wave 1 — setup/freshness (P1-P2): move the catch earlier.** Highest recurrence, highest leverage. Land first.

### Phase 1 — Dispatch preflight & freshness gate

**Goal**: A single once-per-dispatch preflight catches the cache/registry-skew and authoring-vs-runtime breaks that currently surface mid-run, before a multi-phase loop starts.

Cluster A (the single most-recurring class — 6+ projects + ADR-0006) plus the gate half of C. gate-coverage shipped the guild verb-list skew probe in `loom doctor`; this phase completes it: (1) add the agent-cache-vs-source skew signal deferred at gate-coverage P2·D1 (a robust, non-flaky cross-install-mode check); (2) a `node`-real smoke that executes the actual bin shims / entrypoints (not just vitest) — catches strip-only breaks and the fixture-masking class in one move (INSIGHTS #2, main's preferred gate); (3) wire the freshness check as a once-per-dispatch preflight in the loop bodies (boulder's narrow alternative to a noisy PostToolUse hook), `--check` after any `modes/` or schema-file relocation.

**Exit**: `loom doctor <slug>` (or a composed preflight) flags guild verb-skew AND agent-cache-vs-source skew; a `node`-real smoke target exists and runs in CI; the ev-loop/ev-run preflight invokes the freshness check once per dispatch; a deliberately-stale cache is detected by the preflight in a test.
**Loop**: `/ev-loop-interactive` (judgment: what to probe, how to avoid flaky cross-install checks).

### Phase 2 — Derive-don't-duplicate

**Goal**: The duplicated truths that drift (`CANONICAL_PHASES`, `PHASE_PREFIX`) are derived from a single source, deleting the drift class rather than catching it at a gate.

Cluster C structural (boulder's preferred move). Verified still-present (precise sites): `CANONICAL_PHASES` is a single hand-maintained constant in `axes-schema.test.ts:51` — the test's valid-phase expectation, which went stale on 2026-05-30 when `fixer` was authored but not added to the list (green until a later unit referenced the phase, per INSIGHTS #2); `PHASE_PREFIX` is genuinely duplicated across `recipe.ts:31` + `compile/derive.ts:26` (two independent maps kept in sync by hand — re-confirmed during guild-workflow-coverage P3·D1, where both copies were edited in lockstep). Two moves: derive the test's `CANONICAL_PHASES` expectation from the parsed `[axis.phase.*]` keys so it can't drift when a phase is added (a 1-file change — it is test-local, not a 3-way code duplication); collapse the dual `PHASE_PREFIX` to one exported source the other reads.

**Exit**: a new `axis.phase.*` entry requires no hand-edit to a canonical-phase list or a second prefix map; the freshness/schema tests still pass; `guild compile --check` ok.
**Loop**: `/ev-loop-confidence` (mechanical transform with a clear before/after).

> **Wave 2 — code fixes (P3-P5): close the open substrate gaps.**

### Phase 3 — Authoring-repo vs consumer-project path resolution

**Goal**: derive-panel and the PR-open path resolve correctly where they RUN, not just where they're authored.

Cluster D + the guild-workflow-coverage P3·D1 follow-up. (1) Make `derive-panel`'s rule-parser honor the spec's already-written conditions: the spec says "`*.ts` … only when it imports `react`/`react-dom`", but the parser extracts `evaluator-react` unconditionally — gate react-derivation on JSX/react-import presence, not bare `.ts`. (2) Repoint derive-panel's substrate-path globs off the pre-`plugins/` layout (`.claude/scripts/**`, `.claude/cli/**` → `plugins/**/cli/**`, `plugins/**/scripts/**`) so substrate code gets contract-fit+naming, not the generic `*.ts`→react over-include. (3) Forward `--base` through `loom pr open` so stacked PRs target their parent, not `main` (verified: no `--base` handling in `pr.ts` today).

**Exit**: derive-panel emits `evaluator-react` only for JSX/react-importing files; substrate `.ts` resolves to contract-fit+naming; `loom pr open --base=<branch>` targets the named base; tests cover each.
**Loop**: `/ev-loop-interactive` (the JSX-gate needs a parse-the-import judgment; relevance of `--base` vs gt-managed stacks confirmed at contract time).

### Phase 4 — Evaluator-panel contract hardening

**Goal**: The evaluator verdict contract is parse-robust and never silently drops signal.

Cluster E (INSIGHTS #5 + substrate-tempering). (1) `VERDICT:` must be matched on its own line and a verdict is GUARANTEED on early/budget termination (a paraphrased mid-line `VERDICT:` currently reads as parse-failure). (2) Surface recused + approved-with-advisory: substrate-tempering added a recusal convention (D2b-1) but parse-and-aggregate still silently drops approved-verdict prose ADVISORY notes — make advisories survive. (3) Bake the budget-discipline framing ("do AT MOST ONE spot-check, trust pre-computed verification, emit VERDICT now") into the canonical dense-packet template — it reliably fixed budget-exhaustion across this session and substrate-tempering.

**Exit**: parse-and-aggregate tests cover own-line VERDICT, guaranteed-verdict-on-early-exit, and advisory-survival; the dense-packet template in the loop bodies carries the budget-discipline lead; the codegen verdict-format fragment includes `VERDICT: recused`.
**Loop**: `/ev-loop-interactive` (contract/format design).

### Phase 5 — Close the genuinely-missing substrate verbs

**Goal**: The substrate-backlog verbs that are actually missing (not already shipped or obviated) land with tests.

Cluster F/G, scoped down by draft-time verification. In scope: (1) `loom plan` / `loom revise-plan` auto-seed manifest phases (call `phase add` internally) — `phase add` exists but isn't wired into plan-seeding, which forced hand-edits twice (substrate-followups, repo-compartmentalize). (2) `scripts/sync-shared.ts --only=<glob>` / `--exclude-lib` for narrow doc edits (prevents the bare-run overreach that deleted 10 files in substrate-followups). (3) `loom project archive` greps `**/*.test.ts` for archived-slug references and warns/refuses (catches Phase-8-shape breakage at archive time). Explicitly dropped after verification: `pr reconcile` (obviated by derive-don't-store), `events append` (shipped).

**Exit**: `loom plan` on a multi-phase PLAN seeds all phases with no hand-edit; `sync-shared --only` scopes a doc-only sync; `loom project archive` warns on lingering test refs; each has a test.
**Loop**: `/ev-loop-interactive` (verb API shape).

> **Wave 3 — convention & posture (P6-P8): the human/agent-discipline half.**

### Phase 6 — Skill-convention & agent-discipline

**Goal**: The recurring agent-behavior papercuts are codified as conventions the substrate enforces or documents, not left to per-session memory.

Clusters H, J, L. (1) **AskUserQuestion discipline** (the named example): document when a decision MUST use a structured `AskUserQuestion` prompt vs free-form prose, in the shared agent conventions doc + the grill-me skill body — the failure mode is asking consequential forks in prose where the structured form belongs. (2) **Skill-prose-vs-CLI reconciliation**: audit skill bodies for prose that contradicts actual verb behavior (the `checkin write` contract-only-then-fill pattern that doesn't compose with create-once — hit again this session: checkin write requires full schema + `number` + `created`); reconcile prose to the CLI or fix the CLI. (3) **Declaring-done-before-demonstrating** (INSIGHTS #6) and **branch-hygiene preflight** (loom authoring skills commit to the current branch — confirm `git branch --show-current` first): codify as conventions / a preflight note in the loop bodies.

**Exit**: an AskUserQuestion-discipline convention exists and is cited from the grill-me + loop skill bodies; at least the `checkin write` prose drift is reconciled; a branch-hygiene preflight line is in the ev-run/ev-loop preflight; a "demonstrate before declaring done" line is in the conventions.
**Loop**: `/ev-loop-interactive` (convention authoring is high-craft, shapes how every future session behaves).

### Phase 7 — Output-token / overload: diagnose, then remediate

**Goal**: Determine whether the output-token ceiling is a real platform cap or a config/call-path artifact (boulder's dissent), THEN apply the matching remedy.

Cluster I (INSIGHTS #1, highest cost — but disputed). This phase GATES remediation on diagnosis. D1 (diagnose): confirm whether the "~500 output-token" figure reflects a real cap, a misconfigured `max_tokens` on a specific call path, or an analyzer artifact — sessions in the same window produced far larger responses without tripping it. D2 (remediate, contingent on D1): if config bug → fix the budget; if real cap → codify stream-progress-per-phase + write-large-deliverables-to-files-incrementally + overload-retry-with-backoff as loop conventions.

**Exit**: a written diagnosis names the actual cause with evidence; the remediation matches the finding (no habit changes shipped before the cause is confirmed).
**Loop**: `/ev-loop-interactive` (investigative; the fix forks on the finding).

### Phase 8 — Cleanup

**Goal**: Close the small lingering debris the retros named.

Cluster K + small sweeps. Fill the unfilled `TODO: operator to fill before commit` Consequences in ADR-0002 and ADR-0005 (verified still present); fold any newly-mined-but-not-phased papercuts into INSIGHTS.md so the diagnosis stays current; widen `loom --help` padEnd column to fit `revise-plan` (loom-absorb follow-up) if still misaligned at draft time.

**Exit**: no ADR carries a `TODO` Consequences section; INSIGHTS.md reflects the remediation outcomes; `loom --help` columns align.
**Loop**: `/ev-loop-confidence` (mechanical).

## Dependencies

- Wave 1 (P1-P2) first — the freshness preflight and the derive-don't-duplicate delete reduce the friction every later phase pays.
- P3-P5 are largely independent of each other (different surfaces); sequence by risk, lowest first.
- P6-P8 depend on nothing in P1-P5 except P6's branch-hygiene/preflight line, which should reference P1's preflight if it landed.
- P7's remediation (D2) is gated on its own D1 diagnosis, not on other phases.

## Risks

- **P1 flaky cross-install checks** — the agent-cache-vs-source skew signal was deferred at gate-coverage precisely because a robust cross-install-mode version is hard; if it can't be made non-flaky, ship the verb-list probe only and document the gap.
- **P3 --base relevance** — gt manages stacking today; confirm `loom pr open --base` is still a real need (vs a gt-era vestige) before building it.
- **P4 codegen recompile cascade** — touching the verdict-format fragment regenerates the agent fleet (the guild freshness-gate cascade); pre-declare it in the unit's file-set.
- **P6 convention churn** — editing shared conventions/skill bodies touches synced docs; respect the commons-sync gate (ADR-0007) and sync-shared after.
- **P7 diagnosis inconclusive** — if the cause can't be pinned, P7 ships the diagnosis + the file-based-deliverable habit (low-risk regardless) and defers the retry-backoff.

## Open questions

- Does `loom pr open --base` survive the gt-managed-stack reality, or is it obviated like `pr reconcile`? (P3 contract-time decision.)
- Can the agent-cache-vs-source skew check be made non-flaky across install modes? (P1 — gate-coverage punted exactly this.)
- Is the output-token ceiling real? (P7·D1 — the whole phase's fork.)
- Where does the AskUserQuestion-discipline convention live — a new section in `AGENT-CONVENTIONS.md` (commons-canonical, synced) or the grill-me skill body? (P6 contract-time.)

## Decisions

- Organize around boulder's "move the catch earlier" through-line, not by cost-rank — the structural deletes (P2) and preflights (P1) prevent classes the late gates only catch.
- Re-verify each phase's premise against current source at contract time — already-shipped follow-ups (`phase add`, `events append`, `pr reconcile`) are dropped, not redone. This is cluster B's own lesson applied to its own remediation plan.
- Include agent-behavior conventions (P6) as first-class deliverables, not side-notes — the AskUserQuestion / declaring-done / branch-hygiene papercuts recur because they live only in per-session memory.
- Gate the disputed output-token remediation (P7) on diagnosis — honor boulder's dissent; don't change habits before the cap is confirmed real.
- `shared-insights` becomes a tracked loom project with `INSIGHTS.md` as its standing grounding (the diagnosis that the PLAN remediates), rather than spinning a separate project.

## Revision log

- **2026-05-31 (initial authoring, mechanical)** — Authored the initial remediation PLAN for shared-insights, grounding it in INSIGHTS.md + all 14 archived retros + the 8 ADRs. Eight phases in three waves (setup/freshness, code-fix, convention/posture) covering the recurring papercut clusters A-K. Scope verified against current source at draft time: dropped `pr reconcile` (obviated by derive-don't-store) and `events append` / `phase add` verb-creation (already shipped); refined P3 to parser-honors-import-condition and P5 to plan-auto-seeds-phases. The evaluator pass caught one mis-verified premise and it was corrected pre-commit: P2 originally claimed `CANONICAL_PHASES` was hardcoded in three files; source shows it is a single test-local constant (`axes-schema.test.ts`), while the genuine 2-file duplication is `PHASE_PREFIX` (`recipe.ts` + `derive.ts`) — P2 now states both precisely. This is a birth-path authoring surfaced through `/loom-revise-plan` because the project carried a diagnosis (INSIGHTS.md) but no PLAN; the operator chose to author the plan alongside the diagnosis.
