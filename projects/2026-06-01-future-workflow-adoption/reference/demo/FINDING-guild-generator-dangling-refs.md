# Finding: dangling `generator-*` references after the Phase-7 U1 drop

**Surfaced by**: the workflow-adoption demo (while looking for a write-capable guild agent to test).
**Type**: substrate-hygiene. **Not** a workflow concern — fix independently of anything in this throwaway PR.
**Recommended disposition**: a separate, small cleanup PR against real plugin source. Do **not** fold into the throwaway demo PR (different intent, and it touches load-bearing skills).

## What's wrong

Guild's write-capable `generator-*` family was **deliberately dropped** in the matrix-codegen migration (`plugins/guild/docs/AGENT-CODEGEN.md:236`, rationale at ~258-272: Phase-7 U1, operator-grilled — `generator-css-codemod` was an implementer-phase, write-capable agent with no `axes.toml` recipe row, so codegen emitted no replacement and it was not retained). Guild's current roster is evaluators + whiteboards + personalities only; there are **zero generator files** under `plugins/guild/agents/`.

But three surfaces still reference the dropped agent:

| Surface | Location | Reference |
|---|---|---|
| confidence loop | `plugins/ev/skills/ev-loop-confidence/SKILL.md` (~467-471, "Specialist-evaluator gate-then-review (Phase 4)") | pairs `evaluator-css-architecture` with `generator-css-codemod` |
| interactive loop | `plugins/ev/skills/ev-loop-interactive/SKILL.md` (~676-680, same section) | same pairing |
| panel spec | `plugins/guild/docs/PANEL-COMPOSITION.md` (lines 101, 187) | cites `generator-css-codemod` as an elevated-precedence specialist's paired generator |

On top of that, the `guild` binary currently on PATH is a stale cache snapshot (`af4bc8193088`) that still ships `generator-base.md` + `generator-css-codemod.md` **and** the old `evaluator-react-api` name — so the running agent registry still *advertises* `guild:generator-css-codemod` even though current source dropped it. Same version-skew family as the `evaluator-react-api` -> `evaluator-react` drift the demo's mapping verb already caught.

## Why it matters

If either loop's gate-then-review path ever fires, it instructs a pairing with an agent that no longer exists in current guild — a reference to a phantom. At best it's confusing documentation; at worst a latent spawn failure once the running cache catches up to source.

## Two readings (the call is the U1 author's)

1. **Intentional placeholder** — `AGENT-CODEGEN.md` explicitly says re-introducing generators is "a future substrate question." The gate-then-review sections may be holding the seat for that return.
2. **Cleanup miss** — the U1 drop simply didn't propagate to the consumer references.

## Recommended action (separate PR)

Either:
- **Remove** the gate-then-review sections from both ev-loop skills and the `generator-css-codemod` lines from `PANEL-COMPOSITION.md`; or
- **Mark them deferred** in place ("generators dropped in Phase-7 U1; gate-then-review parked until a write-capable agent class returns"), so the intent is explicit rather than a dangling name.

Independently, a `claude plugin update` would refresh the stale `af4bc8193088` guild cache so the running registry stops advertising the dropped generators (and the `react-api` name) — but verify which snapshot the loops actually resolve against first.
