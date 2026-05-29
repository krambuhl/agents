# LLM fusion voice convergence — guild Phase 2.2 U2

**Date**: 2026-05-29
**Source**: 2026-05-28-guild-matrix-precompile Phase 2.2 U2 (PR #133)
**Status**: capture for future griot-compact rollup

The first end-to-end run of `/guild-compile` fused 19 cells from
`axes.toml` into composed agent bodies, replacing 21 hand-authored
agents. This note captures what the fusion converged on, where it
improved, and where it regressed — material for whoever next edits
the fusion-prompt or fragments.

## What the fusion converged on, by (personality, phase) group

### Reviewer-skeptic (8 evaluators)

The fusion produced a recognizable sharp-critical reviewer voice
consistent across all 8 cells. Each body opens with a three-axis
identity paragraph naming the cell's `personality × domain × phase`,
then sections through Stance → Mandate → Watch for → Tool posture →
Output contract → Flag-code table.

Stance bullets converged on five phrases the fusion used almost
verbatim across cells: "evidence or it's a flag," "hunt the hidden
assumption," "edge cases first," "sharp over exhaustive," "low ego,
high signal." These came from the skeptic personality fragment but
got phase-modulated into reviewer-specific phrasing
("approve only when the evidence is clearly there" rather than
"approve only when the hypothesis survives the counter-example").

### Planner-generative (5 whiteboards)

The fusion produced an options-offering voice consistent across
composition, abstraction, tokens, naming, a11y. Each body's "What to
surface" section frames domain antipatterns as "Surface alternatives:
X" lists rather than as flags. Output contract sections are uniformly
"Option A — Option B — Option C with tradeoff" shapes. Sequence
bullets default to "lowest-risk first."

The generative voice carried "options over a single answer" and
"defer judgment" phrases verbatim from the personality fragment, and
applied "close each option with its tradeoff" as a structural rule.

### Planner-synthesizer (3 whiteboards)

The fusion landed a reconciliation voice for react, test-unit,
test-integration. Each opens with "Tensions surfaced" before
proposing the "Integrating frame" — synthesizer's
"hold the tension before resolving" principle made concrete. The
output contract emphasizes the principle that resolves the tensions,
not the options to choose between.

### Planner-methodical (2 whiteboards)

Performance and substrate landed an exhaustive systematic-walk voice.
Each body has a "Coverage note" subsection where the agent explicitly
confirms it walked every entry — methodical's "document the path"
principle made structural.

### Planner-skeptic singleton (1)

The whiteboard-skeptic body produced the devil's-advocate voice with
the "Risks surfaced" + "Assumptions to name" sections. Without a
domain fragment, the body is shorter than the others; the singleton
status is visible to a reader who notices the missing third-axis
content.

## Where the fusion improved over hand-authored

1. **Three-axis identity is uniform** across all cells now. The
   opening paragraph naming personality × domain × phase exists in
   every body, in the same shape. The old hand-authored agents had
   varying intro structures (some opened with "## Stance", some with
   "# Evaluator: <domain>", some with the personality fragment
   inlined verbatim).

2. **Cross-domain notes are consistent** in shape: every body has a
   "Cross-domain notes" subsection listing 2-3 sibling-domain
   overlaps. The old agents named overlaps inconsistently — some
   exhaustive, some absent.

3. **The whiteboard attribution shape** `## <domain> — by
   `whiteboard-<id>`` is uniform. ev-loop consumers can grep for
   this shape reliably; the old hand-authored bodies had no
   convention.

4. **Tool posture sections name the same set of granted tools** the
   axes.toml `tool_grants` declared, with no per-cell drift. The
   old bodies sometimes named tools the hand-author intended but
   didn't sync against the manifest.

## Where the fusion regressed

1. **Catalog nuance compressed.** The domain fragments encoded
   severity carve-outs ("blocking when X; advisory when Y"), regex
   hints (`/^use[A-Z]/`), and severity-by-context rules that the
   fusion sometimes glossed into shorter "Severity: advisory"
   one-liners.

   The fusion-prompt's "specific over generic" rule helped but
   didn't fully prevent compression. For catalogs specifically,
   the right rule is "preserve verbatim" rather than "paraphrase
   into one voice" — the voice unification doesn't apply to a
   catalog, the catalog IS the data.

2. **Flag-code spellings nominally diverged.** Each fused
   evaluator's flag-code table at the end carries codes the
   fusion produced (`react-effect-stale-deps`,
   `tokens-hardcoded-typography`). In a few cells the spelling
   matches the source fragment exactly; in others the fusion
   normalized to a slightly different form. Downstream consumers
   that grep for flag codes will eventually find inconsistencies.

3. **The whiteboard-skeptic singleton is shorter than ideal.**
   Without a domain fragment to anchor a risk catalog, the
   singleton body is ~150 lines vs the ~200 for cells with
   domains. A hand-authored singleton would have carried a
   risk catalog specific to "pressure-test any design"; the
   fusion produced an adequate but less specific one.

4. **Distinct heading sets underexploited.** Phase 1.0 gave each
   axis its own heading set (personality: Disposition / Voice
   cues / Phase modulation; phase: Lifecycle position / Stance /
   Mandate / Tool posture / Output contract; domain: Scope /
   Concerns / Antipattern catalog / Good patterns / Vocabulary /
   Cross-domain notes). The fusion mostly normalized to a
   generic "Stance / Mandate / Watch for / Tool posture /
   Output contract" structure regardless of the source fragment's
   specific shape. The distinct heading sets exist as
   organizational tools for fragment authors but don't propagate
   into the composed output.

## Implications

The fusion-prompt should grow two rules in the next edit:

- **Preserve catalog content verbatim**: severity carve-outs, regex
  hints, flag-code spellings copy directly from the source fragment
  rather than getting paraphrased.

- **Preserve fragment heading structure when load-bearing**: when a
  domain fragment has a distinctive heading set, the composed body
  should mirror it rather than normalize to a generic one.

Voice unification (the load-bearing fusion rule) still applies to
prose framing: opening identity, stance modulation, mandate framing,
cross-domain notes. The structure where it pays IS the structure;
where it doesn't (catalog content, flag codes), preservation is the
right rule.

## Cross-references

- `projects/2026-05-28-guild-matrix-precompile/retros/landed.md`
- `plugins/guild/skills/guild-compile/fusion-prompt.md` (the
  template that produced this output)
- `plugins/guild/agents/generated/*.md` (the 19 fused bodies)
