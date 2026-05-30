# Insights — what's tripping us up (May 2026)

**Window:** 2026-05-10 → 2026-05-30 (34 of 56 sessions analyzed · 389 messages · ~175h · 114 commits)
**Source:** the 2026-05-30 `/insights` report cross-referenced against this repo's `memory/` papercut log, with same-day live friction folded in.
**How to read this:** consolidated from three independent agent takes — codenamed *main*, *nebula*, and *boulder* — that each analyzed the same report in parallel. Where the three converged, treat it as high-confidence: independent agents flagging the same thing is signal. Where they disagreed, the dissent is preserved deliberately — it marks the recommendations worth validating before adopting. Per-take attribution is inline.

## What's working (nebula)

- **Phased PR ship-and-resume loops.** Entire multi-phase projects driven on a "keep going" cadence — each phase executes, opens a PR, auto-resumes after merge. The Research → Plan → Implement discipline lands fully-validated, tested, stacked PRs phase after phase (linear-loom, guild-matrix-precompile, PR-flow).
- **Adversarial plan-grilling before code.** `grill-me` decision interviews and antagonist panels harden plans before implementation; resolving every open decision branch up front produced master plans that passed panels on the first execution pass.
- **Root-cause diagnosis, then remediation scaffolding.** When something drifts, diagnose the true cause and scaffold a structured fix project rather than patching symptoms (commons divergence traced to an unenforced gate; missing loom skills traced to an installed-copy-vs-source-tree mismatch).

## What's tripping us up

Ranked by cost. Each item notes which takes raised it.

### 1. Output-token / overload crashes — highest cost (all three)

Roughly a third of the month's sessions (nebula counts ~11) were left unanalyzable because responses exceeded the output maximum during long `ev-run` / `loom` runs — whole transcripts wiped — with API 529 (Overloaded) errors fragmenting iterative loops on top.

**Dissent (boulder):** the "500 output-token" figure is implausibly small for normal Claude Code output — sessions in this same window produced far larger responses without tripping it. It more likely points to a misconfigured `max_tokens`, a specific call path, or an analyzer artifact than to a general "responses are too long" problem. The remedy diverges accordingly: raise a budget (config bug) vs. write large deliverables to files and summarize in chat (a real cap). **Diagnose which before changing habits.**

**Direction:** stream progress per-phase, write large deliverables to files incrementally, add overload retry-with-backoff in the long loops — *and* confirm the cap is real first.

### 2. "Looks green, breaks later" (all three, three lenses)

The single most-corroborated class — each take found it independently, which is why it's the one to act on:

- **Harness vs runtime (main).** vitest's full TS transform passes where `node *.ts` strip-only throws — a JSDoc `*/` closing a block comment early, a `constructor(public x: T)` parameter property. Fixture tests pass while the real shipped artifact is broken (the jelly template's literal `{{...}}`). Types + grep read clean while a schema-narrowing straggler survives to `writeManifest`'s round-trip verify.
- **Bugs surface at the gate (nebula).** Moving `axes.toml` broke fragment resolution (double `modes/`) and a relative import; a hardcoded `CANONICAL_PHASES` array omitted `fixer` → three failures in `axes-schema.test.ts`.
- **Duplicated truth drifts (boulder).** `CANONICAL_PHASES` hardcoded twice (including a repeat on 2026-05-30, when `fixer` was authored but the list wasn't updated — green until a later unit *referenced* the phase); `PHASE_PREFIX` duplicated across `derive.ts` / `recipe.ts`, kept in sync by hand. Boulder's thesis: friction concentrates at **integration seams where two copies of a truth drift**, caught late by a gate rather than prevented.

**Direction — two complementary moves:**
- *Structural (boulder, preferred):* derive-don't-duplicate — derive `CANONICAL_PHASES` from the `[axis.phase.*]` keys, collapse the dual `PHASE_PREFIX`. Deletes the class rather than catching it after the fact.
- *Gate (main):* a `node`-real CI smoke test that executes the actual bin shims / entrypoints (not just vitest) catches both the strip-only breaks and the fixture-masking class in one move.
- **Dissent (boulder) on the report's hook suggestion:** a `PostToolUse` hook running the full suite on *every* edit is too noisy — it would fire dozens of times in a single phase. Prefer a narrow **once-per-dispatch** preflight (cache-vs-working-tree freshness; `--check` after any `modes/` or schema-file relocation).

### 3. Orchestration preconditions failing at dispatch (all three)

The substrate assumes capabilities that aren't there, discovered mid-run:

- `/goal` is a native built-in that **no skill can invoke** — structurally killed the jelly-run design (main, boulder).
- `loom-research` auto-spawn failed twice (unregistered subagent + `disable-model-invocation`); `loom plan` seeded 1 phase instead of 4.
- `ev-loop-interactive`'s whiteboard glob missed plugin-cache engineers in consumer projects (main).
- **Live instance (boulder, 2026-05-30):** the cached `guild` CLI on PATH predated the `compile` verb (`unknown-verb: compile`), and the Agent registry was a pre-flatten snapshot — newly-generated agents weren't spawnable until a cache re-sync + restart. A preflight existed (`loom doctor`) but probes only loom, so guild's skew passed unchecked.

**Direction:** validate subagents / parsers / branch-stacking *and* cache-vs-working-tree freshness before invoking multi-phase loops; in plugin/skill debugging, confirm source-tree vs installed-copy and show the resolved path.

### 4. Authoring-repo vs consumer-project path resolution (main)

Works where authored, breaks where it runs: `axes.toml`'s double `modes/`; `guild derive-panel`'s cwd-relative spec lookup silently hitting the fallback panel in consumer projects; `loom pr open` not forwarding `--base`, so stacked PRs target `main`. A cousin of #2 — both are "the development context lied about the real one."

### 5. Evaluator-panel brittleness (main)

A paraphrased `VERDICT:` mid-line reads as a parse failure (the aggregator anchors on `VERDICT:` at line start); evaluators confidently miscount byte / concatenation math and emit false positives; packets implying multiple commands blow the turn budget with no verdict emitted; `derive-panel` bolts `evaluator-react-api` onto pure-Node `.ts` files with no JSX. **Direction:** tighten the contract (VERDICT on its own line, guaranteed verdict on early termination, "one spot-check then emit"); gate react-api derivation on JSX / react-import presence, not bare `.ts`.

### 6. Human-side: declaring done before demonstrating done (main)

Most memorably claiming two probes had "fired externally with nothing to do," then getting caught by the Stop hook and having to actually go demonstrate them.

## Through-line (boulder, generalized)

Most of these are integration-seam / authoring-vs-runtime failures, not reasoning failures. The verify-and-correct loop reliably catches them — which is why they read as tolerable rework rather than disasters — but it catches them *late*, after a failed spawn, a test-count drop, or a `--check`. **The lever is moving the catch earlier:** derive-don't-duplicate, a once-per-dispatch preflight, a `node`-real smoke test.

## On the horizon (nebula)

- **Fully autonomous multi-phase loops** — drop the manual "keep going": auto-resume on merge, run the next phase, clear antagonist panels, pause only at genuine strategic forks.
- **Parallel agents across independent phases** — fan out onto isolated worktrees with a coordinator stacking PRs in dependency order. (Note: that is exactly what produced *this* three-take panel.)
- **Self-healing test-driven iteration** — treat the suite and `--check` gates as a fitness function; never declare done on a red gate.

## The hopeful read (main)

A large share of the shape-3 and shape-4 papercuts were already found-and-closed in the `substrate-followups` sweep (loom doctor exit code, phase update PR-flags, griot capture catalog-gap, revise-plan manifest delta). The dogfooding loop earning its keep: most of what trips us up is the substrate telling us where it's thin, and the fixes compound.

---

*Consolidated 2026-05-30 from three independent `/insights` analyses — main, nebula, boulder. Convergence = high-confidence; preserved dissent = validate-before-adopting.*
