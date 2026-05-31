<!-- sync-shared: plugin-local -->
# Agent codegen + the LLM-fusion pipeline

`/guild-compile` compiles guild's antagonist-panel and whiteboard agents
from a 3-axis source model (declared in `axes.toml`) via in-session LLM
fusion against a checked-in `fusion-prompt.md`. This doc is the
reference for how that works.

History: the predecessor pipeline was `guild generate`, which read
`panel.manifest.toml` + `tools-map.toml` and produced text-concatenated
agent bodies. Phase 2 of `guild-matrix-precompile` (PRs #126-#133)
replaced it with the declarative `axes.toml` + LLM-fusion model. The
old verb, the old TOMLs, and the old hand-curated agent files are
deleted as of PR #133; this doc reflects the post-cutover state.

Update (guild-workflow-coverage, 2026-05-29): the spawnable agents were flattened from `agents/{generated,retained}/` to a flat `agents/`, and all codegen *source* was consolidated under `modes/` — the personality fragments moved from `agents/personalities/` to `modes/personalities/` (joining `modes/{domains,phases}`), and `axes.toml` plus its schema tests (`axes-schema.test.ts`, `fragment-schema.test.ts`) moved from the plugin root into `modes/`. So the source/output split is now physical: everything codegen *reads* lives under `modes/`, everything it *writes* lives flat under `agents/`. The "where things live" paths below reflect that layout; the historical narration of earlier phases (Phase-7 U1 etc.) is left as-is.

## The model

An agent's identity is **personality x domain x phase**, inlined at
compose time by the LLM:

- **personality** (HOW) — `modes/personalities/<p>.md` (skeptic,
  methodical, generative, pragmatist, synthesizer) + the shared
  `personality-base.md`.
- **domain** (WHAT) — `modes/domains/<d>.md` (the antipattern catalog /
  concerns / vocabulary for a lens).
- **phase** (WHEN) — `modes/phases/<phase>.md` (researcher, planner,
  reviewer, implementer) — the lifecycle position + output contract.

`axes.toml` declares the matrix in six sections:

- `[axis.domain.<name>]` — domain axis-values with `phases = [...]`
  (which phases this domain occupies) and `tool_grants = [...]`
  (additive grants at verification phases).
- `[axis.personality.<name>]` — personality axis-values with
  `phases = [...]` (which phases this voice fits) and `disposition`
  (free-text the fusion sees).
- `[axis.phase.<name>]` — phase axis-values with `base_tools = [...]`,
  `writes: bool`, and `default_personality` (for recipe defaults).
- `[[recipes]]` — curated subsets of the cross-product for `guild-spawn`
  dispatch. Each recipe names a `(phase, personality, domains[])`
  triple. Consumed at dispatch time via `guild recipe <name>`; not
  affecting the cell catalog or fusion.
- `[[singletons]]` — `(phase, personality)` pairs with no domain
  (the domain-agnostic `whiteboard-skeptic`). An explicit named
  exception, never a silent empty domain.
- `[[retained]]` — names hand-authored agents the codegen pipeline
  never touches (e.g. `evaluator-contract-fit`). Lives flat at
  `agents/<name>.md`.

The tool fold is computed at the `resolve` stage:
`agent.tools = phase.base_tools ∪ domain.tool_grants` (at phases that
declare verification — reviewer + implementer). Planner and
researcher phases ignore `tool_grants` and use `phase.base_tools` only.

### Fragment heading sets

Each fragment axis carries a **canonical heading set** so the
labeled-section signal is mechanical: dedup and LLM fusion (Phase 2.1)
operate on stable `(heading, body)` pairs rather than free prose.
A fragment-schema test (Phase 1.0 U4) enforces presence and order at
lint-time. Locked in by Phase 1.0 of `guild-matrix-precompile`; preserved
through the Phase 2 LLM-fusion cutover.

#### Domain fragments (`plugins/guild/modes/domains/<name>.md`)

Required, in order:

1. `## Scope` — what this domain covers (1-2 paragraphs); for
   design-phase-only domains, name the absence of a reviewer cell
   here.
2. `## Concerns` — bullet list of pressure points / antipattern
   signals / questions the lens asks.
3. `## Antipattern catalog` — the catalog the reviewer evaluator
   walks. For design-phase-only domains (`performance`, `substrate`),
   a stub paragraph noting "no reviewer cell — see § Cross-domain
   notes for boundaries" satisfies the schema.
4. `## Good patterns` — counter-examples / what doing it right looks
   like.
5. `## Vocabulary` — terms with one-line definitions. Grounds LLM
   fusion in stable vocabulary.
6. `## Cross-domain notes` — boundaries vs. adjacent domains.

Optional, at canonical positions when present:

- `## Detection` — runtime / static-analysis signals for catalog
  entries. Position: between `## Antipattern catalog` and
  `## Good patterns`.
- `## Carve-outs` — what's deliberately not in this lens's scope.
  Position: between `## Antipattern catalog` (or `## Detection` when
  both present) and `## Good patterns`.

Any other `## ` heading in a domain fragment fails the schema.

#### Phase fragments (`plugins/guild/modes/phases/<name>.md`)

Required, in order:

1. `## Lifecycle position` — when in the unit-of-work flow this phase
   fires + which of the legacy agent classes (researcher / planner /
   reviewer / implementer = generator) it embodies.
2. `## Stance` — the HOW posture for this phase (skeptical,
   write-bounded, design-phase-pressure, etc.).
3. `## Mandate` — the WHAT: bullet list of what the agent must do.
4. `## Tool posture` — granted tools + read-vs-write capability
   statement.
5. `## Output contract` — what the agent emits; verdict shape (for
   reviewer); deliverable shape (for others).

Cross-axis composition guidance (formerly the per-phase
`## Combining with domain + personality` section) is **not** a
fragment-level section. The LLM fusion prompt in Phase 2.1
(`fusion-prompt.md`) carries cross-axis assembly logic in one place;
per-phase fragments stay axis-local.

#### Personality fragments (`plugins/guild/modes/personalities/<name>.md`)

Applies to the five personality fragments: `generative`,
`methodical`, `pragmatist`, `skeptic`, `synthesizer`.
**`personality-base.md` is exempt** — it is documentation root for
the personality class (the inheritance / shared context every
personality references), not a personality fragment per se; its
content is inlined into every generated agent body via the fusion
prompt.

Required, in order:

1. `## Disposition` — the HOW the personality brings: pace,
   criticality, voice posture.
2. `## Voice cues` — concrete phrases / output patterns that signal
   this personality in artifact prose. New content for most files in
   Phase 1.0; supports LLM fusion in Phase 2.1 with stable style
   anchors.
3. `## Phase modulation` — how the disposition expresses differently
   across reviewer / researcher / planner / implementer phases.

Any other `## ` heading in a personality fragment (other than
`personality-base.md`) fails the schema.

#### Enforcement

`plugins/guild/fragment-schema.test.ts` walks each axis's directory
and asserts every fragment file matches its canonical set
(presence, order, optional-position, no extras). Drift fails the
test with a localized message naming the offending file. The
canonical sets above and the test's `*_REQUIRED` / `*_OPTIONAL`
constants change together — if one shifts, both shift.

### Retained hand-authored agents

`evaluator-contract-fit` is deliberately retained hand-authored and
never fused. It lives flat at `agents/evaluator-contract-fit.md`
and is declared in `axes.toml`'s `[[retained]]` section. It's the
always-on baseline reviewer — a panel-composition role, not a
personality × domain combination; the one principled exception to
the axis collapse.

The old `evaluator-base.md` and `whiteboard-base.md` files were
deleted in Phase 2.2 U2. Their cross-cutting framing (read-only
stance / packet handling / verdict format / section format /
cross-perspective courtesy) is now carried by the phase fragments
(`modes/phases/{reviewer,planner}.md` after Phase 1.0's rewrite)
and inlined into every composed body by the fusion-prompt.

## The implement-verify-fix output contract

The write-capable postures (implementer, fixer) and the reviewer
compose into a single implement-verify-fix cycle. Each posture's
output is specified in its own phase fragment's `## Output
contract`; this section is the consolidated reference for how the
three hand off, so a caller wiring the cycle (a loop, a workflow)
knows the shape each step produces and consumes.

**Implementer** (`modes/phases/implementer.md`) returns: the
artifact (created/modified files), a description of what was done
(actions, files touched, and any fork decision the contract didn't
cover), verification evidence (read-only command output — lint and
build, plus tests where the domain grants a runner), and
corrections (anything the contract got wrong). It emits **no
verdict** — the artifact goes to the reviewer.

**Reviewer** (the `reviewer` phase, e.g. `evaluator-css-architecture`)
returns the evaluator verdict shape (the `evaluator-base` stance,
parsed by `guild parse-and-aggregate`): a `VERDICT:` line
(`approved | flagged | recused`) plus, when flagged, a Reasons
section whose bullets become findings. Each finding carries
`{code, evidence, remedy}` and a `blocking | advisory` severity.
This shape is **consistent with the `evaluator-finding-emitted`
event** (`{slug, phase, unit, evaluator, code, severity}` — see
`commons/cli/lib/types.ts`): the panel emits one such event per
finding, so a finding's `code` and `severity` are the same fields
the reviewer's output already carries. The reviewer invents no
parallel shape; the event is the telemetry projection of the
finding.

**Fixer** (`modes/phases/fixer.md`) consumes the reviewer's flagged
findings and returns: the corrected artifact, a description of what
was fixed mapped to the finding each change clears, re-verification
evidence, and corrections (any finding it could not fix or believes
is wrong). Like the implementer it emits **no verdict** — the
corrected artifact returns to the reviewer, which decides whether
the findings are cleared.

The handoff:

```
implementer --(artifact + what-changed)--------------> reviewer
reviewer    --(VERDICT + findings: code/severity/----> fixer      (when flagged)
               evidence/remedy)
fixer       --(corrected artifact + what-fixed)------> reviewer    (re-review)
```

The cycle terminates when the reviewer returns `approved` (or
`recused` — domain non-applicable). Neither write-capable posture
self-approves; the reviewer is the only verdict-emitter, which keeps
the gate honest — an agent never grades its own homework. Wiring
this cycle into an automated firing layer (the ev-loop becoming the
fire-and-collect layer) is a deferred, separate effort; this
contract is the shape that layer will orchestrate.

## Generated output is committed in-place

Fused agents live committed flat at `plugins/guild/agents/`.
Each fused file carries a do-not-edit provenance banner and is
marked `linguist-generated` in `.gitattributes`. They are **not**
gitignored-and-generated-on-install: the agents are the runtime
artifact the marketplace ships, and generate-on-install would
reintroduce the installed-vs-source split this consolidation exists
to close, plus the failure mode where a stale fusion run silently
ships an empty panel.

The guard against hand-edit drift is `guild compile --check`. It
verifies — without any LLM call — that every committed agent file
hashes to its cache `output_hash` and every source fragment hashes
to its cache `source_hashes`. Drift surfaces in six categories
(source / output / prompt / missing-cache / missing-on-disk /
stale-cache). Re-fuse with `/guild-compile`; never hand-edit a file
emitted by the pipeline.

**Output directory**: `guild compile` and `/guild-compile` write to
`plugins/guild/agents/` by default. The `--output-dir=<path>`
flag overrides this — tests use a tmpdir.

## Project-local domains (the off-rails escape hatch)

A consumer project adds its own domain without copying core
fragments by pointing `/guild-compile` at a project-local
`axes.toml` augmenting the core:

```
guild compile --axes-toml=<project>/.guild/axes.toml \
              --output-dir=<project>/.claude/agents/generated
```

The project-local `axes.toml` declares only the project's domains;
core base/phase/personality fragments and the canonical cross-product
resolve from the installed plugin (module-relative). The fusion
prompt at `plugins/guild/skills/guild-compile/fusion-prompt.md`
applies to both core and project-local cells. See
`cli/fixtures/project-local-sketch/` for the legacy worked example
shape; it predates the LLM-fusion cutover and will be updated when
the first consumer-local example lands under the new pipeline.

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
   with no matching `axes.toml` recipe row, so the pipeline emitted no
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
conformant verdict through a real LLM. Run this once after the guild
plugin re-installs downstream from the U1 cutover, and once again
after any subsequent codegen run that meaningfully changes fragment
shape.

### Prerequisite

Confirm the installed guild copy is fresh:

- `~/.claude/plugins/cache/krambuhl/guild/<commit>/agents/evaluator-a11y.md`
  exists.
- `bin/guild` is on PATH (`command -v guild`).
- Today's session has not previously dispatched either of the agents
  named below — agent definitions are loaded once per Claude Code
  process; a session that already cached the pre-cutover version of
  `evaluator-a11y` will spawn the stale one regardless of what's now on
  disk.

### Step 1 — Dispatch one generated reviewer

In a fresh Claude Code session, invoke `Agent` with
`subagent_type: evaluator-a11y` and the brief below. The sample diff
is a synthetic profile-badge component that legitimately fails a11y
(no `alt` on the `img`, click-only `div` with no keyboard handler,
literal color in `style`):

```
## How to evaluate efficiently

Tight budget. Spot-check then emit `VERDICT:` immediately.

## Contract (paraphrased)

Goal: a ProfileBadge component for the directory page. Must pass
accessibility lint and use the project's design tokens.

Acceptance criteria:
1. Image has accessible text alternative
2. Interactive surface is keyboard-reachable
3. Colors come from the design-token palette, not literals

## Artifact

**Files:** + src/components/ProfileBadge.tsx (new, 7 lines)

```tsx
export function ProfileBadge({ src, name }: { src: string; name: string }) {
  return (
    <div onClick={() => console.log('click')}>
      <img src={src} />
      <span style={{ color: '#888' }}>{name}</span>
    </div>
  );
}
```

## Original ask

"Build a small ProfileBadge for the directory page that meets a11y
and uses our design tokens."
```

Expected: a `VERDICT: flagged` response naming the missing `alt`,
the click-only `div`, and the `#888` literal as reasons.

### Step 2 — Dispatch one generated planner

In the same session, invoke `Agent` with
`subagent_type: whiteboard-react` and the same artifact + a brief
asking for an API-shape review. Expected: an architectural note
calling out the prop shape, the missing semantic role, and a
suggested composition.

The planner's output is free-form prose, not VERDICT-shaped — it
participates in `guild-whiteboard`, not `guild-validate`. Confirm it
produced *something* substantive about the sample artifact.

### Step 3 — Verify the verdict line is parseable

Save the reviewer's full output to a temp file and run:

```
guild parse-and-aggregate <<'GUILD_INPUT'
[{"agent": "evaluator-a11y", "output": "<verbatim reviewer output>"}]
GUILD_INPUT
```

Expected output (abbreviated): a JSON document with
`"verdict": "flagged"` and at least one entry in `blocking_findings`.

The line-anchored `VERDICT:` regex is the gotcha to mind — see
`[[feedback_guild_aggregate_verdict_line_anchored]]`. A summarized
output with `VERDICT: …` appearing mid-line will read as a parse
failure even though the verdict was emitted. The verdict line MUST
start at column 0.

### Step 4 — Record the result

Write a one-shot session-note at:

```
learnings/session-notes/<YYYY-MM-DD>-guild-smoke-postcutover.md
```

Capture: which agents were dispatched, the verdict line each emitted
verbatim, the parse-and-aggregate output, and whether the smoke is
green. Commit alongside the session it ran in; the substrate trail
survives even if `/griot-compact` later does not promote the note
into the rollup.

### What "green" looks like

- Step 1's reviewer emits a `VERDICT: flagged` with reasons covering
  at least one of the three intentional defects.
- Step 2's planner emits substantive prose about the artifact (no
  refusal, no apology, no "I don't see any issues").
- Step 3's `parse-and-aggregate` returns a structured aggregate with
  `"verdict": "flagged"` and the matching findings.

### If the smoke fails

- **Step 1 emits `VERDICT: approved` on a known-bad artifact**: the
  generated reviewer is missing rubric criteria or the fragment-fold
  dropped them. Re-run codegen and re-spawn the smoke.
- **Step 1 produces no `VERDICT:` line at all**: the generated
  evaluator's body skipped the verdict-format section. Diff against
  `evaluator-base.md` § Verdict format.
- **Step 2's planner refuses or apologizes**: the personality fragment
  may be mis-bundled. Diff against `personalities/<name>.md`.
- **Step 3's parse-and-aggregate reports `parse-failure`**: check the
  verdict-line column-anchoring per
  `[[feedback_guild_aggregate_verdict_line_anchored]]`.

A green smoke is the final proof that the collapse (or any subsequent
codegen sweep) preserved a working panel.
