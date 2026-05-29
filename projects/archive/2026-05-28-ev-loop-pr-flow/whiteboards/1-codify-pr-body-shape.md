# Whiteboard: Codify PR body shape in § Compose PR

## Round 1

### From whiteboard-substrate-engineer

**Lead finding.** The spec is substrate-coherent and composes cleanly with the adjacent recipes — the `§ Compose PR` Wraps/Idempotency/Failure-modes skeleton is unchanged, only the body-shape paragraph and the stale-doc lines move. The one shape concern worth raising before Phase 1 typing starts is the `**Archetype**: <name>` PLAN.md block. As specced it's an out-of-band convention the recipe reads but the parser doesn't, and the framing in PLAN.md line 19 ("parallel to existing `**Whiteboard**:` / `**Engineers**:` blocks") is a half-truth — `**Whiteboard**:` is parsed into `ParsedPhase.whiteboard` at `plugins/loom/cli/lib/plan.ts:60` and `plugins/loom/cli/lib/types.ts:584-592`; `**Engineers**:` is not parsed by anything, it's a convention only inside this project's own PLAN.md. So the "parallel" really has one member, not two.

**Decision point**: does `**Archetype**:` join `**Whiteboard**:` in `ParsedPhase` (parsed, typed, soft-extension), or stay convention-only like `**Engineers**:` (read by sub-agents reading PLAN.md prose, invisible to the CLI)? Both valid. **Lean toward soft-extension** — additive optional field, no schema-version bump, no consumer churn — because the cost of being parser-known is real (a tiny lib change, a test, a sync) but the value (programmatic archetype lookup) compounds if a future `loom pr compose-body` or `evaluator-pr-body` ever lands. **Concrete recommendation: don't parse it in Phase 1.** Land it as convention the sub-agent reads from PLAN.md prose. Wait until something programmatic actually needs it.

**Stale-doc fix at `:291-293` is a real substrate hazard, not just a typo.** That paragraph instructs the loop to call `§ Phase update --pr=<number> --url=<url> --pr-state=open` — flags the verb explicitly rejects with `pr-flags-unsupported` (`SUBSTRATE-COMPOSITIONS.md:99-101`, `plugins/loom/cli/verbs/loom/phase.ts:155`). Any sub-agent reading the recipe literally would emit a verb call that errors. The replacement text shouldn't just delete the wrong instruction; it should name the right substrate posture (derive-on-demand from `gh pr view` via `loom pr discover`) so the next reader doesn't write the same wrong thing back.

**Family-shape adjacency.** Both `/ev-loop-interactive` and `/ev-loop-confidence` cite `§ Compose PR` (`SUBSTRATE-COMPOSITIONS.md:313-315`). The recipe-shaped change propagates uniformly — no per-loop forking. Worth confirming during Phase 1 that the rewritten spec doesn't accidentally fork in tone: a body-shape that reads cleanly when called from interactive (per-unit verbose context) might feel cramped from confidence (bulk-transform unit table). The `| Action | Target |` table shape is friendly to both, which is the right call.

**Recipe-template five-field constraint.** The recipe template at `SUBSTRATE-COMPOSITIONS.md:17-44` documents 5 fields (Purpose / Wraps / Idempotency / Failure modes / Used by) and explicitly says "a recipe with anything beyond these five fields is the exception, not the norm." Current `§ Compose PR` already exceeds slightly (extra body-shape paragraph inside `Wraps`); Phase 1 rewrite expands this substantially. **Concrete recommendation: land the body-shape spec inside Purpose** (since it's behavioral — "what the loop is trying to achieve"), not as a sixth field. The recipe template explicitly says examples go inside Purpose or Wraps; treat the section-by-section spec as an extended Purpose with sub-headings if needed.

**Append-only invariants.** No coupling — spec governs markdown rendered into `--body-file` (transient temp), nothing writes to events/manifest/checkin partitions. Parallel-session safety unchanged.

**Cost-of-substrate trade.** Heavier than the one-paragraph it replaces and noticeably weightier than sibling recipes. Earned in my read — the diagnosed drift won't be caught by pure convention. Cost lives in the right place: invocation-time (read by sub-agent at compose), not write-time. Risk PLAN.md line 99 names (reviewer pushback on verbosity) is the right one to plan for.

**Carved out.** Voice/length wording, WHY-over-HOW rhetoric, good-vs-bad example craft, archetype-name semantics — defer to design-systems. Substrate-repo Checklist/Rollout fit vs Patreon vocabulary — defer to skeptic.

### From whiteboard-skeptic

The plan reads coherent and the decisions list is unusually complete — skipping "is the shape right" (it is) and going straight at where I think the spec will actually fail on contact with real Phase 2 composition.

**Highest-leverage concern: the Patreon-shape Checklist is a confessional-drift attractor in this repo.** Structural, not stylistic. The locked decision pins i18n + a11y + verified-solution-works + added-tests with "adapt at compose time" as relief. In a substrate repo where ~80% of PRs touch `.ts` / `.md` / `SKILL.md`, **i18n and a11y will be N/A on nearly every PR**. RESEARCH.md § Open question 6 already flagged this. Two failure modes both bad:
1. **Sub-agent strikes silently** → checklist degrades to "verified-solution-works + added-tests" on every PR. We've codified four items, three of which never appear. Spec is partly fictional from PR 1.
2. **Sub-agent N/A's with explanatory text** → "i18n: N/A (TOML config, no user-facing strings)" — that's exactly the confessional voice the WHY-over-HOW rule is trying to kill, now mandated by the spec itself.

Genuinely worry about #2 happening in the Phase 1 PR itself — what does an i18n line look like on a PR editing `SUBSTRATE-COMPOSITIONS.md`? Whatever the sub-agent picks sets precedent.

**Concrete remedy**: split the Checklist into a **substrate-default set** (verified-solution-works, added-tests, sync-shared-ran-if-touched-commons, `npm test` green) and a **product-flavored set** (i18n, a11y) *off by default* in substrate-repo composition, turned on via per-phase override mechanism like `**Checklist-extras**: i18n, a11y`. RESEARCH.md § Open question 6 essentially pre-wrote this recommendation; PLAN.md decisions didn't fully adopt it.

**Second concern: "don't re-narrate the diff" rule will be the first thing to drift; concrete examples alone won't catch it.** Asymmetric failure. The actual failure mode is paragraph-scale: a Motivation that reads WHY-shaped but is really the PLAN exit-criteria rewritten as prose. Sentence-level good/bad examples won't catch it. **Concrete remedy**: add an explicit anti-pattern: *"if the Motivation paragraph could have been written by reading PLAN.md alone without seeing the diff, it's drifted — Motivation says **why this problem matters now**, not **what this PR does**."* Include a paragraph-scale negative example, not just sentence-scale.

**Third concern: 300-word target without a counter means it's a vibe.** Nobody counts words in markdown by hand at PR-compose time. Sub-agents will guess (and overshoot 2x). Likely — even probable — that this very PR busts 300 words and the reviewer doesn't care, because the body is reviewer-friendly at 500. **Concrete remedy**: pick one and commit. (a) Make it advisory and say so — "target ~300 words; longer fine when warranted; test is reviewer-friendly-density not word count," or (b) pair the target with a cut-priority list when over budget. My read: (a) is right for v1. The prescription is *terse third-person voice*; the word count is a proxy. Decouple them.

**Fourth concern: mixed-archetype phases break the conditional-section rule dirty.** Easy cases (pure-code, pure-doc) handled. Hard case is the mixed phase. Phase 1 of *this very project* qualifies — mostly doc-shaped but the stale-doc fix is a small content correction with no observable behavior. What goes in Verification? `sync-shared` + `npm test`? That's verification-of-mechanics, not verification-of-claim. The spec doesn't say. **Concrete remedy**: spec needs to name the **per-unit action table as the load-bearing structural element**, with prose Solution as connective tissue. Rule: **Verification appears when there's an observable claim a reviewer would re-run to confirm.** "I ran the test suite" isn't an observable claim — it's a Checklist item.

**Quick hits:**
- `[meta]` fallback is a trapdoor. Every substrate PR could be argued meta. Needs a tighter test: "use `[meta]` only when the PR touches no plugin's authoritative content and no shared `commons/` source."
- Coda allow-list is two items, RESEARCH inventory showed four. `## Process notes` appeared in a real PR. Spec is fine calling that drift, but should say *where its content goes instead* (probably "Substrate notes" or "What's next").
- Archetype override doesn't address mid-phase archetype drift. If Phase 2 starts Architectural but lands as Refactor-shaped, the spec should say *update PLAN.md alongside the PR body or accept the declared archetype as frame*.

**Predicted first "the spec is wrong about X" moment**: the dogfood Phase 2 PR. My bet: composing sub-agent produces a body where Verification duplicates the action table (because `prWait` has tests, action table says "Add prWait handler + tests" and Verification says "tests cover merge during polling, timeout, flag validation, gh invocation mocked"). Reviewer notices Verification is test-list-from-exit-criteria reworded; either accepts (spec was right; anti-narration rule was soft) or flags (spec needs rule for *Verification when tests ARE the verification*). Pre-empt with: **"if the verification is 'we wrote tests for it,' that belongs in the Checklist (`added tests`), not in a Verification section. Verification names observable claims a reviewer can re-run."**

**Net take**: spec well-shaped, decisions thorough. Two things meaningfully de-risk: (1) split the Checklist default so substrate PRs don't ship with three N/A'd items by default, (2) sharpen the don't-re-narrate rule with paragraph-scale anti-pattern + name the exit-criteria-as-prose failure mode by name.

### From whiteboard-design-systems

Substituting for whiteboard-naming (not session-cached) — bringing the naming + semantic-structure + composition-over-configuration lens.

**Lead concern: "Archetype" is the right shape, but the names ride in from the wrong neighborhood.** Default archetype = "Architectural" with the five CLAUDE.md archetypes as vocabulary. That vocabulary is borrowed from `/Users/krambuhl/.claude/CLAUDE.md` — designed for product-codebase PRs (component refactors, dependency bumps, behavioral bug fixes). Maps imperfectly onto substrate-repo work where almost every PR is "rewrite a spec," "add a recipe," "ship a verb." Through the CLAUDE.md lens, ~90% of substrate PRs nominally type as "Architectural" — the tell that the type isn't carrying meaning.

Two fixes: **Option A** — Keep noun, narrow scope, defer to CLAUDE.md. Recipe says: "Default archetype is Architectural per CLAUDE.md § PR conventions. The five-archetype vocabulary covers what's needed; substrate PRs almost always sit in Architectural, occasionally Refactor or Dependency." Cheap, coherent with prior art. **Option B** — Invent substrate-shaped archetypes (`Spec` / `Verb` / `Recipe` / `Codemod` / `Cleanup`). Names what the PR IS in this repo's terms.

**A is the right call right now.** B violates the "match existing vocabulary; cohesion compounds" rule — operators carry CLAUDE.md vocabulary across all their work. Two competing taxonomies is worse than one slightly loose-fitting set. Revisit B if a few phases of dogfood show "Architectural" doing literally no work — that's a retro signal, not a Phase 1 decision. Recipe should add one or two sentences: *"In this substrate repo, most PRs land as Architectural — substrate work is shape-defining by default. Refactor and Dependency apply on the margins; Migration and Bug fix are rare here."*

**Per-unit table: `| Action | Target |` is literal and leaks intent.** `Action` is fine — semantic. `Target` is leaky — reads as "the thing the action operates on," which in practice is a file path or symbol reference. Biases composers toward file-path content, which is exactly what the PLAN warns against. The column name is fighting its own usage guidance.

Ranked preference:
1. **`| Action | Subject |`** — `Subject` names what the action is *about* (the thing being changed at the conceptual level), not where it lives. "Add recipe for waiting on PR merge" with subject "§ Wait for merge" rather than file path. Subject names a concept; concept references are short by nature; file-path drift becomes self-evident.
2. `| Change | Where |` — honest but less elegant.
3. `| Action | Target |` — current, workable but underspecifies.
4. `| Action | Outcome |` — outcomes belong in `## Verification`, conflates sections.

**Pick `Subject`.** It's the one that survives — same name still makes sense whether the row points at a recipe, verb, skill, doc, or project artifact, because all are conceptual subjects.

**Rollout/Checklist vocabulary: operator-preference, carving out.** RESEARCH.md line 71 already noticed these don't fit substrate ("None use Evan's full template ... heavier than substrate-repo PRs need"). Substrate-fit alternative (sync-shared / docs adjacent / panel verdict / tests) would strike less often than Patreon items. "Every PR strikes 3/4 items" is the user-research signal the template is wrong. But operator carries Patreon vocabulary across all their work; consistency-across-projects beats fit-within-one-project. **I lean toward re-semantizing** but defer to operator. What's load-bearing: the "adapt at compose time" rule (Decision lines 124-125) is the right escape hatch — keep it whatever else changes.

**Section names — semantic, good as-is.** Motivation / Solution / Verification / Rollout / Checklist pass the semantic-vs-literal test. Each names what the section IS, not what it LOOKS like. Survive tone shifts, length shifts, format shifts, porting to different repos. Keep them. (Minor: `Solution` overloads `Motivation` slightly since it implies a problem. Works in practice; less semantically tidy than `Approach` would be — but Solution is what CLAUDE.md uses, cohesion-with-prior-art rule says don't introduce parallel terms unless strong reason. There isn't.)

**Composition: reframe 5 sections as 3 composable layers.** Current spec is "5 sections, 3 required, 2 conditional, plus optional coda allow-list" — flat list with annotations. More compositional framing, same content:
- **Core (required, every PR)**: `## Motivation` → `## Rollout` → `## Checklist`
- **Body (required when there's substantive code or observable verification)**: `## Solution` → `## Verification`
- **Coda (optional, phase-transition only)**: `## What's next` OR `## Substrate notes`

Three layers, each with its own rule about when it appears, ordered top-to-bottom. Closer to the s-expression / composable-primitive shape from CLAUDE.md — "on-the-rails presets" (Core+Body) "with tweakable knobs" (strike items, archetype override) "plus off-the-rails escape hatches" (Coda allow-list, `[meta]` fallback, adapt-at-compose-time). Self-explanatory: pure-doc PRs ship Core-only; substantive PRs ship Core+Body; phase-transition PRs ship Core+Body+Coda. Conditional rule becomes a property of the *layer*, not annotation on individual sections.

**Recipe-template constraint (echoing substrate-engineer).** The 5-field template at `SUBSTRATE-COMPOSITIONS.md:17-44` says anything beyond is exception. Current `§ Compose PR` already exceeds. Phase 1 rewrite expands substantially. **Consider a sixth labeled field (`Body shape:` or similar)** so the prose has a named home rather than being a fat paragraph inside `Wraps`. Reads more like the rest of the file; easier to grep; easier to evolve independently from verb-invocation contract. Structural nit, not naming.

**Summary of recommendations:**
1. Keep "Architectural" as default archetype + add 1-2 sentences naming substrate-shading.
2. Rename `| Action | Target |` → `| Action | Subject |`.
3. Section names are good as-is.
4. Reframe 5 sections as 3 composable layers (Core / Body / Coda).
5. Carving out of Rollout/Checklist vocabulary call (operator preference; flagged the strike-rate signal).
6. Consider sixth labeled field in recipe for body-shape prose.

