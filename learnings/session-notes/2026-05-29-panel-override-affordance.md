# Per-unit Panel: override as the answer to verdict-padding

**Date**: 2026-05-29
**Source**: 2026-05-28-agent-system-improvements Phase 1 (substrate-observability foundation)
**Status**: capture for future griot-compact rollup

The `Panel:` override in unit contracts has been in
`plugins/guild/docs/PANEL-COMPOSITION.md` (lines 284-299) since
the D7 panel-derivation MVP shipped, but it was documented as a
Phase 4 future-reference concern. Operators have been paying an
attention tax on judgment-heavy ev-loop units when the full
auto-derived panel cycles its rubric in verdict prose for
dimensions that aren't load-bearing — and reaching for the
existing override would have relieved most of that tax. The
2026-05-28-agent-system-improvements project's RESEARCH.md
identified the doc-discoverability gap (item 1 of the 7-item
next-step list, "zero code"), and Phase 1 of that project
promoted the override to a top-level section that names the
symptom.

## The shape of verdict-padding

For a judgment-heavy unit — a new abstraction, an API surface
change, a schema decision — the auto-derived panel pulls in 5-7
evaluators based on file types touched. Each evaluator runs in
parallel, each returns a structured verdict + prose reasoning.
For a unit whose acceptance criteria genuinely span only 2-3
dimensions, the operator reads through 4-5 "no findings in
[dimension]" sections looking for the 2-3 load-bearing ones.
The signal is buried; the contract didn't anticipate it because
auto-derivation works from file types, not from the unit's
intent.

## The affordance, applied

Take a typical "doc nudge" unit — a single file edit to
`PANEL-COMPOSITION.md` plus a captured learning. Auto-derivation
would yield `evaluator-contract-fit` alone for the substrate-only
file list (per `bin/guild derive-panel`'s fallback). The override
isn't needed *for this particular unit* because the auto-derived
panel is already minimal. But for a *judgment-heavy* unit
touching, say, three `.tsx` files plus a `.module.css` partial,
auto-derivation would yield contract-fit + naming + react-api +
nextjs + a11y + tokens + css-architecture. If the unit's
intent is narrowly about prop-shape refactoring, the operator
declares the narrower panel explicitly:

```
Panel: [evaluator-contract-fit, evaluator-react-api, evaluator-naming]
```

That single line in the unit's contract bypasses auto-derivation
entirely. The remaining four evaluators don't spawn; the
verdict-prose tax disappears.

Additive narrowing (keeping auto-derivation and modifying around
it) uses `+` / `-`:

```
Panel: -evaluator-a11y
```

Same effect for the a11y case; less surgical than the full
replacement.

## The caveat the new doc section names

Stripping evaluators wholesale removes the "I checked X and found
nothing" confidence signal that exhaustive verdict prose provides
for free. Use the override when you're sure the dimensions you're
dropping aren't ones a future reviewer would want positive
confirmation on; when in doubt, accept the padding. The new
PANEL-COMPOSITION.md section spells this out explicitly so
operators don't reach for the override on auto-pilot.

## Cross-references

- `plugins/guild/docs/PANEL-COMPOSITION.md` § When to opt out:
  per-unit Panel: override — the discoverable section this
  learning demonstrates.
- `plugins/guild/docs/PANEL-COMPOSITION.md` § Override and
  opt-out (lines 284-299) — the underlying spec with the `+` /
  `-` syntax.
- `projects/2026-05-28-agent-system-improvements/RESEARCH.md`
  § Constraints — evaluator verdicts have no per-unit scope —
  the verdict-padding finding that motivated this project.
- `projects/2026-05-28-agent-system-improvements/whiteboards/research-shift-01-evaluator-verdict-padding.md`
  — the substrate-engineer + skeptic perspectives that shaped
  the doc nudge framing.
