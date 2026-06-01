# Reviewer-gap inventory

Phase 1, Unit 4 of [guild-hirefest](./PLAN.md). A point-in-time enumeration, against `plugins/guild/modes/axes.toml`, of which artifact domains lack a `reviewer` cell and which lack a runnable verify grant. These are the explicit prerequisites Phase 4's write-hire waves consume: a domain hired write-capable (implementer/fixer) needs a reviewer to gate it, and that reviewer needs to be able to *run* verification, not just eyeball it.

Provenance: derived from `axes.toml` as committed on the `ev-agent.guild-hirefest.setup` branch. Re-derive if `axes.toml` changes (Phase 3 staffs `research`; Phase 4 adds implementer/fixer/reviewer cells; Phase 2b renames the planner/researcher phase tokens).

## The load-bearing nuance: where a reviewer's verification comes from

A cell's tools are `phase.base_tools ∪ domain.tool_grants`. The phases differ critically:

- **`reviewer` base_tools = `[Read, Glob, Grep]`** — no Bash. So a reviewer's *entire* runnable verification capability is whatever its **domain `tool_grants`** add. A reviewer in a domain with `tool_grants = []` is a **blind reviewer**: it can read and grep, but cannot run lint, build, or any test.
- **`implementer` / `fixer` base_tools** already include `Bash(npm run lint:*)`, `Bash(npm run build:*)`, `Bash(git status:*)`, `Bash(git diff:*)`. So a write cell always has lint/build/git regardless of its domain grants; the domain `tool_grants` only add domain-specific runners (e.g. `test:a11y`, `test:e2e`).

Consequence: the "runnable verify grant" that matters for the implement-verify-fix cycle is the **domain `tool_grants`**, because that is what lets the *reviewer* (the gate) verify. A write domain whose reviewer is blind can produce artifacts no one can mechanically check.

## Domain matrix

| Domain | planner | reviewer | implementer/fixer | Domain verify grant (`tool_grants`) |
|--------|:---:|:---:|:---:|---|
| `a11y` | ✓ | ✓ | — | lint, build, **test:a11y**, git |
| `abstraction` | ✓ | — | — | none (`[]`) |
| `composition` | ✓ | — | — | none (`[]`) |
| `css-architecture` | — | ✓ | ✓ (impl + fixer) | **none (`[]`)** |
| `naming` | ✓ | ✓ | — | lint, build, git |
| `nextjs` | — | ✓ | — | lint, **lint:nextjs**, build, git |
| `performance` | ✓ | — | — | none (`[]`) |
| `react` | ✓ | ✓ | — | lint, build, git |
| `substrate` | ✓ | — | — | none (`[]`) |
| `test-integration` | ✓ | ✓ | — | lint, build, **test:e2e**, git |
| `test-unit` | ✓ | ✓ | — | lint, build, **test**, git |
| `tokens` | ✓ | ✓ | — | lint, build, git |

(Reviewer cells confirmed via the `reviewer-default` recipe, which names exactly the 8 domains with `reviewer` in their `phases`. Write cells via the `implementer-default` + `fixer-default` recipes — css-architecture only, the proof domain.)

## Gap list A — domains with no reviewer cell

`abstraction`, `composition`, `performance`, `substrate`.

All four are **design-only** (planner phase only). This is expected and not a defect: design-exploration domains propose structure; they do not gate artifacts, so they need no reviewer. They are **not** prerequisites for Phase 4 (none of them are hired write-capable). If a future plan ever makes one write-capable, a reviewer cell becomes a prerequisite at that point.

## Gap list B — domains with no runnable verify grant

`abstraction`, `composition`, `performance`, `substrate` (the same design-only four, consistent with Gap A) **and `css-architecture`**.

The design-only four are again expected (a planner needs no runner). The outlier is:

### css-architecture: a write-capable domain with a blind reviewer

`css-architecture` is the only domain that is **already write-capable** (it ships `implementer-css-architecture` and `fixer-css-architecture`, the pragmatist proof cells) yet has `tool_grants = []`. The asymmetry:

- Its **implementer/fixer** cells *can* verify — they inherit lint/build/git from the write-phase base_tools.
- Its **reviewer** cell (`evaluator-css-architecture`) *cannot* — reviewer base_tools carry no Bash, and the domain adds none. The gate on the css-architecture write cycle is blind to lint/build/stylelint.

This is a real latent gap, not a Phase-4 wave item (css-architecture is the already-shipped proof domain, not in any 4a/4b/4c wave). It is the **exemplar** of the invariant Phase 5 will enforce: *a write-capable domain must have a reviewer with a runnable verify grant.* Recommended resolution (deferred to its owning phase, not done here): add a `tool_grants` line to `[axis.domain.css-architecture]` granting at least `Bash(npm run lint:*)` + `Bash(npm run build:*)` so the reviewer can run what the implementer/fixer already can. Phase 5's `validate.ts` `writes` coherence lint should then fail any write-capable domain whose reviewer lacks a runnable grant, catching this class automatically.

## Phase 4 wave readiness

Phase 4 hires implementer/fixer (and a reviewer where missing) per domain. Cross-referencing each wave's domains against Gaps A and B:

| Wave | Domain | Reviewer cell? | Runnable verify grant? | Status |
|------|--------|:---:|---|---|
| 4a | `tokens` | ✓ | lint, build | **ready** — no prerequisite |
| 4b | `test-unit` | ✓ | test, lint, build | **ready** |
| 4b | `test-integration` | ✓ | test:e2e, lint, build | **ready** |
| 4b | `nextjs` | ✓ | lint:nextjs, lint, build | **ready** |
| 4c | `naming` | ✓ | lint, build | **ready** |
| 4c | `a11y` | ✓ | test:a11y, lint, build | **ready** |
| 4c | `react` | ✓ | lint, build | **ready** |

**Every Phase-4 hire domain already has both a reviewer cell and a runnable verify grant.** No reviewer-cell additions and no verify-grant additions are prerequisites for any 4a/4b/4c wave. The "add a reviewer cell where the inventory found one missing" provision in the PLAN's Phase 4 has **no triggers** among the hire domains — the design-only four that lack reviewers are not being hired.

Note on `tokens`/`naming`/`react`: their verify grants are lint+build+git with no domain-specific runner. That is sufficient for the write cycle (lint/build are real gates); it is not a gap, just an observation that those domains have no bespoke test command the way a11y (test:a11y) or test-integration (test:e2e) do.

## Summary for Phase 4 and Phase 5

- **Phase 4**: proceed with all three waves as planned; no domain needs a reviewer cell or verify grant added first.
- **Phase 5**: when re-introducing the `validate.ts` `writes` coherence lint, use `css-architecture` as the canonical case — it is a currently-shipping write-capable domain whose reviewer lacks a runnable verify grant, and the lint should flag exactly that shape. Resolving it (granting the css-architecture reviewer lint/build) is the close-the-loop fix.
