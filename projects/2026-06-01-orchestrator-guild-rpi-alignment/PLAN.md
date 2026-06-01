# Plan: Align loom + ev orchestrators with the expanded guild RPI phases

## Context

The guild now ships five RPI-aligned phases as on-disk agent files — `research-*` (10), `plan-*` (11, the renamed former `whiteboard-*`), `implementer-*` (8), `evaluator-*` (9), `fixer-*` (8) — but the seven loom/ev orchestrators consume only two of them. This plan wires the missing three phases into the orchestrators and replaces today's split-brain panel-composition with a single phase-aware participate-vs-recuse layer.

Research foundation: `projects/2026-06-01-orchestrator-guild-rpi-alignment/RESEARCH.md` (committed `ca8a032`). Every claim below is grounded there.

Load-bearing facts from the research:

- **The consumption gap.** Across all seven orchestrators, only `evaluator-*` is wired everywhere it belongs (via `derive-panel` → `/guild-validate`) and `plan-*` is wired at the design seam only (ev-loop Plan step, `loom-archive`, `loom-research` shift panels). `research-*`, `implementer-*`, and `fixer-*` are staffed-but-unwired — agent files exist, no orchestrator spawns them. The ev-loops' "Specialist gate-then-review" sections *name* an implementer/fixer pairing but state "no control-flow change needed" — documentation, not wiring (`ev-loop-interactive/SKILL.md` lines 703-723).

- **Composition is split-brain.** `derive-panel` does up-front composition but its output vocabulary is hardwired to `evaluator-*` (`derive-panel.ts` regex line 112; baseline/fallbacks all `evaluator-*`). Every non-evaluator phase spawns the full glob roster and relies on per-agent runtime self-recusal (`/guild-validate` `agent_signals[].outcome: recused`; `/guild-plan` does no domain filtering). There is no general "who participates at phase P" layer.

- **`axes.toml` already encodes the answer.** `plugins/guild/modes/axes.toml` (lines 15-60) declares which domains occupy which phase (e.g. `a11y` in all five; `abstraction`/`composition`/`performance`/`substrate` in `research`+`plan` only; `css-architecture`/`nextjs` in `reviewer`+`implementer`+`fixer`). Today only the codegen reads this table — no runtime composition consumer does.

- **The registry caveat (sequencing constraint).** The live runtime registry resolves guild agents from a marketplace mirror pinned at commit `73249bd` (PR #166), which predates the entire whiteboard→plan rename. It still ships `whiteboard-*`, zero `plan-*`/`research-*`, and only `css-architecture` implementer/fixer. Consequence: source wiring can be authored and unit-tested against the working tree, but **live-spawn smoke fails until the mirror refreshes past guild-hirefest.** This plan treats "source-done" and "runtime-done" as distinct gates and sequences the refresh as the final acceptance step.

## Scope

**In:**
- A phase-parameterized `derive-panel` (`--phase=<p>`) that reads `axes.toml`'s domain×phase `phases` lists as the participation source of truth, with runtime self-recusal preserved as the second gate.
- `/guild-plan` emitting the same `agent_signals` recusal shape `/guild-validate` already emits.
- `loom-research`: shift panels spawn `research-*` instead of `plan-*`.
- `loom-plan`: a new `plan-*` panel at the plan-authoring step, composed via the phase-aware layer.
- Both ev-loops: a per-unit *delegation switch* that lets the IMPLEMENT step delegate the write to `implementer-<domain>` and the FIX step delegate flagged-finding remedies to `fixer-<domain>`. Delegation is an **option**, not a forced path: `ev-loop-interactive` defaults off (preserves keystroke-level pairing) and opts in per unit; `ev-loop-confidence` defaults on.
- Final-phase marketplace-mirror refresh + live-spawn smoke as the runtime acceptance gate.

**Out (deliberately left alone):**
- `loom-revise-plan` keeps its fixed plan-shape rubric (no `derive-panel` retrofit).
- `ev-run` stays a thin router — no composed panel; its single `evaluator-contract-fit` ambiguity reader is unchanged.

**Deferred:**
- Any domain-implementer/fixer *body* improvements — this plan wires the seam and trusts the existing agent bodies.
- Generalizing the recusal signal into a cross-phase analytics/telemetry surface — out of band.

## Phases

Recommended execution loop: **`ev-loop-interactive` throughout** (human-paired; API shape and skill control-flow are taste-load-bearing). Each phase is one stacked PR (`gt`), branch `ev-agent.orchestrator-guild-rpi-alignment.<phase-short-name>`.

### Phase 1 — Phase-aware participate layer (setup / gate)

**Goal:** one composition layer that answers "who participates at phase P for artifact A," backward-compatible with every current caller.

**Deliverables:**
1. `derive-panel --phase=<research|plan|implementer|reviewer|fixer>` in `plugins/guild/cli/verbs/guild/derive-panel.ts`. Reads `axes.toml`'s domain×phase `phases` lists to emit the candidate set for that phase, prefixed with the phase name (`research-*`, `plan-*`, …). `--phase` defaults to `reviewer`, and the `reviewer` path must emit byte-for-byte the current `evaluator-*` output (the existing `--files=` callers are unchanged). Baseline-seed semantics preserved per phase (e.g. `evaluator-contract-fit` stays the reviewer baseline).
2. `/guild-plan` emits the `agent_signals[]` recusal shape (`outcome: gated | recused | operator-judgment`) that `/guild-validate` already produces (`guild-validate/SKILL.md` lines 92-100), so recusal is observable at the plan phase too.

**Files:** `derive-panel.ts`, `plugins/guild/modes/axes.toml` (read-only consumer; may need a tiny accessor), `plugins/guild/skills/guild-plan/SKILL.md` (+ output-shape section), commons `PANEL-COMPOSITION.md` if the spec format needs a phase dimension (sync via `scripts/sync-shared.ts` if `commons/docs` touched).

**Verification:** new vitest cases — `derive-panel --phase=reviewer` output equals the pre-change evaluator output for a fixed file set (regression lock); each non-reviewer phase emits the axes.toml-declared domain set; positional-arg still baselines (documented quirk preserved). `npm run check` clean if commons touched.

**Dependency:** none. This is the gate everything else builds on.

### Phase 2 — research-* into loom-research (lowest-risk wave)

**Goal:** align the research phase to its own seam.

**Deliverable:** `loom-research/SKILL.md` step 4 shift-panel roster swaps `Glob(.claude/agents/plan-*.md)` → the phase-aware `derive-panel --phase=research` (or `research-*` glob as the bootstrapping fallback). Reserve `plan-*` for the plan phase.

**Files:** `plugins/loom/skills/loom-research/SKILL.md`.

**Verification:** skill-body test that the research step cites the `research` phase; bootstrapping-empty-glob path still skips cleanly. Transitively, the ev-loop inner-RPI accept path (which spawns `/loom-research`) now reaches `research-*`.

**Dependency:** Phase 1 (uses `--phase`).

### Phase 3 — plan-* panel in loom-plan

**Goal:** give the plan-authoring step real multi-perspective design input, composed via the new layer.

**Deliverable:** `loom-plan/SKILL.md` gains a `plan-*` panel at the strawman/synthesis step, composed via `derive-panel --phase=plan`. It augments — does not replace — the solo grill-me interview; the panel's contributions feed the synthesis, and the evaluator gate (step 6) is unchanged.

**Files:** `plugins/loom/skills/loom-plan/SKILL.md`.

**Verification:** skill-body test that the plan step composes a `plan` phase panel; the existing evaluator-pass step is untouched (assert both seams coexist). Convergence-budget note added so the panel doesn't blow the interview budget.

**Dependency:** Phase 1.

### Phase 4 — implementer-* delegation seam (both ev-loops)

**Goal:** the IMPLEMENT step can delegate the write to `implementer-<domain>`, as a per-unit option.

**Deliverables:**
1. A per-unit *delegation switch* surfaced consistently across both loops: a PLAN.md phase flag and/or unit-contract opt-in field. `ev-loop-interactive` defaults the switch **off** (inline drive, pairing intact); `ev-loop-confidence` defaults it **on**.
2. When the switch is on for a unit, the loop composes `implementer-<domain>` via `derive-panel --phase=implementer` and delegates the write through `/guild-spawn` (loom/ev skills route through guild coordination skills — they do not call the `Agent` tool directly; `ev-loop` `allowed-tools` does include `Agent`, so the seam choice is deliberate, not forced).
3. The human still gates at the evaluator checkpoint regardless of switch state.

**Files:** `plugins/ev/skills/ev-loop-interactive/SKILL.md`, `plugins/ev/skills/ev-loop-confidence/SKILL.md`. Remove the affected "Specialist gate-then-review" prose's "no control-flow change" claim (replaced by real wiring; full prose deletion lands in Phase 6).

**Verification:** skill-body tests for the switch defaults per loop; a unit-contract example with delegation on and one with it off; assert the evaluator checkpoint fires in both. Live-spawn deferred to Phase 6.

**Dependency:** Phase 1.

### Phase 5 — fixer-* delegation seam (both ev-loops)

**Goal:** the FIX step can delegate flagged-finding remedies to `fixer-<domain>`, mirroring Phase 4.

**Deliverables:** same per-unit switch shape applied to the "iterate on flagged findings" step (`ev-loop-interactive` step 4 "Iterate or commit"). When on, the loop hands a flagged-finding packet to `fixer-<domain>` (composed via `derive-panel --phase=fixer`) for the minimal remedy (`axes.toml` line 118: fixer `default_personality = "pragmatist"`).

**Files:** both ev-loop SKILL.md FIX/iterate steps.

**Verification:** skill-body tests for the fix-delegation switch + defaults; the inline-fix path still works when the switch is off.

**Dependency:** Phase 4 (shares the switch mechanism).

### Phase 6 — Cleanup + runtime gate (close the loop)

**Goal:** runtime-done, not just source-done.

**Deliverables:**
1. Delete the now-obsolete "Specialist gate-then-review" documentation prose in both ev-loops (the behavior is real as of Phase 4/5).
2. Refresh the marketplace mirror past guild-hirefest: publish the relevant commits to the public `agents.git` and run the plugin update so the runtime registry resolves `plan-*`/`research-*`/full `implementer-*`/`fixer-*`.
3. Live-spawn smoke per `plugins/guild/CLAUDE.md` § Live-spawn smoke — spawn one agent per newly-wired phase from the *live* registry and confirm it returns the expected contribution shape.

**Files:** both ev-loop SKILL.md (prose deletion); ops steps (publish + update) are not repo-diff; a smoke checklist/result note.

**Verification:** live-spawn smoke green for `research-*`, `plan-*`, `implementer-*`, `fixer-*`. This is the acceptance gate for the whole effort.

**Dependency:** all prior phases + the publish being unblocked.

## Dependencies

- Phase 1 gates Phases 2/3/4 (the bulk-migration wave). Phase 5 depends on Phase 4 (shared switch). Phase 6 depends on all.
- **External:** Phase 6's registry refresh depends on guild-hirefest commits reaching the public `agents.git` and a plugin update. If that publish is blocked, Phase 6 stalls at "source-done" and live-spawn smoke becomes the tracked follow-up — the source phases (1–5) still land independently.
- Repo convention: any edit under `plugins/commons/{cli/lib,docs}/` requires `node scripts/sync-shared.ts` + `npm run check` before commit (enforced by pre-commit hook + CI, ADR-0007).

## Verification

- **Per phase:** vitest unit/body-shape tests as listed; `npm test` green; `npm run check` clean.
- **Backward-compat lock (Phase 1):** `derive-panel --phase=reviewer` reproduces the exact pre-change evaluator output — the regression test that protects every current caller.
- **Whole-effort acceptance (Phase 6):** live-spawn smoke green for all four newly-wired phases from the live registry.
- Per repo convention, prefer `node plugins/<plugin>/cli/<cli>.ts` over cached bin shims when exercising loom/guild CLIs (cached binaries lag source, ADR-0006).

## Risks

- **Registry staleness blocks runtime proof (high likelihood, medium impact).** Mitigation: source phases verified against the working tree independently of the registry; Phase 6 isolates the refresh so a blocked publish doesn't strand phases 1–5. "Source-done" is an explicit, shippable state.
- **Full delegation changes ev-loop-interactive's character (medium/medium).** Mitigation: the per-unit switch defaults delegation OFF in interactive — pairing is preserved unless the operator opts in. Delegation is an option, never the default for the human-paired loop.
- **Phase-aware derive-panel breaks existing evaluator callers (low/high).** Mitigation: `--phase` defaults to `reviewer` and the reviewer path is byte-for-byte locked by a regression test before any other phase is added.
- **`axes.toml` phase lists drift from agent bodies (low/medium).** The table says a domain *can* participate at a phase, but the agent body must actually return that phase's contribution shape. Mitigation: live-spawn smoke (Phase 6) is the cross-check; if a body returns the wrong shape, that's a guild-body fix (deferred scope), not a wiring bug.
- **commons-sync drift if PANEL-COMPOSITION.md gains a phase dimension (low/low).** Mitigation: run `sync-shared.ts` + `npm run check`; the pre-commit hook blocks a drifted commit anyway.

## Open questions

- Does `PANEL-COMPOSITION.md` need a phase dimension, or can the phase→domain mapping live entirely in `axes.toml` with `derive-panel` reading both? (Resolve in Phase 1 design — prefer `axes.toml` as the single SoT.)
- Exact surface of the per-unit delegation switch — PLAN.md phase-level flag vs per-unit-contract field vs both. (Resolve at Phase 4 kickoff; both is the leading shape.)
- Whether the publish/refresh (Phase 6) is a one-command op or a blocked dependency — confirm before Phase 6 kickoff.

## Decisions

- **Participate-vs-recuse = phase-parameterized `derive-panel` + `axes.toml` as SoT + runtime self-recusal retained + `/guild-plan` emits `agent_signals`.** One composition layer for all five phases; the declarative phase×domain table is the source of truth; agents can still bow out at runtime on artifact specifics the table can't see.
- **Full delegation, as an option.** Both ev-loops gain implementer/fixer delegation, gated by a per-unit switch — interactive default-off, confidence default-on. Delegation is a first-class capability the loops reach for, never a forced rewrite; "drive it myself" stays available on any unit.
- **Scope held tight on adjacents:** `loom-plan` gains a `plan-*` panel; `loom-revise-plan` and `ev-run` are left as-is.
- **Source-done and runtime-done are distinct gates.** Phases 1–5 land and verify against the working tree; Phase 6 owns the registry refresh + live-spawn smoke as the runtime acceptance gate.
- **Execution: `ev-loop-interactive` throughout.** High-craft substrate work; API shape and control-flow shaped in real time.

## Revision log

- 2026-06-01 — Renumber phases 2a-2d/3 to integers 2-6 so loom's integer phase parser tracks the full plan (letter-suffixed ids were invisible to parse-plan and stranded the bulk-migration wave)
