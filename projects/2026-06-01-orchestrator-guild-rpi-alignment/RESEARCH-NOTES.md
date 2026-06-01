# Research notes: orchestrator-guild-rpi-alignment

Raw interview trail and per-source evidence. The `/loom-research` skill is `disable-model-invocation: true` (operator-invoked); its process was executed directly per `plugins/loom/skills/loom-research/SKILL.md`. Auto-mode was requested; the auto-panel substitute was run as a single-session evidence-gathering pass against the working tree rather than a multi-round `/guild-plan` spawn, because the live registry could not spawn the new `plan-*` roster (see Shift 2). The fact-anchored posture (every claim cites a file path + observable) was applied at synthesis time.

## Slug resolution note

Passed the slug as `orchestrator-guild-rpi-alignment` per the operator brief. The loom CLI's `createSlug` (`plugins/loom/cli/lib/project.ts` line 132) date-prefixes a bare topic, producing the project dir `2026-06-01-orchestrator-guild-rpi-alignment`. `resolveProject` (same file) suffix-matches a dateless slug via `endsWith('-orchestrator-guild-rpi-alignment')`, so `/loom-plan orchestrator-guild-rpi-alignment` resolves this dir. The slug tail is preserved verbatim; only loom's standard date prefix is added, matching every existing project dir under `projects/`.

## Shift 1 — Guild on-disk inventory and the five-phase model

Method: `ls plugins/guild/agents/<phase>-*.md` per phase.

- research-* = 10, plan-* = 11, implementer-* = 8, evaluator-* = 9, fixer-* = 8, whiteboard-* = 0 (glob returns no matches).
- `name:` frontmatter matches filenames for research-react / plan-react / evaluator-react / implementer-react / fixer-react.
- `plugins/guild/modes/axes.toml`: phase axis at line 92, five phase blocks (research 98, plan 103, reviewer 108, implementer 113, fixer 118). Domain x phase table lines 15-60. Personalities lines 72-89. Recipes line 124 (7 recipes).
- Background-context premise (research 10 / plan 11 / impl 8 / eval 9 / fixer 8) VERIFIED true against the working tree.

## Shift 2 — Disk-vs-registry gap (the live-spawn blocker)

Method: enumerate every installed guild agent under `~/.claude/plugins/`, compare HEADs.

- Registry resolves from `~/.claude/plugins/marketplaces/krambuhl/plugins/guild/agents/`, a checkout of `git@github.com:krambuhl/agents.git` at commit `73249bd` (PR #166, "Archive gate-coverage").
- Working repo at `0afe406` (PR #196, guild-hirefest archive). Mirror predates the whole guild-hirefest rename.
- Mirror's agents/: OLD `whiteboard-*` set, ZERO `plan-*`, ZERO `research-*`, only `implementer-css-architecture` + `fixer-css-architecture` from write-capable phases, current 9-name evaluator set.
- `~/.claude/plugins/cache/krambuhl/guild/<hash>/` holds many historical snapshots (some with `generated/`+`retained/` subdir layouts from older codegen). None contain `plan-*` or `research-*`.
- Diagnosis: STALE MARKETPLACE MIRROR, not a missing compile and not a cache-hash fault. The working repo's `agents/` are already compiled+committed; the runtime just hasn't pulled them.
- Cross-check against repo memory: matches "guild agent registry names are VOLATILE across recompiles" and "spawn from the live available-agents list, never from on-disk filenames or memory." Also matches "additive-injection recompile" / "cache ignores tool_grants" learnings — the cache is hash-keyed on fragments+fusion-prompt, not the mirror state.

## Shift 3 — Orchestrator consumption map

Method: read each orchestrator SKILL.md in full + grep for guild references.

- `ev-loop-interactive` (`plugins/ev/skills/ev-loop-interactive/SKILL.md`): `/guild-plan` § Plan lines 100-168 (glob `plan-*` 114-116, bootstrap-skip 157-162); `/guild-validate` + derive-panel unit step 3 lines 297-322 + § Panel auto-derivation 660-701; spawns `/loom-research` skill via Agent inner-RPI lines 496-507; specialist-pairing documented-only 703-723.
- `ev-loop-confidence` (same dir, ev-loop-confidence): `/guild-plan` § Plan 99-163; `/guild-validate`+derive step 3 306-323; no inner-RPI (§ Revise PLAN.md at 416); specialist documented-only 469-485.
- `ev-run` (ev-run): thin router, Rules 426-427 "no evaluator calls"; auto-mode names `evaluator-contract-fit` 374-393 as single reader.
- `loom-plan` (`plugins/loom/skills/loom-plan/SKILL.md`): derive-panel + `/guild-validate` step 6 "Evaluator pass" 155-175; NO plan-* engineers; markdown plan -> contract-fit alone (164-166).
- `loom-revise-plan` (line 142): `/guild-validate` fixed rubric, no derive-panel, no plan-*.
- `loom-archive` (lines 109-124): auto-mode dual-panel — Plan panel `/guild-plan` full roster 113-117 + Evaluator panel derive-panel+`/guild-validate` 118-123. Only non-ev-loop orchestrator using plan-*.
- `loom-research` (SKILL.md): plan-* per shift via `/guild-plan` (glob 178, step 4 174-198); fact-check `/guild-validate` agents=evaluator-contract-fit (step 5 219-240). Never research-*.

Gap: research-*, implementer-*, fixer-* are staffed-but-unwired across ALL orchestrators. plan-* wired only at design/plan seam. evaluator-* wired everywhere correct.

## Shift 4 — derive-panel internals (participate-vs-recuse, composition side)

Method: full read of `plugins/guild/cli/verbs/guild/derive-panel.ts`.

- `derivePanelVerb` lines 302-319: reads `--files=` CSV (308-313) OR `ctx.stdin` newlines (314-318) ONLY; no positional branch -> positional args silently fall through to baseline-only.
- BASELINE `evaluator-contract-fit` line 24, always added (288).
- Spec parsed from `plugins/commons/docs/PANEL-COMPOSITION.md` (SPEC_PATH 23, loadSpec 203-224); FALLBACK_RULES/PRECEDENCE 151-191 defensive backup only.
- specificity ranking 68-72, matchPath 226-240, precedence ordering 293-299.
- gateReact 269-281 (react over-include fix): non-JSX .ts keeps evaluator-react only if REACT_IMPORT (247-248) matches; .tsx/.jsx unconditional; unreadable file keeps lens.
- Evaluator-only: output regex `evaluator-[\w-]+` line 112; no research/plan/implementer/fixer notion. Does not generalize.
- Cross-check repo memory "derive-panel invocation + routing": matches (reads --files=/stdin only, positional silently baseline, substrate-path routing + react over-include fixed Phase 3 #178).

## Shift 5 — recusal signal + axes.toml participation source of truth

Method: read `/guild-validate` + `/guild-plan` output shapes; read axes.toml domain x phase table.

- `/guild-validate` (guild-validate/SKILL.md): `agent_signals[]` output 92-100, outcome gated|recused|operator-judgment; recused non-gating 191-193.
- `/guild-plan` (guild-plan/SKILL.md): output 64-74 has sections+contradictions, NO per-engineer recusal field. Self-recuse trusted at runtime (89-94) but not surfaced structurally.
- axes.toml domain x phase lines 15-60: each domain declares its `phases` list (a11y all 5; abstraction/composition/performance/substrate = research+plan only; css-architecture/nextjs = reviewer+implementer+fixer). This is the declarative participation table; only codegen reads it today, no runtime participation consumer.
- operator-judgment-required: 10 of 46 files under plugins/guild/agents/ contain it; also a first-class `/guild-validate` verdict (output 71, precedence 185-193).
- reviewer=evaluator alias: axes phase `reviewer` (108) compiles to `evaluator-*` agent names.

## Auto-panel / fact-check posture

Auto-mode requested. Because the live registry cannot spawn the new `plan-*` / `research-*` roster (Shift 2), a literal `/guild-plan` auto-panel could not run those engineers; the auto-pass was executed as a direct evidence-gathering sweep with the fact-anchored rubric applied at synthesis (every RESEARCH.md claim carries a file-path + observable). No claim was admitted without a citation; the two hypothesis-flagged items (research-* contribution shape in Finding 4; operator-judgment cohort coverage in Finding 6) are explicitly marked as needing in-plan confirmation rather than asserted as fact.

## Open follow-ups for the plan

- Confirm `research-*` agent bodies return research-shaped (not plan-shaped) contributions before rewiring `/loom-research`'s shift glob.
- Confirm which 10 of 46 agents carry operator-judgment-required (likely the reviewer/evaluator cohort).
- Sequence a marketplace-mirror refresh + live-spawn smoke gate (per plugins/guild/CLAUDE.md § Live-spawn smoke) before any phase claims runtime-done.
