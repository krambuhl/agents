# Substrate compositions

Named recipes the ev-linear loop bodies (`/ev-linear:ev-loop-interactive`,
`/ev-linear:ev-loop-confidence`) compose to perform substrate
operations against the linear-loom CLI. Parallel to the ev plugin's
`docs/SUBSTRATE-COMPOSITIONS.md` per DESIGN.md § 17, with two
structural differences:

1. **Every recipe targets `bin/linear-loom`**, not `bin/loom`. Verb
   shapes and Linear-side authority match Phase 6's substrate surface
   (DESIGN.md § 7, § 8, § 11, § 12).
2. **No griot recipes** (§ Capture finding, § Append finding,
   § Apply rewrite, etc.). DESIGN.md § 18 excises griot integration
   from ev-linear entirely. The skill bodies are simpler by a
   measurable margin.

## Recipe coverage (Phase 7 U1)

This file ships in Phase 7 U1 alongside `/ev-linear:ev-run`. The
router cites no `§ Recipe` blocks directly — every recipe ev-run
might have needed (e.g. `§ Save session`, `§ Capture finding`) is
either dropped (no Linear-native analog) or owned by the loop
skills (which land in Phase 7 U2 + U3).

This file therefore ships as a placeholder for U1, with the
recipe set growing as the loop skills land:

- **Phase 7 U2** adds the recipes `/ev-linear:ev-loop-interactive`
  cites (e.g. `§ State refresh`, `§ Phase update`, `§ Checkin write`,
  `§ Compose PR` — where each has a meaningful Linear-side analog).
  Recipes whose loom-side semantics don't carry over (e.g. session
  handoff) are explicitly omitted with a one-line note.
- **Phase 7 U3** adds the recipes `/ev-linear:ev-loop-confidence`
  cites (tier-shaped recipes that have no current consumer in U2).

## Substrate references

For the linear-loom verb surface this plugin composes on, see
[`plugins/linear-loom/docs/DESIGN.md`](../../linear-loom/docs/DESIGN.md)
— particularly:

- § 5 + § 6 (Milestone naming convention; the parser shared via
  `plugins/linear-loom/cli/lib/phase-naming.ts` resolves a phase
  number to a Linear Milestone).
- § 7 (checkins are Sub-Issue comments — `linear-loom checkin write`
  is the substrate write surface; `linear-loom events read`
  synthesizes the read side).
- § 8 (no separate event log — `events read` synthesizes from Linear
  native audit data; **there is no `events append` verb**, so
  ev-linear has no place to emit auto-mode events / scope-shift
  events / capture writes).
- § 11 (Linear Milestone state is source-of-truth for phase status;
  `linear-loom phase update` is the write surface).
- § 17 (ev-linear is a parallel plugin to ev — derivative of ev's
  skill bodies with substrate references swapped).
- § 18 (ev-linear excises griot entirely — no capture writes, no
  rollup load).
- § 19 (linear-loom's output stability contracts in
  `plugins/linear-loom/contracts/` are what ev-linear pins against
  when consuming read-verb output).
