# Live-spawn smoke — runtime acceptance gate (Phase 6, deferred)

**Status:** DEFERRED — source-done, runtime-pending. Blocked on an external
marketplace-mirror refresh that cannot be performed from this repo.

## What this gate is

The whole-effort acceptance gate (PLAN § Verification): spawn one agent per
newly-wired RPI phase **from the live registry** and confirm it returns the
expected contribution shape — proving the source wiring (Phases 1–5) works
end-to-end at runtime, not just against the working tree.

- `research-*` — wired into `loom-research` shift panels (Phase 2)
- `plan-*` — wired into the `loom-plan` synthesis panel (Phase 3)
- `implementer-*` — wired into both ev-loops' Execute step (Phase 4)
- `fixer-*` — wired into both ev-loops' FIX step (Phase 5)

## Why it's blocked

The live runtime registry resolves guild agents from a marketplace mirror
pinned at commit `73249bd` (PR #166), which **predates the entire
whiteboard→plan rename**. It still ships `whiteboard-*` and zero
`plan-*`/`research-*`, and only `css-architecture` implementer/fixer.
Consequently every `derive-panel --phase=<research|plan|implementer|fixer>`
roster this effort wired up resolves to agent names that **are not
spawnable** until the mirror refreshes past guild-hirefest.

This is the one dependency in the plan that lives outside the repo: it
requires publishing the relevant commits to the public `agents.git` and
running a plugin update. Until then, every source phase ships behind a
documented bootstrapping fallback (skip the panel / fall back to inline
drive), so nothing is broken — the panels simply have no live agents yet.

## Checklist — run when the mirror has refreshed

1. Refresh the marketplace mirror past guild-hirefest (publish to the public
   `agents.git`) and run the plugin update so the runtime registry resolves
   `plan-*`/`research-*`/full `implementer-*`/`fixer-*`.
2. Confirm the live roster: `guild derive-panel --phase=research`,
   `--phase=plan`, `--phase=implementer`, `--phase=fixer` each emit their
   `axes.toml` rosters AND those agent names resolve as spawnable
   `subagent_type`s.
3. Live-spawn one agent per phase from the live registry (per
   `plugins/guild/CLAUDE.md` § Live-spawn smoke) and confirm each returns the
   expected contribution shape:
   - `research-*` → a research-shift contribution
   - `plan-*` → a plan-panel section (+ `agent_signals` recusal shape)
   - `implementer-*` → a delegated write
   - `fixer-*` → a minimal flagged-finding remedy
4. Record the results at
   `learnings/session-notes/<YYYY-MM-DD>-orchestrator-rpi-live-spawn.md` and
   mark this gate PASSED.

Until step 4 lands, the effort is **source-complete, runtime-pending**: the
source phases (1–5) are merged and unit-verified; this live-spawn proof is
the tracked follow-up.
