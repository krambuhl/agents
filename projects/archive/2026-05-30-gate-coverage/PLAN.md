# PLAN — gate coverage for the uncovered runtime seams

**Project**: `gate-coverage`
**Loop**: `/ev-loop-interactive` (judgment-shaped code, not a bulk transform)
**Cadence**: stacked via `gt`, sequential P1 then P2, one PR per phase
**Source**: `projects/2026-05-30-shared-insights/INSIGHTS.md` items **#2c** and **#3** — the two friction items that survived triage as genuinely unowned. The rest of the "looks green, breaks later" cluster (#2a derive `CANONICAL_PHASES`, #2b collapse `PHASE_PREFIX`, #5 derive-panel react-api) is owned by `guild-workflow-coverage` Phase 3 and is explicitly out of scope here.

## Context

The consolidated May-2026 insights named "looks green, breaks later" the most-corroborated friction class: integration-seam failures the test harness misses because the harness diverges from the real runtime. Two complementary fixes follow boulder's through-line — *move the catch earlier*:

- **#2c — extend the node-real smoke net.** A strip-only loader smoke already exists for loom's `cli/lib/{manifest-toml,plan,toml}.ts`: each `.smoke.ts` imports the module directly, runs under real `node`, and is shelled via `spawnSync('node')` from its `.test.ts`. It defends *loader-compatibility* — the class vitest's full TS transform masks (`constructor(public x)` parameter properties, a JSDoc `*/` that closes the comment early, enums). Coverage stops at loom's lib: guild's CLI and **every plugin's `bin/<cli>` entry shim** run under real `node` with no strip-only gate. The entrypoints are exactly where this class bites — a shim that won't load is a total outage — and they're uncovered.
- **#3 — loom doctor probes guild cache-skew.** `loom doctor` preflights loom but not guild. The guild-workflow-coverage P2 session burned real time here: the cached `guild` CLI on PATH predated the `compile` verb and the Agent registry was a pre-flatten snapshot, so codegen and live-spawn silently used stale state. A preflight existed but probed only loom, so the skew passed unchecked.

Neither item depends on the plugin-cache re-sync that currently blocks guild-workflow-coverage P2: the smoke execs entrypoints via `node` directly (not the cached plugin), and the doctor probe *detects* skew rather than needing fresh cache. So this plan is executable now.

## Scope

### In
- P1: node-real strip-only smoke for (a) the guild CLI + its lib, and (b) the `bin/<cli>` exec path of all four consumer plugins (loom, guild, ev, griot); wired into `npm test`.
- P2: a guild cache-vs-source freshness probe added to `loom doctor`.

### Out / deferred
- #2a / #2b / #5 — owned by `guild-workflow-coverage` Phase 3. Not touched here. A closing action flags #2a for *explicit* inclusion in P3 (it is currently only a soft observation in that project's D3 checkin).
- #1 (is the 500-token cap real?) — an empirical investigation, different in kind; not code.
- #6 (declaring done before demonstrating) — process; candidate for a CLAUDE.md / Stop-hook change elsewhere.

## Phases

### Phase 1 — Extend the node-real smoke net to guild + bin-shims

**Goal**: the guild CLI and every plugin's `bin/<cli>` entry shim are gated against the strip-only loader class, running under `npm test`.

Lowest-complexity-first: this replicates an *established* pattern (loom's `*.smoke.ts` + `spawnSync('node')` harness) onto new targets — low novelty. TDD-shaped, because the deliverables *are* the tests.

- **D1 — guild strip-only smoke.** Mirror `manifest-toml.smoke.ts` for guild: a smoke that imports guild's real CLI/lib modules and exercises a representative path under `node`, shelled via `spawnSync('node')` from a `.test.ts`. New files carry `// sync-shared: plugin-local`.
- **D2 — bin-shim exec smoke.** A test that `spawnSync`s each `bin/<cli>` (loom, guild, ev, griot) with a trivial read-only verb and asserts exit 0 — no `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. The entrypoint-level gate the per-lib smokes don't reach. (Likely extends the existing `plugin-bin-shims.test.ts`.)
- **D3 — wire + mark.** Both wired into `npm test`; new files marked plugin-local per ADR-0005 (commons-sync-reconciliation is landing that convention concurrently — coordinate the marker so the orphan-sweep doesn't delete them).

**Exit**: `npm test` green including the new smokes; each `bin/<cli>` execs under real `node` clean; `node scripts/sync-shared.ts --check` clean; a deliberately-broken entrypoint (local spike — add a parameter property) makes the smoke fail red, proving the gate bites.
**Loop**: `/ev-loop-interactive`.

### Phase 2 — loom doctor probes guild cache-skew

**Goal**: `loom doctor` detects and reports when the resolvable guild CLI / agent registry lags the guild source tree.

More novel — a cross-plugin freshness signal — so it comes second, after P1 proves the harness-extension rhythm.

- **D1 — the freshness signal.** Decide and implement the skew check: does the resolvable `guild` CLI expose the verbs the source declares (the `compile`-verb-missing symptom), and/or does the agent cache match the source `agents/` tree. TDD: a simulated stale state fails, a fresh state passes — written first.
- **D2 — wire into doctor.** Add it as a guild check/tier in `loom doctor` with a clear remediation message (re-sync cache + restart); test output + exit behavior against the existing doctor tiers.

**Exit**: `loom doctor` flags guild cache-skew on a simulated stale fixture and stays clean when fresh; tests cover both; exit-code semantics match existing doctor tiers.
**Loop**: `/ev-loop-interactive`.

## Dependencies

- P1 before P2 by complexity, not hard dependency — they're independent and could swap or parallelize. Sequential keeps one reviewable PR each.
- External: ADR-0005's plugin-local marker (commons-sync-reconciliation) for P1's new files. Soft — apply the marker regardless of land order.

## Risks

- P1 D2: the `bin/<cli>` exec smoke runs the *dev-box* node — it proves the entrypoint loads here, not on an end user's Node ≥24. That's the right scope (it catches the strip-only class), but name the limit so it isn't mistaken for a runtime-version gate.
- P2 D1: the skew signal is the design surface. A cheap, deterministic, non-flaky signal is the goal — cache paths differ across install modes (the source-vs-installed-copy confusion, the VSCode/Remote-SSH split). Keep the check advisory if a robust signal proves elusive.

## Open questions

- P2: exact skew signal — verb-list probe (`guild` knows `compile`?) vs agent-cache-vs-source hash vs both. Resolve at P2 D1 with a spike.
- P1: per-plugin bin-shim smoke vs one marketplace-level test exec'ing all four. Lean centralized (it's a marketplace invariant, like `plugin-bin-shims.test.ts`). Confirm at P1 D2.

## Decisions

- Scope narrowed to the two genuinely-unowned items after verifying #2b/#5 belong to guild-workflow-coverage P3 and #2a is soft-noted there. Avoids colliding with an active project.
- Smoke-first, doctor-second — replicate the proven pattern before designing the novel probe (lowest-complexity-first wave sequencing).
- Loom project, not a bare PLAN.md — phase/PR tracking, consistent with sibling substrate efforts.
