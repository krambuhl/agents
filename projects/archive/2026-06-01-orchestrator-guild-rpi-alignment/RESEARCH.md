# Research: Align loom + ev orchestrators with the expanded guild RPI phases, and design a participate-vs-recuse mechanism

This dossier is codebase-internal research. Every claim cites a file path plus the observable line/section in the repo at `/Users/krambuhl/Sites/agents-nebula` (working tree at commit `0afe406`, the guild-hirefest archive). It is the foundation for a forthcoming PLAN.md consumed by `/loom-plan orchestrator-guild-rpi-alignment`.

## Scope and load-bearing premise

The guild now ships five RPI phases as on-disk agent files; the orchestrators (loom + ev skills) consume only a subset of those phases, and the live runtime registry is stale relative to the working repo. The two load-bearing artifacts of this research are (a) the orchestrator x guild-phase consumption matrix and (b) the disk-vs-registry gap diagnosis. Everything else (the participate-vs-recuse design, the RPI-alignment confirmation, the invocation-seam survey) hangs off those two.

## Finding 1 — Guild five-phase inventory (on disk)

The five phases exist as agent files under `plugins/guild/agents/`, counts verified by glob:

- `research-*`: 10 files (`research-a11y`, `research-abstraction`, `research-composition`, `research-naming`, `research-performance`, `research-react`, `research-substrate`, `research-test-integration`, `research-test-unit`, `research-tokens`).
- `plan-*`: 11 files (the 10 above minus `substrate`/`abstraction`/`composition` pattern is not exact — the plan set adds `plan-skeptic` and keeps `plan-abstraction`/`plan-composition`/`plan-substrate`). Full list: `plan-a11y`, `plan-abstraction`, `plan-composition`, `plan-naming`, `plan-performance`, `plan-react`, `plan-skeptic`, `plan-substrate`, `plan-test-integration`, `plan-test-unit`, `plan-tokens`.
- `implementer-*`: 8 files (`a11y`, `css-architecture`, `naming`, `nextjs`, `react`, `test-integration`, `test-unit`, `tokens`).
- `evaluator-*`: 9 files (the 8 implementer domains plus `evaluator-contract-fit`).
- `fixer-*`: 8 files (same domain set as implementer).
- `whiteboard-*`: 0 files. The glob `plugins/guild/agents/whiteboard-*.md` returns no matches — the rename to `plan-*` shipped in the working tree.

Each agent's `name:` frontmatter matches its filename: `plugins/guild/agents/research-react.md` declares `name: research-react`, `plan-react.md` declares `name: plan-react`, and so on through `evaluator-react`, `implementer-react`, `fixer-react`. The phase axis itself is declared in `plugins/guild/modes/axes.toml` line 92 (`# ---------- axis: phase (5) ----------`) with the five phase blocks at lines 98 (`research`), 103 (`plan`), 108 (`reviewer`), 113 (`implementer`), 118 (`fixer`).

## Finding 2 — The disk-vs-registry gap is a stale marketplace mirror, not a compile or cache fault

The live Claude Code registry resolves guild agents from the marketplace mirror at `~/.claude/plugins/marketplaces/krambuhl/plugins/guild/agents/`. That mirror is a git checkout of `git@github.com:krambuhl/agents.git` pinned at commit `73249bd` ("Merge pull request #166 ... Archive gate-coverage"), whereas the working repo is at `0afe406` ("Merge pull request #196 ... guild-hirefest archive"). The mirror predates the entire guild-hirefest effort.

Observable consequences, confirmed by listing the mirror's `agents/` directory:

- The mirror ships the OLD `whiteboard-*` set (`whiteboard-a11y`, `whiteboard-abstraction`, `whiteboard-composition`, `whiteboard-naming`, `whiteboard-performance`, `whiteboard-react`, `whiteboard-skeptic`, `whiteboard-substrate`, `whiteboard-test-integration`, `whiteboard-test-unit`, `whiteboard-tokens`) and has ZERO `plan-*` files (`ls ~/.claude/plugins/marketplaces/krambuhl/plugins/guild/agents/ | grep -E '^(plan|research)-'` returns nothing).
- The mirror ships only `implementer-css-architecture` and `fixer-css-architecture` from the write-capable phases — not the full 8-each sets that exist in the working tree.
- The mirror ships NO `research-*` agents at all.
- The mirror's evaluator set is the 9-name cohort, which is current.

Diagnosis: this is a **stale install** (marketplace mirror not refreshed since PR #166), NOT a missing `guild compile` step (the working repo's `agents/` are compiled and committed) and NOT a cache-hash issue (`~/.claude/plugins/cache/krambuhl/guild/` holds many historical hash-keyed snapshots, none of which contain `plan-*` or `research-*` either, because no compiled-and-published commit with those names has reached the mirror the cache derives from). The plan must treat "land the wiring in source" and "the runtime can spawn the new phases" as two separate gates: the wiring can be authored and tested against the working tree, but live-spawn smoke (per `plugins/guild/CLAUDE.md` § Live-spawn smoke) will fail until the marketplace mirror is updated to a commit at or past the guild-hirefest merge. This matches the durable rule recorded in repo memory: spawn from the live available-agents list, never from on-disk filenames or memory.

## Finding 3 — Orchestrator x guild-phase consumption matrix (current state)

For each orchestrator skill, the guild phase it consumes today, via which guild skill / CLI, at which step. Phases not listed for a skill are unwired by that skill.

| Orchestrator | research-* | plan-* | implementer-* | evaluator-* | fixer-* |
|---|---|---|---|---|---|
| `ev-loop-interactive` | unwired (spawns the `/loom-research` skill instead, not the `research-*` panel) | CONSUMED via `/guild-plan`, phase-start "Plan" step | unwired (documented, no spawn) | CONSUMED via `/guild-validate` + `derive-panel`, unit-loop step 3 | unwired (documented, no spawn) |
| `ev-loop-confidence` | unwired (no inner-RPI at all) | CONSUMED via `/guild-plan`, phase-start "Plan" step | unwired (documented, no spawn) | CONSUMED via `/guild-validate` + `derive-panel`, unit-loop step 3 | unwired (documented, no spawn) |
| `ev-run` | unwired | unwired | unwired | unwired (auto-mode uses `evaluator-contract-fit` for ambiguity resolution, but does not run a derived panel) | unwired |
| `loom-plan` | unwired | unwired (solo grill-me interview, NOT a plan-* panel) | unwired | CONSUMED via `derive-panel` + `/guild-validate`, step 6 "Evaluator pass" | unwired |
| `loom-revise-plan` | unwired | unwired | unwired | CONSUMED via `/guild-validate` (fixed audit rubric, no derive-panel), step ~142 | unwired |
| `loom-archive` | unwired | CONSUMED via `/guild-plan` (full roster), auto-mode dual-panel | unwired | CONSUMED via `derive-panel` + `/guild-validate`, auto-mode dual-panel | unwired |
| `loom-research` | unwired (uses `plan-*` for shift panels, not `research-*`) | CONSUMED via `/guild-plan` per shift, `Glob(.claude/agents/plan-*.md)` roster | unwired | CONSUMED via `/guild-validate` with `evaluator-contract-fit`, step 5 fact-check | unwired |

Evidence per cell:

- `ev-loop-interactive` § Plan (`plugins/ev/skills/ev-loop-interactive/SKILL.md` lines 100-168): invokes `/guild-plan` at phase start; engineers default to `Glob(.claude/agents/plan-*.md)` (lines 114-116); bootstrapping note at lines 157-162 skips the step if the glob is empty. Unit-loop step 3 (lines 297-322) invokes `/guild-validate`, panel auto-derived via `bin/guild derive-panel` (§ Panel auto-derivation, lines 660-701). The inner-RPI accept path (lines 496-500) SPAWNS the `/loom-research` skill via the Agent tool with `subagent_type=loom-research` — it does NOT spawn `research-*` guild agents. The "Specialist-evaluator gate-then-review" section (lines 703-723) names `implementer-css-architecture` / `fixer-css-architecture` but states "No control-flow change to the loop is needed" — these are documentation of an aspirational pairing, not a spawn site.
- `ev-loop-confidence` § Plan (`plugins/ev/skills/ev-loop-confidence/SKILL.md` lines 99-163) and unit-loop step 3 (lines 306-323): identical `/guild-plan` + `/guild-validate` shape to the interactive loop. No inner-RPI; scope-shift accept uses § Revise PLAN.md directly (line 416), so it never spawns `/loom-research`. Same documented-only specialist section (lines 469-485).
- `ev-run` is a thin router (`plugins/ev/skills/ev-run/SKILL.md` Rules line 426-427: "The router reads state and dispatches. No code changes, no file writes, no evaluator calls."). Auto-mode ambiguity resolution names `evaluator-contract-fit` (lines 374-393) but as a single-agent reader, not a derived panel.
- `loom-plan` step 6 "Evaluator pass" (`plugins/loom/skills/loom-plan/SKILL.md` lines 155-175): derives the panel via `Bash("guild derive-panel --files=/tmp/loom-plan-<slug>.md")` (line 163) and runs `/guild-validate` (line 168). For a markdown plan the fallback rules yield `evaluator-contract-fit` alone (lines 164-166). It does NOT use `plan-*` engineers — the PLAN-authoring skill is a solo grill-me interview gated only by the evaluator.
- `loom-revise-plan` (`plugins/loom/skills/loom-revise-plan/SKILL.md` line 142): invokes `/guild-validate` with a fixed plan-shape-coherence rubric; no `derive-panel`, no `plan-*` engineers.
- `loom-archive` auto-mode (`plugins/loom/skills/loom-archive/SKILL.md` lines 109-124): runs TWO panels in parallel — a Plan panel via `/guild-plan` with the full registered roster (lines 113-117) and an Evaluator panel via `bin/guild derive-panel` + `/guild-validate` (lines 118-123). This is the only orchestrator besides the ev-loops that consumes `plan-*`.
- `loom-research` (`plugins/loom/skills/loom-research/SKILL.md`): step 4 "Plan composition per shift" (lines 174-198) resolves the full plan roster via `Glob(.claude/agents/plan-*.md)` (line 178) and invokes `/guild-plan` per shift; step 5 "Fact-check pass" (lines 219-240) invokes `/guild-validate` with `agents=evaluator-contract-fit`. So it consumes `plan-*` and a single evaluator, never `research-*`.

The gap, stated plainly: across all seven orchestrators, `research-*`, `implementer-*`, and `fixer-*` are STAFFED-BUT-UNWIRED — agent files exist (Finding 1) but no orchestrator spawns them. `plan-*` is wired only at the design/plan seam (ev-loop Plan step, loom-archive, loom-research). `evaluator-*` is the only phase wired everywhere it should be, via `derive-panel` + `/guild-validate`.

## Finding 4 — Where each unwired phase should plug into the RPI loop

The RPI loop is research -> plan -> implement -> evaluate -> fix. Mapping the unwired phases to seams (this is a design recommendation grounded in the current seams, not yet-shipped behavior — flagged as hypothesis):

- `research-*` should plug into the RESEARCH seam. Today `/loom-research` runs its shift panels with `plan-*` engineers (Finding 3); the natural alignment is to run `research-*` for the research-shift panels and reserve `plan-*` for the plan phase. The ev-loop inner-RPI accept path (which spawns `/loom-research`) would then transitively get `research-*` participation. This is the cleanest single rewire: change one glob in `/loom-research` step 4 from `plan-*` to `research-*`. (Hypothesis: needs confirmation that `research-*` agents return a research-shaped contribution rather than a plan-shaped one — their bodies were not read in depth here.)
- `implementer-*` should plug into the IMPLEMENT seam — the actual code-writing step inside an ev-loop unit (currently the orchestrator does the writing itself; there is no implementer spawn). The "Specialist-evaluator gate-then-review" section already names the pairing (`evaluator-css-architecture` + `implementer-css-architecture`); wiring it means the loop delegates the write to the domain implementer when the panel is domain-specialized.
- `fixer-*` should plug into the FIX seam — the "iterate on flagged findings" step (ev-loop-interactive step 4 "Iterate or commit", lines 383-387). Today the orchestrator addresses flagged findings itself; the fixer phase exists to take a flagged-finding packet and produce the minimal remedy (axes.toml line 118: fixer `default_personality = "pragmatist"`, "minimal fix to the flagged findings").
- `evaluator-*` is already at the EVALUATE seam; no rewire needed beyond the registry refresh.

## Finding 5 — Participate-vs-recuse: how panel composition is decided today

There are two distinct mechanisms today, and neither is a general cross-phase "who participates" layer.

### Mechanism A — `guild derive-panel` (composition, evaluator-only)

CLI signature and behavior, from `plugins/guild/cli/verbs/guild/derive-panel.ts`:

- Input: `--files=<csv>` OR stdin (newline-delimited). The verb reads ONLY these two sources — `derivePanelVerb` (lines 302-319) looks for an arg starting with `--files=` and otherwise reads `ctx.stdin`; there is no positional-arg branch, so a positional file list is silently ignored and the verb falls through to baseline-only output. (This matches the repo-memory note: positional args silently baseline.)
- Output: a comma-separated evaluator list on stdout, always seeded with the baseline `evaluator-contract-fit` (`BASELINE` constant, line 24; added to the set in `derivePanel`, line 288).
- Routing: file-type -> evaluator mapping is parsed at runtime from `plugins/commons/docs/PANEL-COMPOSITION.md` (`SPEC_PATH`, line 23; `loadSpec`, lines 203-224), with a hardcoded `FALLBACK_RULES` / `FALLBACK_PRECEDENCE` defensive backup (lines 151-191) used only when the spec is unreadable. Matching is specificity-ranked (`specificity`, lines 68-72; `matchPath`, lines 226-240). Output is ordered by the spec's precedence list (`derivePanel`, lines 293-299).
- The react over-include history is the `gateReact` function (lines 269-281): a non-JSX `.ts` file only keeps `evaluator-react` if it actually imports react/react-dom (`REACT_IMPORT` regex, lines 247-248); `.tsx`/`.jsx` keep it unconditionally; an unreadable file keeps the lens (never strip what you cannot disprove).
- Callers: `ev-loop-interactive` and `ev-loop-confidence` (unit-loop step 3, via § Panel auto-derivation), `loom-plan` (step 6), and `loom-archive` (auto-mode evaluator panel). All pass `--files=`.

Crucially, `derive-panel` is **evaluator-only**: its entire output vocabulary is `evaluator-*` names (the regex at line 112 matches `evaluator-[\w-]+`; the baseline and fallbacks are all `evaluator-*`). It has no notion of research / plan / implementer / fixer phases. It does not generalize.

### Mechanism B — self-recusal (per-agent, runtime)

The "who actually participates" decision after spawn is a per-agent self-declaration, not a composition-layer choice. `/guild-validate` (`plugins/guild/skills/guild-validate/SKILL.md`) parses each evaluator's `VERDICT:` and emits an `agent_signals[]` entry per spawned agent (output shape lines 92-100) with `outcome: gated | recused | operator-judgment`. A `recused` outcome (the agent declared its domain non-applicable) is non-gating — an all-approved-plus-recused panel is still `approved` (lines 191-193). `/guild-plan` mirrors this for engineers: the skill spawns the whole roster and "trusts each engineer to declare inapplicability" (loom-research SKILL.md lines 178-183; guild-plan does no domain filtering, SKILL.md lines 89-94). So participate-vs-recuse is split: derive-panel decides the evaluator candidate set up front (composition); every other phase spawns the full roster and relies on the agent recusing itself at runtime.

### What a cross-phase participate-vs-recuse layer would need that does not exist today

- A phase-aware composition verb. `derive-panel` is hardwired to `evaluator-*`; a generalized layer needs to emit `research-*` / `plan-*` / `implementer-*` / `fixer-*` candidate sets for a given (phase, artifact) pair. Today the non-evaluator phases get NO composition step — they fall back to full-roster glob + self-recuse, which is cheap to spawn but spends budget on every off-topic agent.
- A shared phase x domain participation source of truth. `axes.toml` already encodes which domains occupy which phases (`plugins/guild/modes/axes.toml` lines 15-60: e.g. `a11y` occupies all five phases; `abstraction` / `composition` / `performance` / `substrate` occupy only `research` + `plan`; `css-architecture` / `nextjs` occupy only `reviewer` + `implementer` + `fixer`). This table is the natural input a phase-aware derive layer would read — it already says, declaratively, which domains can participate at which phase. No runtime consumer reads it for participation decisions today; only the codegen reads it.
- A unified recusal signal across phases. `/guild-validate` surfaces `agent_signals` with recusal; `/guild-plan` does not return a structured recusal signal (its output shape, guild-plan SKILL.md lines 64-74, has `sections` + `contradictions` but no per-engineer recusal field). A cross-phase layer wanting "who recused at every phase" needs `/guild-plan` to emit the same `agent_signals` shape.

## Finding 6 — RPI-alignment state (guild-hirefest, PR #186 era): shipped vs aspirational

Confirmed SHIPPED in the working tree:

- whiteboard -> plan rename: `plan-*` files exist (Finding 1), zero `whiteboard-*` on disk, and the coordination skill is `plugins/guild/skills/guild-plan/` (not `guild-whiteboard/`); the skill body says "Spawns one or more `plan-*` engineer agents" (`guild-plan/SKILL.md` line 21).
- research phase staffed: 10 `research-*` files exist (Finding 1); axes.toml lists `research` as a phase (line 98) and most domains include it (lines 16-60).
- reviewer = evaluator alias: the axis phase is named `reviewer` (`axes.toml` line 108, `default_personality = "skeptic"` "matches existing panel.manifest.toml — every reviewer combination is skeptic-led") but the compiled agent files are named `evaluator-*` (Finding 1). The reviewer phase compiles to the evaluator-prefixed cohort; the alias is real and lives in the axis-vs-output naming.
- operator-judgment-required escalation: present in 10 of 46 agent files under `plugins/guild/agents/`. The verdict token is also a first-class output in `/guild-validate` (output shape line 71 includes `"operator-judgment-required"`; verdict-precedence rule lines 185-193 makes it the strongest non-approval signal). Partial coverage (10/46) suggests it is wired into the escalation-capable cohort (reviewer/evaluator), not every agent — worth confirming against the specific files in the plan.

ASPIRATIONAL / not-yet-true at runtime: everything in Finding 2 — the live registry still resolves the pre-hirefest `whiteboard-*` names with no `plan-*` / `research-*`, so the shipped-on-disk alignment is invisible to any orchestrator spawning from the live roster until the marketplace mirror is refreshed.

## Finding 7 — Invocation seams: how orchestrators spawn guild agents

Three distinct seams, in increasing invasiveness:

- Via the guild coordination SKILLS (the dominant seam). Orchestrators invoke `/guild-plan` and `/guild-validate` through the Skill tool; those skills compose `/guild-spawn` internally and never let the orchestrator touch the Agent tool directly (`guild-validate/SKILL.md` Rules line 285: "Compose `guild-spawn`. Do not call the `Agent` tool directly."; `guild-plan/SKILL.md` line 32). The contract passed is the three-section evaluation packet for `/guild-validate` (Contract / Artifact / Original ask — `guild-validate/SKILL.md` line 42, dense-packet shape in the ev-loops lines 324-371) and a `brief` + `plan=<path>` for `/guild-plan` (`guild-plan/SKILL.md` Inputs lines 42-58). Wiring a new phase through this seam means adding a phase-shaped coordination skill (or extending `/guild-plan` to accept any phase roster) — moderately invasive but the layering already supports it.
- Via direct Agent-tool spawn (the inner-RPI seam). `ev-loop-interactive` spawns `/loom-research` and `/loom-revise-plan` via the Agent tool with `subagent_type=loom-research` / `loom-revise-plan` (SKILL.md lines 24-28, 496-507). This is a skill-as-subagent spawn, not a guild-agent spawn, and is the only place an orchestrator uses the Agent tool directly. `allowed-tools` for the ev-loops includes `Agent` (interactive line 12, confidence line 13); the loom skills' `allowed-tools` do NOT include `Agent` (loom-research line 16: `Read, Write, Bash, Skill, AskUserQuestion`), so loom skills cannot spawn subagents directly — they must go through `/guild-plan` / `/guild-validate`.
- Via the guild CLI (the composition seam, read-only). `bin/guild derive-panel` and `guild recipe <name>` (ev-loops § Plan, recipe citation, interactive lines 132-142) are Bash calls that return data the orchestrator feeds into a skill invocation. `guild recipe` resolves a named panel recipe to `{name, members}`; `axes.toml` defines 7 recipes (line 124, `# ---------- recipes (7) ----------`). This seam is the least invasive place to add phase-aware composition: a `guild derive-panel --phase=<p>` extension would slot in beside the existing evaluator-only call without touching any skill body's control flow.

## Implications for the plan (synthesized, non-binding)

- The cheapest first wire is `/loom-research` swapping its shift-panel glob from `plan-*` to `research-*` — one line, aligns the research phase to its seam, and transitively reaches the ev-loop inner-RPI path.
- The participate-vs-recuse layer should generalize `derive-panel` to be phase-parameterized and read `axes.toml`'s `phases` lists as the participation source of truth, while preserving the runtime self-recusal signal — and `/guild-plan` should be extended to emit the same `agent_signals` recusal shape `/guild-validate` already does.
- None of the source wiring can be validated by live-spawn until the marketplace mirror is refreshed past the guild-hirefest merge (Finding 2). The plan should sequence a registry-refresh / live-spawn-smoke gate before any phase claims runtime-done.
