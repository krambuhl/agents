# Agent codegen + the baked-to-generated cutover

`guild generate` compiles guild's antagonist-panel and whiteboard agents
from a 3-axis source model instead of ~21 hand-baked files. This doc is
the reference for how that works and what Phase 7 U1 of
substrate-consolidation did to complete the baked-to-generated cutover.

## The model

An agent's identity is **personality x domain x phase**, inlined at
generate time:

- **personality** (HOW) — `agents/personalities/<p>.md` (skeptic,
  methodical, generative, pragmatist, synthesizer) + the shared
  `personality-base.md`.
- **domain** (WHAT) — `modes/domains/<d>.md` (the antipattern catalog /
  concerns / vocabulary for a lens).
- **phase** (WHEN) — `modes/phases/<phase>.md` (researcher, planner,
  reviewer, implementer) — the lifecycle position + output contract.

`panel.manifest.toml` names the **needed** agents (not the 5x12x4
cross-product) across three section shapes:

- `[[combinations]]` — a personality applied to a list of domains at a
  phase. Reviewer combinations emit `evaluator-<domain>`; planner
  combinations emit `whiteboard-<domain>`.
- `[[recipes]]` — the same shape with a name; a named multi-domain
  co-dispatch (e.g. `design-systems`). Folds into member agents
  identically to a combination; the recipe name is consumed at dispatch
  time (Phase 6 — see `guild recipe <name>` verb), not at codegen.
- `[[singletons]]` — a personality at a phase with **no** domain (the
  domain-agnostic `whiteboard-skeptic`). An explicit named exception,
  never a silent `domains = []`.

`tools-map.toml` is the least-privilege fold: `agent.tools =
phase.base [UNION domain.grants at verification phases only]`. Domain
grants apply **only at reviewer + implementer** — planner/researcher are
base-only, even on a granted domain. A missing `[phase.X]` row is a
fail-loud error; a missing `[domain.X]` row is base-only (a default).

### Retained hand-authored agents

Three files are deliberately retained hand-authored and never generated
(declared in `panel.manifest.toml`'s `[retained]` table and in this doc):

- `evaluator-contract-fit` — the always-on baseline reviewer. A
  panel-composition role, not a personality x domain combination; the
  one principled exception to the axis collapse.
- `evaluator-base` — documentation root for the evaluator class.
  Inheritance is codegen-internal (the base body is inlined at generate
  time), so this file is documentation, not a runtime parent. Kept as a
  clear entrypoint for "what does every evaluator share."
- `whiteboard-base` — the same documentation-root rationale, for the
  whiteboard class.

## Generated output is committed in-place

Generated agents live committed alongside the retained hand-authored
ones at `plugins/guild/agents/<name>.md`. Each generated file carries a
do-not-edit provenance banner and is marked `linguist-generated` in
`.gitattributes`. They are **not** gitignored-and-generated-on-install:
the agents are the runtime artifact the marketplace ships, and
generate-on-install would reintroduce the installed-vs-source split
this consolidation exists to close, plus a failure mode where a
stale/absent generate step silently runs an empty panel.

The guard against hand-edit drift is `generated-panel.test.ts`
(regenerate to a tmpdir, assert every generated file in the committed
tree is byte-identical) — the lockfile-freshness shape. The test
filters by the regen's own emitted list, so the retained hand-authored
files are ignored. Regenerate with `guild generate`; never hand-edit a
file emitted by the codegen.

**Codegen output directory**: `guild generate` writes to
`<source-dir>/agents/` by default (the in-place runtime tree). The
`--out=<path>` flag overrides this — tests use a tmpdir; the
project-local escape hatch (below) typically targets a consumer's
`.claude/agents/` tree.

## Project-local domains (the off-rails escape hatch)

A consumer project (e.g. aart.camp) adds its own domain without copying
core fragments:

```
guild generate --project-dir=<project>/.guild --out=<project>/.claude/agents
```

`--project-dir` holds the project's own `panel.manifest.toml` +
`domains/<d>.md`. Core base/phase/personality fragments + `tools-map.toml`
resolve from the installed plugin (module-relative), so the consumer
never names the plugin's internal install path. Only the project's
agents are emitted (not the core panel). See
`cli/fixtures/project-local-sketch/` for a worked example
(`sketch-ideation` — the consumer-local replacement for what was the
baked `whiteboard-sketch-ideation`).

## The baked -> generated name mapping (historical record)

Phase 7 U1 (substrate-consolidation) **completed the cutover**: every
baked `evaluator-*` / `whiteboard-*` (with redundant generated
counterparts) was deleted, and the `agents/generated/` staging subdir
was flattened into `agents/`. The generator class was dropped entirely
(see Phase-7 decision below). This table is the historical record of
the rename / split / expansion mapping for callers that referenced
baked names in older code.

| Baked (deleted) | Generated replacement | Note |
|-----------------|-----------------------|------|
| `evaluator-a11y` | `evaluator-a11y` | exact |
| `evaluator-css-architecture` | `evaluator-css-architecture` | exact |
| `evaluator-naming` | `evaluator-naming` | exact |
| `evaluator-nextjs` | `evaluator-nextjs` | exact |
| `evaluator-react-api` | `evaluator-react` | **rename** (domain is `react`) |
| `evaluator-test-integration` | `evaluator-test-integration` | exact |
| `evaluator-test-unit` | `evaluator-test-unit` | exact |
| `evaluator-tokens` | `evaluator-tokens` | exact |
| `whiteboard-a11y` | `whiteboard-a11y` | exact |
| `whiteboard-performance` | `whiteboard-performance` | exact |
| `whiteboard-skeptic` | `whiteboard-skeptic` | exact (singleton) |
| `whiteboard-react-architect` | `whiteboard-react` | **rename** |
| `whiteboard-substrate-engineer` | `whiteboard-substrate` | **rename** |
| `whiteboard-testing-strategy` | `whiteboard-test-unit` + `whiteboard-test-integration` | **split** |
| `whiteboard-design-systems` | `whiteboard-{composition,abstraction,tokens,naming}` | **recipe expansion** (dispatched as the `design-systems` recipe via `guild recipe`) |
| `whiteboard-sketch-ideation` | (consumer-local) | replaced by a project-local agent generated from `--project-dir`, not a core one |
| `evaluator-contract-fit` | (retained) | hand-authored; the always-on baseline, never generated |
| `evaluator-base`, `whiteboard-base` | (retained) | documentation roots; codegen inlines their content into every generated body |
| `generator-base`, `generator-css-codemod` | **dropped** | see Phase-7 U1 decision below |

The Phase-5-era `generated-equivalence.test.ts` ledger that asserted
tool-set equivalence row-by-row retired with the cutover; the baked
files it read no longer exist, and the freshness test
(`generated-panel.test.ts`) is the live invariant going forward.

## Phase-7 prerequisites (resolved by U1)

Phase 5 stopped at "codegen exists, is committed, and is provably
tool-equivalent to baked." Two questions had to be resolved before
deleting baked, both addressed in Phase 7 U1:

1. **Subdir-loading was unverified.** It was not confirmed that Claude
   Code registered agents from the `agents/generated/` **subdirectory**.
   Generated and baked shared names (e.g. `evaluator-a11y`), so
   generated could not move to the top level while baked still existed.
   **Resolved by construction in U1**: baked deleted, `agents/generated/*`
   moved to top-level `agents/`, codegen default outDir flipped to
   `agents/` for in-place regeneration. Subdir loading is now moot —
   nothing lives in a subdir.

2. **The generator (implementer) agents were not generated.**
   `generator-css-codemod` was an implementer-phase, write-capable agent
   with no `[[combinations]]` row, so `guild generate` emitted no
   replacement, and it was not retained. **Resolved by U1 (operator-
   grilled)**: dropped entirely (both `generator-css-codemod` and
   `generator-base`). The 3-axis (personality x domain x phase) model
   fits skeptical-by-default antipattern-catalog domains (evaluators)
   and design-phase concerns (whiteboards); generator-shaped prose
   (how-to-transform, with carve-outs / output-shape / stopping-
   conditions) doesn't fit the (Scope / Concerns / Antipattern catalog
   / Good patterns / Vocabulary / Cross-domain notes) template the 12
   existing domain fragments follow. Re-introducing generators is a
   future substrate question (a separate fragment template, perhaps,
   or a parallel hand-authored class) — not addressed here. The CSS
   codemod capability itself lives in PR specs and whiteboards if it
   ever becomes load-bearing.

## Live-spawn smoke (post-install verification)

Tool-set equivalence and freshness are checked in CI; the one thing CI
cannot check is that a generated agent actually spawns and emits a
conformant verdict through a real LLM. Run this once after the
guild plugin re-installs downstream from the U1 cutover, and record
the result in a session-note or follow-up checkin:

1. In a session, `Agent`-dispatch one generated reviewer (e.g.
   `evaluator-a11y`) and one generated planner (e.g. `whiteboard-react`)
   against a tiny known-bad sample diff.
2. Confirm a real `VERDICT:` comes back through `guild parse-and-aggregate`
   (not just a parse check) — the line-anchored `VERDICT:` regex is the
   gotcha to mind.

A green smoke is the final proof that the collapse preserved a working
panel. (This session continues to run the stale installed guild copy,
so the smoke can't be run here; it gates on a fresh post-U1 session.)
