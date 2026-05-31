# Whiteboard: Phase 1 — Dispatch preflight & freshness gate

> Round 1 panel: 8 `guild:whiteboard-*` engineers, run in parallel via `/guild-whiteboard`.
> Brief: design the three Phase-1 deliverables — (1) agent-cache-vs-source skew signal,
> (2) node-real CI smoke, (3) once-per-dispatch freshness preflight. Sections below are
> each engineer's verbatim contribution.

## Round 1

### From guild:whiteboard-substrate-engineer

## Substrate-shape perspective: freshness gate as a read-only fold over already-committed hashes

**Recommended architecture in one line:** Don't invent a new skew signal — `guild compile --check` already *is* the content-hash freshness fold, and the committed `.cache.toml` already travels into every install mode; wrap a thin install-mode-agnostic `freshness` reporting verb around it (plus an `agents/`-vs-`.cache.toml` cross-check the current `--check` is missing), expose the node-real smoke as a CI invariant test extending the one that already exists, and wire all of it as a single advisory Tier-3 line in ev-run's existing preflight ladder — not a new hook, not a new write path.

### Why this is fundamentally a CRUD-vs-orchestration question first

The brief frames three deliverables as if they're three new mechanisms. The substrate already has two of the three primitives built. The real design work is *placement and composition*, not invention.

**Deliverable 1 (skew signal): the content hash already exists and is already committed.** `guild compile --check` (compile.ts:257) folds `axes.toml` + fragments + `.cache.toml` + on-disk agent bodies into a six-category drift report, SHA-256 throughout, zero LLM calls, zero writes. And `.cache.toml` is *committed source* (`plugins/guild/agents/.cache.toml`) that ships next to the agent `.md` files. That dissolves the install-mode-flakiness anxiety: you compare *cache-against-its-own-colocated-agent-bodies*, both in the same directory in every install mode. The compare is **install-mode-invariant by construction** because it never crosses an install-mode boundary. That's the non-flakiness property the brief demands, and it's free. mtime correctly rejected (clock/clone/checkout-order false-positives); content hash is robust *because the cache is colocated with what it certifies*.

The real gap: **`--check` validates `agents/` bodies against `.cache.toml`, but does not validate that the Agent registry the runtime spawns from matches `agents/`.** The pre-flatten-snapshot registry break is a *third* surface — Claude Code's loaded agent set — that neither `--check` nor `detectGuildSkew` covers. Be honest: that surface is only *partially* observable from a CLI. Best the substrate can do: detect when `agents/*.md` changed since last compile (`cells_with_output_drift` + `cells_missing_on_disk` already do) and *advise a restart*. Don't oversell as "detects registry skew" — it detects "agents/ moved, your loaded registry is probably stale, restart."

**Deliverable 2 (node-real smoke): the invariant test already exists — extend it.** `plugin-bin-shims.test.ts:185-223` already has `real-entry strip-only loader smoke`: execs every real `bin/<plugin>` shim under real node, asserts no `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`, proves the gate bites with a parameter-property footgun. The gap is **coverage breadth**: it execs each plugin's top-level entry once with no args; a footgun in a lazily-required verb module won't be hit. The substrate-correct extension: one invariant test that **globs every `cli/**/*.ts` and imports each under real `node --experimental-strip-types`**, asserting no strip-only error. Belongs in `plugins/commons/cli/*.test.ts` (marketplace-invariant tier), rides `npm test`. If per-file spawns are too slow, fold into one child process that `import()`s all of them — same shape as the existing single-exec-per-shim.

**Deliverable 3 (wire as preflight): the ladder already exists in ev-run — add a rung.** ev-run has a two-tier preflight (SKILL.md:35-68): Tier 1 presence, Tier 2 format-skew (`loom doctor <slug>`). Freshness is **Tier 3**, inheriting the same advisory posture and "surface verbatim, switch to repo-local node, do not stop" remedy. Placement ruling:
- **It is guild's freshness, so the verb is guild's.** Don't deepen loom's cross-seam leak by moving guild's hash logic into loom. loom doctor's existing guild probe *calls guild's CLI* (via `queryGuildVerbs`). Add a second guild probe to the `checkGuildSkew` site that runs `guild compile --check` and folds `ok:false` into a `guild-codegen-drift` advisory issue. loom stays preflight orchestrator; guild owns its freshness CRUD.
- **Belongs in commons/cli/lib?** No — freshness is guild-specific (codegen'd agents from `axes.toml`). loom/griot/ev have no compile cache. Hoisting to commons would mirror a guild concern into three plugins that can't use it.
- **Inline in loop body?** No. CRUD read in the verb, composition in the skill.

### Once-per-dispatch is right; the boulder dissent is correct

A PostToolUse hook running freshness on every edit pays *write-time cost* for a *dispatch-time concern*. The skew that matters is established at session/dispatch boundary, not mutated by individual edits. Once-per-dispatch matches cost to value: it runs when a multi-phase loop is about to start. "Is once enough?" — yes, the failure mode is a *standing* skew condition, fully caught by one check at the gate.

### Idempotency / parallel-safety — clean by construction

All three deliverables are *read-only*. `guild compile --check` writes nothing. The smoke imports and exits. The preflight reads exit codes. **No new write path** — nothing to make append-only, nothing to race. Design rule for the next unit: **the preflight detects and advises; it never auto-recompiles.** Auto-remediation is a write path (two sessions racing `agents/*.md` + `.cache.toml` writes) and belongs to an explicit operator-invoked `guild compile`, not a preflight.

### Family-shape consistency

New issue joins as `guild-codegen-drift` (advisory, `severity:'warning'`), matching its sibling `guild-cache-skew`. Don't name it `compile-stale`/`agents-out-of-date`; match the `guild-<surface>-<condition>` shape. ev-run tiers are a family: Tier 1 presence, Tier 2 format-skew, Tier 3 codegen-freshness.

### The one thing I'd push back on

If anyone proposes making the gate *blocking*: resist. Tier 2's rationale nailed it — a false-positive hard-stop trains bypass, makes the gate decorative. A dev checkout with intentionally-uncommitted `agents/` edits would false-positive constantly. Advisory + "switch to repo-local node" is the posture that survives real operators. Enforcement is what CI's `npm run check` is for.

**Load-bearing files:** `plugins/guild/cli/verbs/guild/compile.ts` (`check()` line 257, `output_hash` stamp), `plugins/guild/cli/verbs/guild/compile-cli.ts` (`--check` line 185, read-only), `plugins/guild/agents/.cache.toml` (committed, colocated → install-mode-invariant), `plugins/loom/cli/verbs/loom/doctor.ts` (`checkGuildSkew` line 126, the pattern to extend), `plugins/commons/cli/plugin-bin-shims.test.ts` (smoke to broaden, line 185), `plugins/ev/skills/ev-run/SKILL.md` (two-tier ladder lines 35-68).

### From guild:whiteboard-testing-strategy

## Testing strategy: Phase 1 freshness gate

**Recommended shape in one line:** Three tiers, each already partly built — keep skew-detection logic as pure unit tests (true-positive AND true-negative, injected fixtures), keep strip-only divergence as a *real-shim spawn* integration test that must exec the bin shim (never a vitest re-import), and add exactly ONE end-to-end test that spawns the real preflight against a deliberately-stale on-disk fixture tree. Resist integration-testing what's already a clean pure function.

### Most of this already exists, and the existing shapes are mostly right

- `detectGuildSkew(sourceVerbs, resolvableVerbs)` (`doctor.ts:83`) is **already a pure function**; tests (`doctor.test.ts:101-123`) cover both directions. Correct tier for D1's *logic*. Don't rewrite.
- `check()` (`compile.ts:257`) is **already a pure drift detector**, injected readers; tests (`compile.test.ts:253-446`) assert true-positive per category AND true-negative (`fresh compile → --check ok=true`, line 273). That IS the "deliberately-stale cache is detected" exit criterion at the unit tier.
- `real-entry strip-only loader smoke` (`plugin-bin-shims.test.ts:185-223`) **already spawns the real bin shim**, asserts `status===0` AND a planted parameter-property footgun yields `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. That is D2, done honestly.

So the real question isn't "what do we build" — it's **"where is each existing test masking, and what wiring-level gap survives?"**

### Tier choice per deliverable

**D2 (strip-only smoke):** the only valid shape is **shell out to the real runtime path.** The existing test spawns the real `bin/<plugin>` shim (`spawnSync(realShim,…)` line 189) → `exec node ENTRY` → strip-only loader. A vitest `import()` would be the fixture-masking trap. Caveat: it asserts `status===0` with **no args** (help path) — exercises the import-graph parse (the strip-only risk) but not verb dispatch. That's correct: the footgun aborts at *load*, before any verb runs. Keep the negative assertion (`not.toMatch(/ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX|SyntaxError/)`) + `status===0`; don't snapshot `--help` text.

**D1 (cache-vs-source skew):** two risks, one name. *Verb-skew* (cached guild predates compile) → `detectGuildSkew` unit tests. *Source-hash skew* (committed body ≠ source fragments/cache) → `check()` unit tests. Don't "promote" these to CLI-spawn integration tests — pays spawn cost for zero boundary signal.

### The gap that survives: the spawn/wiring seam

Both pure functions are well-tested. The thin part is the **glue that feeds them real I/O** — exactly where "looks green, breaks later" lives:

1. `queryGuildVerbs(cmd,args)` (`doctor.ts:106`) parses the verb list out of an *unknown-verb error's `candidates` array*. If guild's error-payload shape changes, the probe silently returns `null` and skew detection goes dark (false negative — worst direction). Today only the degrade-to-null path is tested. **Missing test:** spawn the *real source* `guild.ts` with a bogus verb, assert `queryGuildVerbs` extracts a non-empty plausible verb list incl. `compile`. One integration test, defends the parse-contract boundary.
2. The `check()` wiring into the preflight — proven pure, unproven that the preflight **invokes it against the real on-disk tree and fails loud.**

### The exit-criterion test: deliberately-stale-cache fixture, deterministic

The honest version spawns the real preflight against a real stale tree:
- `mkdtempSync` a temp tree. Write minimal `axes.toml` + fragments, run real `guild compile` once → matching `.cache.toml` + `.md`. **Clean → assert preflight exits 0 (true negative).**
- Mutate exactly one input (one fragment byte, or one emitted `.md`). Re-run. **Assert non-zero + names the drifted cell (true positive).**

Determinism: pin `fusedAt`/`promptHash` (existing compile tests already pin `fusedAt`, `compile.test.ts:101`); mutation is a *byte* change to a known file; `sha256` is content-addressed. No sleeps, no wall-clock, no port. Parallel-safe — whole world is one `mkdtemp` dir. **Both directions in one fixture, flipped by one byte.**

### Fixture vs factory

Lean factory: `makeCompiledTree({fragments, fusedAt})` returning paths + a `tamper(cellId, axis)` mutator. The cache schema is *evolving* (`prompt_hash` added in U2) — a hardcoded `.cache.toml` fixture would rot. Assert *against* the drift verdict (stable: name a cell, name an axis); *depend on* the cache bytes (volatile: let the factory build them). Keep the tiny `axes.toml` a literal fixture.

### What NOT to test

- Don't assert exact skew warning copy — assert `code`, `severity`, and that the missing verb name appears; don't snapshot the sentence.
- Don't re-test the comparator through the CLI.
- Don't re-test Node-version-floor parsing (`plugin-bin-shims.test.ts:111` covers it).

### Fixture-masking risk, named

The sharpest danger: **the smoke becoming the very fixture-mask it exists to catch.** (1) **Re-import instead of re-exec** — if anyone "simplifies" `spawnSync(realShim)` to `await import(entryPath)`, it re-enters the transform path and goes permanently green. The honesty invariant is structural: *cross a process boundary into real node, not a module boundary into vitest's loader.* Worth a code comment. (2) **Dummy-entry drift** — the shim-mechanics tests use a dummy `cli/<plugin>.ts` (`makeFakePluginTree` line 48); those must NOT be the strip-only smoke (no real import graph). Keep the real-shim-against-real-entry separation explicit.

### Three risks, cheapest defense

1. Shipped entry has a strip-only footgun → integration: spawn real bin shim, exit 0 + no error. (Exists; protect spawn-not-import.)
2. Cache/registry drifted from source → unit: `detectGuildSkew` + `check()`, both directions. (Exists; don't promote.)
3. Preflight wired but inert → e2e: real preflight against one-byte-mutated stale temp tree, non-zero + named cell; exit 0 on clean. (**The gap.** One test, both directions, deterministic.)

**Files:** `plugins/loom/cli/verbs/loom/doctor.ts` (`detectGuildSkew` 83, `queryGuildVerbs` 106, `checkGuildSkew` 126), `doctor.test.ts:101-141`, `plugins/guild/cli/verbs/guild/compile.ts` (`check()` 257), `compile.test.ts:253-446` (pinned-`fusedAt` 101), `plugins/commons/cli/plugin-bin-shims.test.ts:185-223`.

### From guild:whiteboard-skeptic

## Skeptic — Phase 1 dispatch preflight & freshness gate

**Top concern: the freshness check inherits the exact staleness it's built to detect — the verb-set probe is a coarse proxy that goes quiet precisely when the cache is "new enough to have `compile` but old enough to emit wrong agents," and a probe that lives in the cached binary can't see its own lag. Without a content-level signal and an out-of-band bootstrap, this gate will train operators to trust a green that means nothing.**

### 1. The verb-set proxy under-detects the cache skew that actually bit you

`detectGuildSkew` (doctor.ts:83) compares *verb names*. That catches exactly one shape — the `compile`-didn't-exist case from ADR-0006. It is structurally blind to: a cached `guild` that *has* `compile` but ships stale `compile/compose.ts` or stale fragment-resolution → same verb set, divergent output, probe returns `null`, doctor green, codegen runs on stale logic (the world Phase 1 ships *into*); and the cached *agent `.md` bodies* being stale vs `axes.toml` + fragments. The remedy exists and isn't wired in: `guild compile --check` (compile.ts:257), zero LLM. **The content-level signal should be `guild compile --check`, not a verb-name set-difference.** Verb parity = *availability* check; `--check` = *correctness* check.

### 2. The guard needs guarding — `checkGuildSkew` queries `'guild'` off PATH, the stale binary itself

`checkGuildSkew` (doctor.ts:126-132) spawns `queryGuildVerbs('guild',[])` — the resolvable binary. If the cache is so stale it predates the probe's error shape (or crashes), `queryGuildVerbs` catches and returns `null`, `checkGuildSkew` returns `null` → **no issue, exit 0, green.** The deepest staleness is indistinguishable from "off-repo, gracefully skipped." Remedies: distinguish *absent* (skip, fine) from *present-but-unqueryable* (itself a skew signal — emit `warning`, don't return `null`); bootstrap the check from **source** (`node plugins/guild/cli/guild.ts`, per ADR-0006), never from the artifact under test. The freshness gate has to be the one thing that never trusts the cache.

### 3. False-positive stories that train operators to `--no-verify`

The moment you add `--check` content hashing, you inherit its strict false-positive surface: **dev editing a fragment mid-session** (source moves — the gate fires on the normal inner-loop); **symlinked/dev installs where cache IS source** (install-mode detection is load-bearing — wrong remedy text half the time); **`.cache.toml` legitimately behind on a feature branch** (intentional in-progress). Remedy: a **severity contract tied to install-mode and commit-state**, not a flat warn/block. (a) detect symlinked/dev install → downgrade content-drift to advisory there; (b) scope the *blocking* signal to the narrow unambiguous ADR-0006 case (resolvable missing verbs source declares AND real cached install). A signal that fires on the normal dev inner-loop gets ignored, and an ignored gate launders risk as "checked."

### 4. Once-per-dispatch is the wrong granularity for the loop that recompiles mid-run

The canonical guild loop *regenerates agents mid-run* — a `guild compile` between phases is the point. A preflight that fires once at dispatch green-lights a loop, then the loop recompiles at phase 3, and phases 4+ spawn against freshly-emitted-but-cache-unsynced agents — the pre-flatten-registry-snapshot failure, now *inside* the gated window. Not an argument for per-phase re-checking everywhere (scope-creep overcorrection). Remedy: make freshness re-assert as a **postcondition of `guild compile` itself** (compile knows it just changed the world → emit "registry may need refresh"). Put the check where state changes, not only where the loop starts. Name the gate honestly: it catches *entry* skew, not *recompile* skew — document that boundary.

### 5. The node-real smoke catches the cases someone remembered — test the class statically

D2 is the right instinct, but a smoke that *runs a few entrypoints* only catches strip-only failures *on the paths it exercises*. A `constructor(public x)` in a cold verb the smoke never invokes ships broken, green. The strip-only class is a *static* property → test it statically, exhaustively, cheaply: **Remedy A (preferred):** `node --experimental-strip-types --check <file>` over a glob of every `.ts` under `cli/` — catches the whole class by construction. **Remedy B (the smoke):** keep bin-shim execution for the *integration* surface (shim path resolution, version gate, exec wiring). Don't let the smoke be the strip-only safety net — that's a coverage lottery.

### Net

The bones are right and the pieces mostly exist in-tree. The risk: the *cheap* version (verb-set proxy, once-at-dispatch, smoke-runs-some-entrypoints) looks done while leaving the highest-probability skew reporting green. Three concrete swaps, not a redesign: proxy → content (`--check`); artifact-self-report → source-bootstrapped; remembered-cases → exhaustive-by-construction.

**Files:** `plugins/loom/cli/verbs/loom/doctor.ts` (83-133), `plugins/guild/cli/verbs/guild/compile.ts` (257-351), `plugins/guild/bin/guild`, `projects/adr-log/0006-treat-cached-plugin-binaries-as-non-authoritative-in-dev.md`.

### From guild:whiteboard-react-architect

## React-API architecture lens — mostly carve-out, one load-bearing transfer

**Stance:** No React surface, so I carve out of D1/D2 (defer to substrate-engineer and testing-strategy). But D3 — *where the freshness check lives in the call-path* — is structurally a hook-composition-and-boundary problem. I lead there.

### The transfer: the preflight is a custom hook, and it's currently copy-pasted

The `ev-run` preflight and the `ev-loop-confidence` preflight are *the same two probes, written twice* (`ev-run/SKILL.md:36-68`, `ev-loop-confidence/SKILL.md:39-73`, and a third copy in `ev-loop-interactive`). In React terms: three components re-implementing the same `useEffect` instead of one shared `usePreflight()`. The bug this invites is exactly Phase 1's target — a new gate gets wired into one copy and silently missed in the others. Recommendation for D3: **one preflight, called once, at the boundary that owns dispatch — not re-derived in every loop body.**

### Where it lives: extend `loom doctor`, dispatch from `ev-run` only

1. **Best — composition, the existing shape.** `loom doctor`'s `report.issues[]` array *is* a composable return surface — each check is one job returning `DoctorIssue | null`, `doctor()` is the thin composer. Add the new signals as sibling checks. Preserve the pure/effectful split (`detectGuildSkew` parameterized+testable vs `queryGuildVerbs`/`checkGuildSkew` owning the spawn): a pure `detect*(source,cached):Issue|null` + thin effectful `check*(repoRoot)` wrapper. That's the single most important structural property to preserve.
2. **Acceptable — a new shared verb** if semantics diverge from doctor's per-project health framing. If you can't name it without "and" (project-health *and* workspace-freshness), that's the split signal.
3. **Reject — inline in each loop body, or a PostToolUse hook.** Inlining is the copy-paste-the-hook antipattern already biting. PostToolUse-on-every-edit is the monolithic-effect-at-non-obvious-times smell. Boulder is right: once-per-dispatch is the correct effect-dependency array. The dispatch is the event; the edit is not.

### The one boundary change I'd push for

The loops should **stop re-running Tier 1/2 themselves and receive the preflight verdict from `ev-run`.** Right now ev-run runs the preflight, then dispatches to a loop that runs the *same* preflight again — wasteful (two spawns) and divergent. ev-run already owns §0.5 git-sync as "the single point where the working tree gets synced; downstream loops trust the result." Freshness should ride that exact contract: **ev-run is the single point where freshness is gated; downstream loops trust the result.** The loops' §Preflight collapses to "trust the router's verdict, or if invoked standalone, call `loom doctor` once."

### The tension I'd name back

Non-flakiness vs sensitivity has an architectural relief valve the code already models: **severity tiers in the return type.** `DoctorIssue.severity:'warning'|'error'` (doctor.ts:23) lets a skew signal be *advisory* rather than the false-binary of "block or stay silent." A skew check that cries wolf gets ignored only if it cries *error*. Advice: when in doubt, ship the new signal as `warning`, surfaced in the dispatch report's caveat line (`ev-run/SKILL.md:296-302`), promote to `error` only for the unambiguous "cached binary literally cannot do the thing" case. Severity is the knob; the return-type already has it.

Handoff: substrate-engineer leads on the stable skew signal; testing-strategy leads on the node-real smoke shape. The skeptic should pressure-test whether collapsing to one caller loses the standalone-loop-invocation case — answer: option-1's "or call `loom doctor` once if invoked standalone."

**Files:** `plugins/loom/cli/verbs/loom/doctor.ts` (preserve pure/effectful split), `plugins/ev/skills/ev-run/SKILL.md:36-68` (single caller), `ev-loop-confidence/SKILL.md:39-73` + `ev-loop-interactive/SKILL.md` (collapse to "trust the verdict").

### From guild:whiteboard-design-systems

## design-systems — by `whiteboard-design-systems`

**Stance:** the freshness machinery already half-exists under three different names with three different shapes — the design win is *consolidating to one semantic freshness vocabulary*, not inventing a fourth. Name the thing being checked ("is the resolvable artifact fresh against source?"), make every plugin's preflight a tweakable preset over that one primitive, and lean on the content-hash stamp `guild compile` already authors.

### 1. Single source of truth: you already have the stamp

`guild compile` writes a `.cache.toml` keyed by `source_hashes` (per-axis sha256), `output_hash` (sha256 of emitted body), `fused_at`. And `guild compile --check` (compile.ts:257) is *already* a read-only, no-LLM drift detector across six categories. That is the freshness signal. Content hash, not mtime — mtime false-positives the instant a checkout reorders timestamps (token-vs-literal: the literal leaks filesystem state into a contract that should describe intent). Bias hard to the hash.

The actual gap: `--check` compares **source ↔ cache ↔ committed-on-disk-bodies, all within one tree.** It does *not* compare **source tree ↔ the separately-installed marketplace-cache copy**. Clean design: have `compile` emit content hashes into a **committed manifest stamp** (`compiled_at`/`source_digest`), and the cross-install check becomes "does the *installed* stamp equal the *source* stamp?" — a string compare of two semantic digests, inherently non-flaky across modes because all three resolve the same stamp when fresh and only diverge when genuinely stale. (Skeptic: pressure-test that the install pipeline doesn't rewrite/normalize the stamp on install — else you compare a thing to itself.)

### 2. Sibling vocabulary is already drifting: `doctor` means two different things

`loom doctor` returns a **structured `DoctorReport`** (`{slug, ok, issues:[{code,severity,detail}]}`), exits non-zero on error, hosts a `guild-cache-skew` probe. `griot doctor` returns a **plain string** (`'griot doctor: ok'`), always exits 0. Same verb name, two output contracts, two gating postures. **Converge the `doctor` contract to the structured `{ok, issues}` shape across all plugins** before adding a third behavior; the new freshness check slots in as another issue code. `severity:'warning'|'error'` carries advisory-vs-blocking. So: **extend `loom doctor`, don't mint a new verb** — the verb-list `detectGuildSkew` becomes the cheap fast-path, the hash-stamp the authoritative one. Two tiers of one check, not two checks.

### 3. The smoke target is a composition, not a new monolith

`*.smoke.ts` files (`manifest-toml.smoke.ts`, `toml.smoke.ts`, `plan.smoke.ts`) are an established convention — header: *"defends LOADER-COMPATIBILITY, not value-correctness."* Don't introduce a parallel "ci-real-check" term. Two layers (high/low abstraction): **Low/broad** — every `bin/<cli> --help` (full bin-shim → entry → dispatch chain under real node strip-only), ~4 spawns, catches entry+dispatch-table breaks. **High/deep** — the existing per-lib `.smoke.ts` for modules not reached by `--help`. The deliverable is the *runner that composes them* (`npm run smoke` globbing `**/*.smoke.ts` + spawning each `bin/<cli> --help`), not a new monolithic validator.

### 4. The once-per-dispatch preflight, semantically, is already drawn

ev-run's preflight already has **Tier 1 — presence**, **Tier 2 — format-skew** (`loom doctor`), and explicitly names the gap — *"guild's panel manifest and codegen freshness are a separate gate, out of scope here."* That comment is a TODO with your name on it. Freshness is **Tier 3 — codegen-freshness**, advisory not blocking (same posture as Tier 2, same reason: a false-positive hard-stop trains bypass). PostToolUse-per-edit is the *configuration* answer (everything, everywhere, always); the tiered once-per-dispatch preflight is the *composition* answer.

### Open decisions for the operator

- **Does `compile` start emitting a committed source-digest stamp?** The one genuinely new artifact. If not, the cross-install check falls back to the coarser verb-list probe and the fragment-edit-staleness class stays uncaught. Name it in the contract.
- **Converge the `doctor` output contract across loom/griot first?** Sequence it *before* Tier 3, as a separable pure-refactor setup PR.
- **Naming:** call the concept **freshness**; let issue codes carry specifics — `guild-cache-skew` (verb-list tier, exists), `codegen-output-drift` (hash tier, new). "Freshness" names what we want; the codes name what went wrong.

**Files:** `plugins/guild/cli/verbs/guild/compile.ts` (hash/`check()` model), `plugins/loom/cli/verbs/loom/doctor.ts` (structured report + `detectGuildSkew`), `plugins/griot/cli/verbs/griot/doctor.ts` (divergent plain-string contract), `plugins/ev/skills/ev-run/SKILL.md` (Tier 1/2 + named Tier-3 gap), `plugins/loom/cli/lib/manifest-toml.smoke.ts` (`.smoke.ts` convention), `plugins/guild/bin/guild`.

### From guild:whiteboard-performance

## Performance lens — Phase 1 freshness gate

**Stance:** Two of three deliverables are cheap if we reuse stamps that already exist (`output_hash` in `.cache.toml`, the verb-skew probe in `loom doctor`) and expensive only if we naively re-derive them per dispatch. The smoke (D2) is the one real wall-clock cost, and it lives in CI where seconds are fine — keep it out of the per-dispatch path. The per-dispatch preflight (D3) has a hard latency budget in *hundreds of milliseconds*, and the dominant cost is node TS-loader cold-starts, not hashing.

### Cost baseline

The unit of cost is **the node TS-loader cold-start per spawned process**, not the work per process. Every `node …/cli/x.ts` is a fresh V8 boot + strip-only transform. Hashing 28 agent files (sha256 over a few KB) is sub-ms noise. **Cost-design rule: minimize process spawns, not work-per-process.** (Measure after landing: a single `node entry.ts --help` cold-start on Node 24 strip-only ≈ 150–400ms wall. The current `loom doctor` skew probe already spends *two* cold-starts — spawns `node sourceEntry` *and* `guild`.)

### D1 — the stamp already exists, don't re-hash the world

`output_hash` per cell in `.cache.toml` (`compile.ts:46`) is the non-flaky signal. **mtime: reject** (free but flaky — cache copies, checkout, sync-shared rewrite mtimes without changing content; cheap *and* wrong). **content hash: correct, cheaper than feared** — the cost isn't the hash, it's getting both sides into one process; the committed-body-vs-cache comparison is in-process (no spawn). **compile-time stamp: that's what `output_hash` already is** — don't invent a second. Trap to avoid: a skew check that spawns `guild` to self-report freshness is a cold-start; reading `.cache.toml` + re-hashing on-disk bodies *in the already-running doctor process* is zero extra spawns.

### D2 — the one with real wall-clock, and that's fine because it's CI-only

The fixture-masking class can *only* be caught by executing the real artifact under real node. **What to execute:** `node <entry> --help` for each of 3 bin entrypoints + bare-import of any entrypoint not bin-reachable. ~3–5 cold-starts ≈ ~1.5s wall, parallelizable to ~400ms. **Do NOT** execute every verb of every CLI — the strip-only break manifests at *parse* time of the import graph; one `--help` per entry strips the whole transitive graph. **Where:** a dedicated CI `smoke` job, parallel to vitest, not gating it. `NODE_NO_WARNINGS=1`, no build step (strip-only *is* the thing under test). **One measurement after landing:** confirm each entry's import graph actually pulls the strip-break modules. If a module is lazy-imported behind a verb branch, `--help` won't strip it — cheap fix is `node -e "import('./entry.ts')"` to force eager resolution, *not* enumerating verbs.

### D3 — hard latency budget, boulder dissent is right

A PostToolUse hook fires on *every* write — cost multiplied by edit-count, easily hundreds of runs, *interactive* latency the operator feels. The disablement death-spiral: perceptible edit-loop lag gets turned off, protects nothing. **Once-per-dispatch is right** — a 500ms preflight before a 20-minute ev-run is invisible. Budget: **under ~1s invisible, 1–3s tolerable-but-noticed, over ~5s earns bypass.** Cap spawn count: **extend `loom doctor`** (ev-run already calls it, the guild probe already rides inside) — folding the D1 cache-body-hash check into the same doctor process is **zero marginal spawns.** A new verb = a new cold-start for no benefit. Keep severity split; cache-skew stays **advisory/warning** unless a definitive break. `--check` after `modes/`/schema relocation is the `guild compile --check` path — keep it in CI (alongside `sync-shared --check`), *not* per-dispatch; relocation drift is commit-time, not dispatch-time.

### Where measured-over-guessed matters

Three numbers before committing the contract: (1) cold-start cost per bin entry on CI node — sets D2 scope; (2) current `loom doctor <slug>` end-to-end wall — D3's baseline + headroom to the ~1s ceiling; (3) whether each bin entry's import graph eagerly loads the strip-break modules — determines if `--help` smoke suffices or needs forced-import (blind smoke is worse than no smoke — falsely reassuring).

**Net:** D1 and D3 ride existing stamps + the existing `loom doctor` process for near-zero marginal cost; D2 is the only real spend and belongs in a parallel CI job. The thing that kills this gate isn't compute cost — it's a false-positive that trains bypass, so every per-dispatch signal stays advisory and cheap; the thorough checks (full smoke, `compile --check`) live in CI where latency is free.

Boundaries: substrate-engineer owns where the stamp lives (I'm costing it; the existing stamp is also the cheap one); testing-strategy owns what the smoke asserts (I own spawn-count + CI wall-clock); skeptic owns the "advisory not blocking" pressure-test (I've given the cost argument: bypass-training is a real cost).

**Files:** `plugins/loom/cli/verbs/loom/doctor.ts`, `plugins/guild/cli/verbs/guild/compile.ts`, `plugins/guild/agents/.cache.toml`, `plugins/ev/skills/ev-run/SKILL.md`, `plugins/guild/bin/guild`.

### From guild:whiteboard-a11y

**Stance (with carve-out):** the conventional a11y lens — semantic markup, focus, screen-reader, keyboard parity — does not map here; this is pure CLI substrate with no rendered DOM. I carve out of the structural design entirely. My one transferable contribution: a preflight's job is to *speak to a stuck operator*, and the readability of its failure output is the diagnostic equivalent of an accessible name.

### Transferable note — accessibility of the diagnostic

A preflight ships an *error message read by a human (or agent) at the worst possible moment* — right before a multi-phase loop, when something is already skewed. Same principle that makes a screen-reader experience usable: convey relationship + next action in *linear read order*; don't make the reader reconstruct it from position or prior knowledge. Three things worth pinning into the contract:

- **Name the stale thing specifically, not categorically.** "Cache skew detected" is the CLI equivalent of an icon-button with no accessible name. Contract the message to name the exact artifact and skew axis: which agent file, cache vs source, which side is ahead (e.g. `agents/whiteboard-a11y.md: cached binary built from source rev abc123, working tree at def456`). The cached-binaries-lag-source memory exists precisely because the *absence* of this signal cost real debugging time.
- **The remediation is the call-to-action — make it copy-pasteable.** Require the exact command (`node scripts/sync-shared.ts`, `node plugins/<plugin>/cli/<cli>.ts`, the codegen invocation), not a prose gesture at "re-sync."
- **One signal channel isn't enough — match exit code to message.** The machine-readable channel (exit status the loop branches on) and the human-readable channel (the message) must *agree*. Phase 3 reads the exit code; the operator reads the prose; both must tell the same story.

### Open decision

Is the preflight's failure output contracted (exact-artifact + exact-command + agreeing exit code), or left emergent? That's the only call where this lens has anything to say — a small one. Defer entirely to substrate/testing-strategy on the mechanism.

### From guild:whiteboard-sketch-ideation

## Sketch-creative lens — out of scope

This phase is CLI substrate plumbing with zero creative-coding surface — nothing touches `sketches/`, the `<Sketch>` wrapper, the registry, or the gallery framing. I defer entirely to substrate and the loop-mechanics voices.

One framing, take it or leave it: a freshness preflight is a **tripwire, not a heartbeat** — it should fire once at the threshold of the dispatch and either pass or halt, not poll continuously. The failure mode to design against is the smoke detector with a dead battery that still sits on the ceiling looking installed: a preflight that *runs* but silently no-ops on skew is worse than no preflight, because it manufactures false confidence for every phase downstream.
