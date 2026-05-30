# Shared Insights — what's tripping us up

**Window:** 2026-05-10 → 2026-05-30 (34 of 56 sessions analyzed · 389 messages · ~175h · 114 commits)
**Source:** the `/insights` report (`report-2026-05-30-120736.html`) cross-referenced against this repo's `memory/` papercut log.
**Scope:** this file captures the *friction* half of the report — the recurring failure shapes. The "what's working" half (RPI discipline, merge-and-continue autonomy, grill-me design pressure-testing) lives in the report itself.

---

Cross-referencing the statistical view (the report) against the lived view (the memory papercut log), the month's friction sorts into five recurring shapes. Several of them turn out to be the same underlying bug wearing different hats.

## 1. Output-token and overload crashes ate the most wall-clock

The largest source of lost time by raw volume: roughly a third of the month's sessions show up as *nothing but* "500 output token maximum" or `529 overloaded` errors, with zero recoverable content.

Mostly self-inflicted. The long `ev-run` / `loom` loops stream big plans, full file dumps, and long retrospectives in single responses and hit the output ceiling.

**Mitigation:** write progress and long deliverables to files incrementally; keep chat responses tight; add retry-with-backoff on overload in the long-running loops.

## 2. "Green in the harness, broken in the real runtime"

The most insidious shape, because it keeps returning in new costumes:

- **vitest passes (full TS transform) but `node *.ts` throws (strip-only).** Bit us twice — a JSDoc `*/` sequence closing a block comment early, and a `constructor(public x: T)` parameter property rejected by Node's strip-only loader.
- **Fixture tests pass but the real shipped artifact is broken.** The jelly template shipped a literal `{{...}}` and was broken for *every* consumer project; only the dogfood run caught it.
- **Types + grep read clean but a schema-narrowing straggler survives.** Caught only by `writeManifest`'s round-trip write-verify at write time.

**Through-line:** the validation layer has blind spots exactly where the test environment diverges from the real runtime. Every time we trusted "green," the real artifact was the broken thing.

**Highest-leverage fix:** a `node`-real smoke test in CI (execute the actual bin shims / entrypoints, not just vitest) would catch both the strip-only breaks *and* the fixture-masking class in one move.

## 3. Orchestration preconditions that fail at dispatch

The custom substrate assumes capabilities that aren't there, and we discover it mid-run:

- `/goal` is a native built-in that **no skill can invoke** — structurally killed the jelly-run design.
- `loom-research` auto-spawn failed twice (unregistered subagent type + `disable-model-invocation`).
- `loom plan` seeded 1 phase instead of 4.
- The `ev-loop-interactive` whiteboard glob missed plugin-cache engineers in consumer projects.

Each forced a mid-run pivot or a manual rescue.

**Mitigation:** validate preconditions before dispatch rather than discovering them at the call site.

## 4. Authoring-repo vs consumer-project path resolution

Things that work where we author them and break where they actually run:

- Moving `axes.toml` produced a double `modes/modes/` fragment path.
- `guild derive-panel`'s spec lookup is cwd-relative, so consumer projects silently hit the fallback panel.
- `loom pr open` doesn't forward `--base`, so stacked PRs target `main`.

A cousin of shape #2 — both are "the development context lied about the real one."

## 5. Evaluator-panel brittleness

- A paraphrased `VERDICT:` mid-line reads as a parse failure; the aggregator anchors on `VERDICT:` at line start.
- Evaluators confidently miscount byte / concatenation math and emit false-positive flags.
- Packets implying multiple commands blow the turn budget with no verdict emitted.
- `derive-panel` bolts `evaluator-react-api` onto pure-Node `.ts` files with no JSX.

**Mitigation:** tighten the evaluator output contract (VERDICT on its own line, guaranteed verdict on early termination, "one spot-check then emit" framing); gate react-api derivation on JSX / react-import presence, not bare `.ts`.

## And one human-side one

Declaring *done* before *demonstrating* done — most memorably claiming two probes had "fired externally with nothing to do," then getting caught by the Stop hook and having to actually go demonstrate them.

---

## The hopeful read

A large share of the shape-3 and shape-4 papercuts were already found-and-closed in the `substrate-followups` sweep (loom doctor exit code, phase update PR-flags, griot capture catalog-gap, revise-plan manifest delta). That's the dogfooding loop earning its keep: most of what trips us up is the substrate telling us where it's thin, and the fixes compound.
