# Agent codegen + the baked-to-generated cutover

`guild generate` compiles guild's antagonist-panel and whiteboard agents
from a 3-axis source model instead of ~21 hand-baked files. This doc is
the reference for how that works and — importantly — what Phase 7 must do
before it deletes the baked agents.

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
  time (Phase 6), not at codegen.
- `[[singletons]]` — a personality at a phase with **no** domain (the
  domain-agnostic `whiteboard-skeptic`). An explicit named exception,
  never a silent `domains = []`.

`tools-map.toml` is the least-privilege fold: `agent.tools =
phase.base [UNION domain.grants at verification phases only]`. Domain
grants apply **only at reviewer + implementer** — planner/researcher are
base-only, even on a granted domain. A missing `[phase.X]` row is a
fail-loud error; a missing `[domain.X]` row is base-only (a default).

`contract-fit` is retained hand-authored (`[retained]`) — the always-on
baseline reviewer, the one principled exception.

## Generated output is committed

Generated agents live committed at `agents/generated/`, marked
`linguist-generated` in `.gitattributes`, each carrying a do-not-edit
provenance banner. They are **not** gitignored-and-generated-on-install:
the agents are the runtime artifact the marketplace ships, and
generate-on-install would reintroduce the installed-vs-source split this
consolidation exists to close, plus a failure mode where a stale/absent
generate step silently runs an empty panel.

The guard against hand-edit drift is `generated-panel.test.ts`
(regenerate to a tmpdir, assert the committed tree is byte-identical) —
the lockfile-freshness shape. Regenerate with `guild generate`; never
hand-edit a file under `agents/generated/`.

## Project-local domains (the off-rails escape hatch)

A consumer project (e.g. aart.camp) adds its own domain without copying
core fragments:

```
guild generate --project-dir=<project>/.guild --out=<project>/.claude/agents
```

`--project-dir` holds the project's own `panel.manifest.toml` +
`domains/<d>.md`. Core base/phase/personality fragments + `tools-map.toml`
resolve from the installed plugin (module-relative), so the consumer never
names the plugin's internal install path. Only the project's agents are
emitted (not the core panel). See
`cli/fixtures/project-local-sketch/` for a worked example
(`sketch-ideation`).

## Installed-vs-source state (current: end of Phase 5)

The generated agents are committed **source**. The running panel still
spawns the **baked** top-level `agents/*.md` by `subagent_type` name —
committing source files does not register them. Generated and baked
coexist; the generated files are inert until the cutover.

## The baked -> generated name mapping (Phase-7 caller migration)

Generated names are the clean `<prefix>-<domain>` form. Where that
differs from a baked name, every caller that spawns the baked name by
`subagent_type` (guild-validate, guild-whiteboard, derive-panel, the
ev-loop whiteboard glob, loom panel overrides, and project whiteboard
overrides) must migrate when the baked agent is deleted.

| Baked | Generated replacement | Note |
|-------|-----------------------|------|
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
| `whiteboard-design-systems` | `whiteboard-{composition,abstraction,tokens,naming}` | **recipe expansion** |
| `whiteboard-sketch-ideation` | (project-local) | replaced by a consumer-generated agent, not a core one |
| `evaluator-contract-fit` | (retained) | hand-authored, never generated |
| `evaluator-base`, `whiteboard-base`, `generator-base` | (inlined) | base contracts, inlined into every generated body |
| `generator-css-codemod` | **none yet** | see Phase-7 prerequisites |

`generated-equivalence.test.ts` asserts tool-set equivalence for every
"replacement" row and that every baked agent lands in exactly one bucket.

## Phase-7 prerequisites (do these BEFORE deleting baked)

Phase 5 stops at "codegen exists, is committed, and is provably
tool-equivalent to baked." Two things must be resolved in Phase 7 before
the baked agents are deleted:

1. **Subdir-loading is unverified.** It is not confirmed that Claude Code
   registers agents from the `agents/generated/` **subdirectory** (the
   docs are silent; no installed plugin uses agent subdirs; the local
   cache is flat). Generated and baked share names (e.g. `evaluator-a11y`),
   so generated cannot move to the top level while baked still exists.
   Phase 7's sequence resolves this by construction: delete baked, **move
   generated to the top-level `agents/`**, re-install, then run the
   live-spawn smoke (below). Do not delete baked until that smoke is green.

2. **The generator (implementer) agents are not generated.** `generator-css-codemod`
   is an implementer-phase, write-capable agent with no `[[combinations]]`
   row, so `guild generate` emits no replacement, and it is not retained.
   Phase 7 must resolve it before deleting `generator-*`: author an
   implementer combination (+ a `generator-<domain>` naming + an
   `agents/personalities`-driven write posture), retain it hand-authored,
   or deliberately drop the capability. `generated-equivalence.test.ts`
   keeps this gap named in CI.

## Live-spawn smoke (deferred to Phase 7)

Tool-set equivalence and freshness are checked in CI; the one thing CI
cannot check is that a generated agent actually spawns and emits a
conformant verdict through a real LLM. Run this once at Phase-7 cutover,
after the flatten + re-install, and record the result in the Phase-7
checkin:

1. Delete the baked `evaluator-*` / `whiteboard-*` / `generator-*`, move
   `agents/generated/*` to `agents/`, re-install the guild plugin.
2. In a session, `Agent`-dispatch one generated reviewer (e.g.
   `evaluator-a11y`) and one generated planner (e.g. `whiteboard-react`)
   against a tiny known-bad sample diff.
3. Confirm a real `VERDICT:` comes back through `guild parse-and-aggregate`
   (not just a parse check) — the line-anchored `VERDICT:` regex is the
   gotcha to mind.

A green smoke is the final proof that the collapse preserved a working
panel.
