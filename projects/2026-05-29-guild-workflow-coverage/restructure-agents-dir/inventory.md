# Scope inventory — Phase 1: Restructure the guild agents directory

**Generated**: 2026-05-29
**Pattern**: separate codegen SOURCE (fragments) from spawnable AGENTS; flatten `plugins/guild/agents/` to a single level.
**Verification**: `npm test` green + `guild compile` reports a clean no-op (all cache-hits, no file changes) against the new layout.
**Baseline**: `npm test` = 1048 passed (green) before any change.

## Moves (git mv — content unchanged)
- [ ] `agents/personalities/*.md` (6) → `modes/personalities/`   **[Unit 1]**
- [ ] `agents/generated/{evaluator-*,whiteboard-*}.md` (19) → `agents/` (flat)   **[Unit 2]**
- [ ] `agents/generated/.cache.toml` → `agents/.cache.toml`   **[Unit 2]**
- [ ] `agents/retained/evaluator-contract-fit.md` → `agents/evaluator-contract-fit.md`   **[Unit 2]**
- [ ] rmdir the now-empty `agents/{generated,personalities,retained}`   **[Unit 2]**

## Repoints (code)
- [ ] `compile-cli.ts:54` `DEFAULT_OUTPUT_DIR` `'plugins/guild/agents/generated'` → `'plugins/guild/agents'` (cache follows via the `<output-dir>/.cache.toml` default)   **[Unit 2]**
- [ ] `compile/resolve.ts:29` personality fragment path `'agents/personalities/'` → `'modes/personalities/'`   **[Unit 1]**
- [ ] `scripts/convert-to-axes.ts:189` (transitional seed script) → repoint or confirm dead   **[Unit 3]**

## Tests
- [ ] `compile-cli.test.ts:42` fixture dir `'agents/personalities'` → `'modes/personalities'`   **[Unit 1]**
- [ ] `compile/emit.test.ts:45-69` `'agents/generated'` test values → `'agents'` (parameterized; consistency)   **[Unit 2]**

## Docs / comments
- [ ] `docs/AGENT-CODEGEN.md` (paths: personalities→modes, generated→agents, retained→agents)   **[Unit 3]**
- [ ] guild `CLAUDE.md` (flat-agents layout)   **[Unit 3]**

## Units (one tier, ratcheting low→high risk)
1. **Personalities → modes/** — isolated read-only fragments + `resolve.ts` + its test.
2. **Flatten generated+retained → agents/** — the main change: moves + `outDir` + cache + emit test.
3. **Docs + transitional-script cleanup** — cosmetic, no code behavior.

## Notes
- No live freshness test exists (`AGENT-CODEGEN.md` cites `generated-panel.test.ts`, which is not in the suite — stale doc). The codegen unit tests (`compile-cli`, `emit`, `compile`) + a `guild compile` no-op are the real verification.
- The flatten turns `guild:generated:X` / `guild:retained:X` / `guild:personalities:X` → `guild:X`, and de-registers personalities as spawnable agents — the namespace cleanup P2/P3 depend on.
- Evaluator gate caveat: `guild-validate` spawns by `agentType`, which is fragile under the *current* three-segment namespace (the very thing Unit 2 fixes). If the panel can't spawn pre-flatten, fall back to tooling verification and note it.
