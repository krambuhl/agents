# Cache invalidation surprises — /guild-compile prompt_hash budget

**Date**: 2026-05-29
**Source**: 2026-05-28-guild-matrix-precompile Phase 2.1 U2 + Phase 2.2 U2
**Status**: capture for future griot-compact rollup

The `/guild-compile` cache has a single `prompt_hash` field per cell
that captures the hash of `fusion-prompt.md` at fusion time. This
note captures which edits trigger N-cell refusions, what the budget
looks like for each, and the hidden surface that the cache doesn't
track.

## What invalidates what

| Edit | Cells invalidated | Re-fusion budget |
|------|-------------------|------------------|
| `fusion-prompt.md` (any line) | **all 19** | Heavy: ~19 cells × ~3min/cell = ~1 hour of LLM session work |
| `axes.toml` (new domain entry) | **+1 to +2** (per recipe + planner overlap) | Light: 1-2 cells |
| `axes.toml` (new [[recipes]] entry) | **0** | Free (recipe is read-only at dispatch; no fusion) |
| `axes.toml` (changed `tool_grants`) | **all cells using that domain** | Variable: 1-2 cells |
| `modes/phases/reviewer.md` | **8 evaluator cells** | Medium: ~24 min |
| `modes/phases/planner.md` | **11 whiteboard cells** | Medium: ~33 min |
| `modes/domains/<X>.md` | **1-2 cells** (1 reviewer + 0-1 whiteboard depending on `phases =`) | Light: 1-2 cells |
| `agents/personalities/<X>.md` (skeptic / generative / etc.) | **all cells using that personality** | Variable: 1-8 cells |
| `agents/personalities/personality-base.md` | **0 reported** but ALL cells stale | **HIDDEN DRIFT** — see below |

## The personality-base hidden drift surface

The `/guild-compile` SKILL reads `personality-base.md` and inlines
its three-axis identity content into every fusion input. But the
cache's `source_hashes` covers only the three fragment fields
(`phase`, `personality`, `domain`) plus the orchestrator-level
`prompt_hash`. `personality-base` is NOT in either.

So an edit to `personality-base.md`:
1. Is invisible to `guild compile --check` — reports `ok=true`.
2. Is invisible to `isCacheHit` in the orchestrator — reports
   cache-hit for every cell.
3. Silently produces stale fused output: the next
   `/guild-compile` run hits the cache for every cell and never
   re-fuses.

The next personality-base edit will trigger this. Until then, the
substrate looks healthy.

### Mitigation paths

Option A — Add `personality_base_hash` to cache entries:
- New field in `CacheEntry`: `personality_base_hash: string`.
- `isCacheHit` compares it; mismatch = miss.
- The skill computes it via `shasum` and threads it through both
  through-resolve and emit stages.
- Same pattern as `prompt_hash`; minimal substrate change.

Option B — Fold personality-base into the prompt hash:
- The skill computes `prompt_hash = sha256(fusion-prompt.md +
  personality-base.md)` before passing.
- A personality-base edit invalidates ALL 19 cells.
- Simpler cache shape (no new field) but heavier blast radius.

Option C — Inline personality-base into the fusion-prompt:
- The retain-vs-merge decision from Phase 2.2 reverses.
- `fusion-prompt.md` carries the three-axis identity directly.
- `personality-base.md` is deleted.
- The hidden surface goes away but at the cost of a single edit
  surface for the cross-cutting framing.

Recommendation: Option A. Cheapest, preserves the retain decision,
makes the cache shape conform to what the skill body actually reads.

## Prompt-edit budget

When the operator edits `fusion-prompt.md`, the entire 19-cell roster
needs re-fusion. Concretely:

- **One word change** in the prompt → 19 cells re-fused.
- **One section addition** in the prompt → same.
- **Reorganization** of the prompt → same.

The skill body's no-op short-circuit triggers when `cache_misses` is
empty. After a fusion-prompt edit, `cache_misses` is 19. The skill
runs all 19 fusions in-session.

In the Phase 2.2 U2 run, the 19 fusions took roughly a single Claude
session of focused writing (~30-60 minutes wall-clock). For an
operator running `/guild-compile` after a prompt tweak, expect that
same budget. If the tweak is small (a one-line rule addition), the
fusions are mostly cache-following; if the tweak is large (a new
output-shape rule), each fusion needs more attention.

## Recipe edits are free

A new `[[recipes]]` entry in `axes.toml` doesn't trigger any fusion.
Recipes are read at dispatch time by `guild recipe <name>`; they don't
affect the cell catalog or its hashes. The operator can curate recipes
without paying the fusion budget.

This also means: deleting a `[[recipes]]` entry doesn't invalidate
anything either. The recipe disappears from the dispatcher's lookup;
no fused agents are touched.

## fused_at semantics worth knowing

The cache writes a `fused_at` timestamp per entry. But `fused_at` is
NOT compared by `isCacheHit` — it's metadata for the operator, not a
cache key. So:

- A "no-source-change re-run of `/guild-compile`" produces a
  byte-identical `.cache.toml` ONLY IF the skill body's no-op
  short-circuit triggers AND emit is skipped.
- If `cache_misses` is non-zero AND the skill calls emit with the
  cache-hit cells bundled in (Shape A from Phase 2.2 U1
  contract negotiation), those hit cells get a new `fused_at`
  even though their content didn't change.

The smoke test's "byte-identical re-run" assertion (Phase 2.1 U4)
relies on the no-op short-circuit triggering. The substrate-layer
assertion `cache_misses.length === 0` is what holds; the file-byte
identity is a downstream consequence the skill body achieves by
skipping emit.

## Implications for operators

1. **Tweaking the fusion-prompt costs ~30-60 min of LLM session
   time** for the full 19-cell re-fusion. Budget accordingly. Save
   the small style-only tweaks for a planned re-fusion session
   rather than as a one-off.

2. **Editing `personality-base.md` is silently dangerous** until the
   substrate-followup lands `personality_base_hash`. Manually invoke
   `/guild-compile` after any personality-base edit, and don't
   trust `--check`'s `ok=true` to mean "no drift" until the cache
   shape is extended.

3. **Editing a single domain fragment is cheap** (1-2 cells re-fused).
   Domain-specific catalog updates are the natural unit of edit.

4. **Editing a phase fragment is a bigger blast** (8-11 cells).
   Phase fragments are the cross-cutting framing — edit deliberately.

5. **Editing a personality fragment varies** (1-8 cells). Generative
   affects 5 whiteboards; methodical affects 2; skeptic affects 9
   (8 evaluators + 1 whiteboard-skeptic singleton).

## Cross-references

- `plugins/guild/cli/verbs/guild/compile.ts` (`isCacheHit`,
  `readCache` — the cache compare logic).
- `plugins/guild/cli/verbs/guild/compile/types.ts` (`CacheEntry`
  shape — what's hashed).
- `plugins/guild/skills/guild-compile/SKILL.md` (the operational
  flow that exercises the cache).
- `projects/2026-05-28-guild-matrix-precompile/retros/landed.md`
  (follow-up #1: cache personality-base hash).
