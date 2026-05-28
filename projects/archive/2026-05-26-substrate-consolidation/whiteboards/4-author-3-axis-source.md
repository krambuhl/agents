# Whiteboard: 3-axis agent source: tools-map schema + harvest mapping + unit breakdown

## Round 1

### From guild:whiteboard-substrate-engineer

The Phase-4 deliverable that makes or breaks Phase 5 isn't the prose — it's the two machine-read artifacts (`tools-map.toml` and `panel.manifest.toml`) and the inlining contract. Get those shaped right and codegen is a pure fold over source files with zero judgment. Get them loose and Phase 5 inherits a parsing problem. So I'll lead there.

**1. tools-map.toml schema — layered (phase base ⊕ domain grants), not a 48-cell matrix.**

The empirical data already tells you the shape. Every baked evaluator's `tools:` line decomposes cleanly into two layers: a phase-determined base (`Read, Glob, Grep` for the three read-only phases; `Read, Glob, Grep, Edit, Write` for implementer — that's literally `generator-base.md`'s line) plus a domain-specific Bash allowlist. `evaluator-a11y` is `<reviewer-base> + Bash(npm run test:a11y:*)`; `evaluator-nextjs` is `<reviewer-base> + Bash(npm run lint:nextjs:*)`; most domains are `<reviewer-base> + the shared lint/build/test/git quartet`. So the map is a **fold, not a cross-product** — `[phase-base] ⊕ [domain-grants]`, with one composition rule. Don't author 48 cells; author ~4 phase rows and ~12 domain rows and let codegen compose.

```toml
schema_version = 1

# Phase posture — the BASE tool set per phase. Read-only phases get
# the inspection trio; implementer gets write capability. This is the
# `tools:` floor before any domain Bash grant layers on.
[phase.researcher]   ; base = ["Read", "Glob", "Grep"]
[phase.planner]      ; base = ["Read", "Glob", "Grep"]
[phase.reviewer]     ; base = ["Read", "Glob", "Grep"]
[phase.implementer]  ; base = ["Read", "Glob", "Grep", "Edit", "Write"]
base = ["Read", "Glob", "Grep"]   # (repeated per-row; shown flat for clarity)

# Domain Bash grants, keyed by domain then phase. Empty/absent = no
# Bash beyond the phase base. A domain only earns Bash where running a
# command adds signal — which is almost always the reviewer phase.
[domain.a11y.reviewer]
bash = ["npm run lint:*", "npm run build:*", "npm run test:a11y:*", "git status:*", "git diff:*"]

[domain.nextjs.reviewer]
bash = ["npm run lint:*", "npm run lint:nextjs:*", "npm run build:*", "git status:*", "git diff:*"]

[domain.test-integration.reviewer]
bash = ["npm run lint:*", "npm run build:*", "npm run test:e2e:*", "git status:*", "git diff:*"]
```

Codegen composes one agent's `tools:` as `phase.base ∪ map(domain.<d>.<phase>.bash → "Bash(<grant>)")`, dedups, emits the frontmatter line. Two schema invariants I'd write into the parser and a round-trip test (the same real-artifact-regression discipline Phase 1/2 used): **(a) every (domain, phase) referenced by `panel.manifest.toml` must resolve to a row or fall through to the phase base** — a missing key is a default (phase base only), never an error, so adding a domain doesn't require touching every phase; **(b) `bash` grants are append-only relative to the phase base** — a domain can *add* Bash, never *subtract* a base tool. That keeps least-privilege a property of the schema's shape, not of codegen vigilance. The non-obvious win: a domain with no reviewer Bash needs (composition, abstraction, naming for the pure-rhetoric case) simply has no `[domain.*.reviewer]` row and inherits `Read, Glob, Grep` — matching `evaluator-css-architecture` and `evaluator-naming`'s actual baked lines exactly. The schema reproduces the empirical reality without anyone re-deciding it.

One family-shape flag: `css-architecture` and `naming` both ship today as reviewer-only `Read, Glob, Grep` (no Bash). The map should encode that as *absence*, not as an explicit empty array — absence reads as "phase default," empty array reads as "deliberately stripped," and you want the cheaper-to-author one to be the common case. Reserve the explicit empty array for a future domain that genuinely needs Bash suppressed below the phase base (none exist today).

**2. Harvest mapping — the two real fidelity risks are `testing`→split and reviewer-prose→planner-reuse.**

| Domain | Source | Fidelity risk |
|---|---|---|
| a11y | jelly-guild `domains/a11y.md` | clean, harvest as-is |
| composition | jelly-guild `domains/composition.md` | clean |
| abstraction | jelly-guild `domains/abstraction.md` | clean |
| naming | jelly-guild `domains/naming.md` | clean |
| react | baked `evaluator-react-api.md` | adapt: strip verdict/packet framing → domain-knowledge prose |
| tokens | baked `evaluator-tokens.md` | adapt; carries Bash grant |
| css-architecture | baked `evaluator-css-architecture.md` | adapt |
| nextjs | baked `evaluator-nextjs.md` | adapt; carries the `lint:nextjs` grant |
| performance | baked `whiteboard-performance.md` | **planner/researcher-only** per PLAN scope — no reviewer prose to write; risk is *under*-authoring |
| substrate | baked `whiteboard-substrate-engineer.md` | same — design-phase domain, no reviewer cell |
| test-unit | jelly-guild `domains/testing.md` (split) | **SPLIT RISK** — see below |
| test-integration | jelly-guild `domains/testing.md` (split) | **SPLIT RISK** |

The `testing`→`test-unit`/`test-integration` split does *not* come for free. jelly-guild's single `testing.md` is written as one architecture-level domain covering tier choice, mock boundary, and the full antipattern catalog across both tiers. The baked guild family already made this split — `evaluator-test-unit` (vitest, mock-vs-real, isolation) and `evaluator-test-integration` (Playwright, real-DB-over-mock, parallel-unsafe fixtures) are distinct files with distinct catalogs and, crucially, distinct Bash grants (`npm test:*` vs `npm run test:e2e:*`). So the correct harvest is *not* "split jelly's testing.md in two" — it's **adapt the two baked guild evaluators into two domain modes**, and use jelly's `testing.md` only as the source for the shared tier-choice/mock-boundary preamble both inherit. Treating jelly's single file as the source for both would lose the e2e-grant distinction and the Playwright-vs-vitest catalog separation that the baked files already encode. The baked files are the higher-fidelity source here; jelly's is the lower.

The second risk is sharper and I'd press the panel on it: **does one domain mode serve both planner and reviewer phases?** The baked `whiteboard-*` files are written in design-conversation voice ("the questions you press on," "I'd lean toward"); the baked `evaluator-*` files are written in verdict voice ("flag `a11y-missing-name`," severity tags). jelly-guild's *insight* is that these are the *same domain knowledge* viewed through different phase lenses — the antipattern catalog is identical, only the output contract differs. The phase mode supplies the contract (verdict vs section); the domain mode should supply *phase-neutral knowledge* (concerns, antipattern catalog, vocabulary). That means the harvest's real work is **stripping phase-specific framing out of the baked prose**: take `whiteboard-performance.md`'s concerns but drop "your section is one attributed perspective"; take `evaluator-a11y.md`'s antipattern catalog but drop the `VERDICT:`/flag-code scaffolding. What's left — concerns, catalog, good patterns, vocabulary, cross-domain notes — is exactly jelly's `domains/*.md` shape, which is already phase-neutral by construction. **The fidelity test for every adapted domain mode: read it and confirm it contains zero phase words** (no "verdict," no "section," no "flag," no "you write code"). If a domain mode leaks phase vocabulary, the split between domain-WHAT and phase-WHEN has broken and the same mode can't serve both planner and reviewer. For `performance` and `substrate` specifically — PLAN scopes them out of the reviewer phase — the domain mode still authors phase-neutrally; `panel.manifest.toml` simply never lists a reviewer combination for them. The knowledge doesn't know it'll only be used at planner time; that's the manifest's call, not the mode's.

**3. Composition / inlining order — base → personality → phase → domain, outermost-to-innermost identity.**

Phase 5 inlines (zero dispatch-time reads), so Phase 4's job is to author each fragment so concatenation in a fixed order yields a coherent agent. The order should mirror how identity narrows from "who am I in general" to "what specifically am I looking at," because each later section assumes the earlier ones are loaded:

1. **Frontmatter** (codegen-synthesized, not authored): `name`, `role`, `model: inherit`, the composed `tools:` line from the map, `maxTurns: 5` for reviewer-phase agents (every baked evaluator carries it; whiteboard/planner agents don't).
2. **personality-base** — the cross-cutting stance (isolation, low-ego, "you are the combination"). The `personality-base.md` I read does double duty today: stance *plus* the dispatch-time read mechanism. **For the inlined world, the read-mechanism section must be dropped** — there's no "read the domain file at dispatch" once content is inlined. This is a real authoring change in Phase 4, not a Phase 5 concern: the source personality-base needs a variant (or a clearly-marked excisable section) that drops "Composition mechanism (do this first, every dispatch)" because inlining makes it false. Leaving it in would instruct a generated agent to read files that the inlining was meant to eliminate — a silent double-path, exactly the substrate smell I worry about.
3. **personality** (skeptic/methodical/…) — the disposition, the HOW.
4. **phase-base + phase** — the WHEN: lifecycle position, tool *posture* (read-only vs write), output contract (verdict format vs section format). This is where the verdict-vs-prose fork lives. Note guild today has *two* bases here (`evaluator-base.md` and `whiteboard-base.md`) split by output contract; in the 3-axis model that distinction collapses into the phase mode (reviewer→verdict, planner/researcher→section), which is cleaner — one phase axis instead of two parallel base families.
5. **domain mode** — the WHAT: concerns, antipattern catalog, vocabulary. Innermost because it's the most specific and assumes all the framing above.

What belongs where, stated as an invariant so codegen and authors agree: **phase owns the output contract and tool posture; domain owns the knowledge and is phase-neutral; personality owns disposition and is both domain- and phase-neutral.** If a fragment violates its layer's neutrality (a domain mode that names a verdict format, a personality that knows about a11y), the inlining produces incoherent agents and the bug is in the *source*, not the codegen. That's the property to enforce with a lint in Phase 4: domain files contain no phase words, personality files contain no domain words. Cheap to check, and it's the thing that lets Phase 5 be a dumb concatenation.

One inlining-order subtlety worth resolving now: the baked agents open with "Read `whiteboard-base.md` and apply its constraints" — a *reference*. Inlining replaces every such reference with the *content*. So Phase 4 should author the base fragments as *includable bodies* (no "read this other file" self-reference inside them), and author the personality/phase/domain fragments *without* the "go read the base" preamble — that preamble is a dispatch-time artifact that inlining obsoletes. Authoring the fragments reference-free from the start means Phase 5 never has to strip-then-inline; it just concatenates. That's the difference between codegen being a `cat` and codegen being a parser-with-excision.

**4. Unit breakdown — harvest-first, one conceptual change per unit, ~8 units.**

Per the project's per-unit-PR cadence into the `.plan` branch, and harvest-first ordering (jelly-guild lives until Phase 7, so its source is available throughout — sequence by *fidelity confidence*, cleanest harvests first to prove the fragment shape before the adapt-heavy ones):

- **U1 — Phase modes + phase-base.** Harvest all four `modes/phases/*.md` from jelly-guild as-is (they're complete and clean) plus the collapsed phase-base that absorbs `evaluator-base`/`whiteboard-base`'s output-contract fork. Lands first because everything downstream composes *onto* the phase contract; proving the verdict-vs-section fork early de-risks the rest.
- **U2 — Personalities + inline-ready personality-base.** Harvest the 5 personalities + personality-base as-is, *minus* the dispatch-time read-mechanism section (the inlining-incompatible part). One conceptual change: "the personality axis exists and is inline-ready." This is the unit where the reference-free authoring decision gets made concrete.
- **U3 — Clean domain harvest (jelly-native).** The 4 domains that come over verbatim: a11y, composition, abstraction, naming. Lowest fidelity risk, ships early, establishes the domain-mode file shape every later domain conforms to.
- **U4 — React-family adapt.** react, css-architecture, nextjs — adapted from baked evaluators, phase-words stripped. Grouped because they share the JSX/React/Next adaptation pattern and the same strip-the-verdict-framing move.
- **U5 — Tokens + the testing split.** tokens (adapt from `evaluator-tokens`) plus the test-unit/test-integration split from the *two* baked evaluators (not jelly's single file). Isolated as its own unit because the split is the single highest-risk harvest — it deserves review attention alone, and the Bash-grant distinction (`test:*` vs `test:e2e:*`) is load-bearing.
- **U6 — Design-phase domains.** performance + substrate, adapted phase-neutral from the baked whiteboard files, with the planner/researcher-only scope noted (no reviewer cell in the manifest). Small unit; the conceptual change is "design-phase domains author phase-neutrally even though they're never reviewed."
- **U7 — tools-map.toml.** The schema + all rows, with the round-trip / real-artifact regression test the project mandates for every author→consumer pair (codegen is the consumer). Lands after all domains exist so every (domain, phase) the map references actually resolves.
- **U8 — panel.manifest.toml + design-systems recipe + contract-fit retention.** The needed-combinations manifest (not the 240 cross-product), the `design-systems = composition + abstraction + tokens + naming @ planner` recipe, and the explicit retention of hand-authored `evaluator-contract-fit` as the one exception. Lands last because the manifest enumerates combinations *across* all the axes the prior units built; it's the keystone that Phase 5 reads first.

I'd resist collapsing U7 and U8 even though both are TOML — they're different conceptual changes (capability-grant map vs combination-enumeration) and different consumers (codegen-frontmatter vs codegen-which-files), and the per-unit cadence wants them split. I'd also resist front-loading the TOML before the prose: the map and manifest *reference* domains and phases by name, so authoring them before the fragments exist means authoring against names that might still drift. Prose first, machine-read artifacts last, keystone manifest dead last.

One thing I'd want the panel — and probably the skeptic — to settle before U2 lands: whether `personality-base`'s dispatch-read section gets *deleted* in the source or *marked-excisable* and stripped by codegen. Deleting in source is cleaner (the source reflects the inlined reality, no stale instruction) but breaks jelly-guild-style dispatch-time reads if anything still uses them before Phase 7. Marking-excisable keeps both paths alive but reintroduces the strip-then-inline complexity I argued against in §3. I lean delete-in-source — guild's new agents are inline-only by design, jelly-guild keeps its own untouched copy until Phase 7 deletes the whole fork, so there's no consumer of a dispatch-reading guild personality. But that's a premise worth one explicit confirmation, since it determines whether Phase 5's codegen is a `cat` or a `cat`-with-a-scalpel.

### From guild:whiteboard-design-systems

The taxonomy is mostly healthy, and the one place it isn't is exactly where you'd expect: the testing split and the tools-map's relationship to the phase modes. I'll take the four questions in the order that lets each answer feed the next.

**1. tools-map.toml schema — phase-base posture as the high abstraction, domain Bash grants as the low**

The empirical truth from the baked frontmatter is clean: every domain evaluator shares the same read-only spine — `Read, Glob, Grep, Bash(npm run lint:*), Bash(npm run build:*), Bash(git status:*), Bash(git diff:*)` — and then layers ONE or ZERO domain-specific verification grants on top. `evaluator-a11y` adds `Bash(npm run test:a11y:*)`; `evaluator-nextjs` adds `Bash(npm run lint:nextjs:*)`; `evaluator-test-unit` adds `Bash(npm test:*)`; `evaluator-test-integration` adds `Bash(npm run test:e2e:*)`; tokens/react-api/naming add nothing (grep-only domains). `evaluator-css-architecture` is even thinner — pure `Read, Glob, Grep`, no Bash at all.

That is a high/low abstraction pairing begging to be named as one. The phase fixes the BASE posture (the spine + whether write tools are present), the domain contributes a small ADDITIVE grant set. Don't key the full tool list per (domain, phase) cell — that's configuration explosion, the 240-cell matrix the PLAN warns against, expressed in TOML. Compose it instead:

```toml
# tools-map.toml — phase base posture + additive domain grants.
# Codegen resolves an agent's tools as: phase.base ∪ domain.grants[phase].

[phase.researcher]
base = ["Read", "Glob", "Grep", "Bash(git status:*)", "Bash(git diff:*)"]
writes = false

[phase.planner]
base = ["Read", "Glob", "Grep", "Bash(git status:*)", "Bash(git diff:*)"]
writes = false

[phase.reviewer]
base = ["Read", "Glob", "Grep", "Bash(npm run lint:*)", "Bash(npm run build:*)", "Bash(git status:*)", "Bash(git diff:*)"]
writes = false

[phase.implementer]
base = ["Read", "Glob", "Grep", "Bash(npm run lint:*)", "Bash(npm run build:*)", "Bash(git status:*)", "Bash(git diff:*)", "Edit", "Write"]
writes = true

# Domain grants are ADDITIVE and phase-scoped. The verification command
# only makes sense where the phase already runs verification (reviewer,
# implementer) — researcher/planner inherit base only.
[domain.a11y]
grants = { reviewer = ["Bash(npm run test:a11y:*)"], implementer = ["Bash(npm run test:a11y:*)"] }

[domain.nextjs]
grants = { reviewer = ["Bash(npm run lint:nextjs:*)"], implementer = ["Bash(npm run lint:nextjs:*)"] }

[domain.test-integration]
grants = { reviewer = ["Bash(npm run test:e2e:*)"], implementer = ["Bash(npm run test:e2e:*)"] }

# tokens, react-api, naming, css-architecture, composition, abstraction,
# performance, substrate: no domain grants — base posture is the whole story.
```

The semantic win: a reader sees that `nextjs` is "the domain that earns the `lint:nextjs` grant," full stop, and that `reviewer` is "the read-only-plus-verification posture." Two orthogonal facts, each stated once. The 240-cell anxiety dissolves because the table is `4 phases + 12 domains`, not `4 × 12`.

One correction to the jelly-guild phase modes as harvested: they declare the *superset* in frontmatter and lean on prose discipline ("you have Write but don't use it in reviewer"). Phase 5 explicitly wants *least-privilege frontmatter* — the generated reviewer agent should not carry `Write` at all. So the `writes = false` flag isn't decorative; it's the instruction that the phase-base posture, not a behavioral footnote, is what keeps a reviewer read-only. That's strictly better than jelly-guild's model and worth calling out as an intentional divergence in the harvest.

**2. Harvest mapping — and the two fidelity risks that are real**

| Domain | Source | Fidelity |
|---|---|---|
| a11y | jelly-guild `domains/a11y.md` | clean harvest |
| composition | jelly-guild `domains/composition.md` | clean harvest |
| abstraction | jelly-guild `domains/abstraction.md` | clean harvest |
| naming | jelly-guild `domains/naming.md` | clean harvest |
| react | baked `evaluator-react-api.md` | adapt (reviewer-voiced prose) |
| tokens | baked `evaluator-tokens.md` | adapt |
| css-architecture | baked `evaluator-css-architecture.md` | adapt |
| nextjs | baked `evaluator-nextjs.md` | adapt |
| performance | baked `whiteboard-performance.md` | adapt (design-voiced prose) |
| substrate | baked `whiteboard-substrate-engineer.md` | adapt (design-voiced prose) |
| test-unit | jelly-guild `domains/testing.md` (split) + baked `evaluator-test-unit.md` | **split risk** |
| test-integration | jelly-guild `domains/testing.md` (split) + baked `evaluator-test-integration.md` | **split risk** |

**Risk A — the testing split is semantically real, and that's the good news.** Read jelly-guild's `testing.md`: its own vocabulary already centers "tier" (unit / integration / e2e) as a first-class axis, and the antipattern catalog naturally sorts — items 1–4 (impl-detail assertions, mocking the unit, brittle snapshot, vague test names) are tier-agnostic-but-unit-anchored; items 5–6, 9 (fixture leakage, hardcoded waits, mocking the DB the integration test exists to verify) are integration-shaped. The two baked evaluators already split exactly this way: `evaluator-test-unit` says "Vitest is the primary tool whose idioms anchor detection," `evaluator-test-integration` says "Playwright." So the split isn't violence to the source — it's making explicit a seam the source already had. The naming is consistent too: `test-unit` / `test-integration` are sibling compounds on a shared `test-*` stem, named after the TIER they defend (what they MEAN), not the runner (`vitest` / `playwright` would be the literal-leak mistake — runners change, tiers don't). Keep the stem; never name a domain `vitest`.

The one thing the split must NOT do is duplicate the tier-agnostic concerns (assertion specificity, "test names describe the risk") into both files and let them drift. Those belong in whichever file is canonical — I'd put the shared catalog in `test-unit` and have `test-integration` reference it for the cross-cutting items, OR (cleaner, given the no-dispatch-time-reads constraint) accept a small intentional duplication and add a regression test that the shared antipattern text is byte-identical across both. Pick the duplication-plus-test; cross-file references fight the inline-everything Phase 5 model.

**Risk B — design-voiced prose serving reviewer phase, and reviewer-voiced prose serving planner.** This is the sharper one. `whiteboard-performance.md` and `whiteboard-substrate-engineer.md` are written for the *design conversation* — prose, "I'd lean toward," no antipattern catalog with severities. The baked *evaluators* are written for *review* — flag codes, severities, "blocking by default." A domain mode in the 3-axis model has to serve BOTH the planner phase (design voice) AND the reviewer phase (catalog voice), because the same `domains/performance.md` gets composed with both. jelly-guild's domain files solved this by being *phase-neutral*: a `## Concerns`, `## Antipattern catalog` with severities, `## Good patterns`, `## Vocabulary`, `## Cross-domain notes` — structured so the *phase mode* decides whether to read it as "things to design toward" (planner) or "things to flag" (reviewer). That's the contract every adapted domain must hit. So the adaptation work for performance/substrate isn't "copy the whiteboard prose" — it's "re-shape the whiteboard prose into the phase-neutral domain structure," harvesting the *knowledge* while dropping the design-phase *framing*. The reviewer-voiced evaluator domains (tokens, react-api, nextjs, css-architecture) need the inverse: strip the "blocking by default / VERDICT" framing (that's the reviewer phase's job, per `phases/reviewer.md`) and keep the catalog. Per-phase domain prose is NOT needed — one phase-neutral domain file is the cohesive answer, and it's what jelly-guild already proves works.

**3. Composition order — what each axis owns, concatenated outermost-to-innermost**

At generate time, inline in this order (high abstraction → low, general → specific):

1. **`personality-base`** — the three-axis mechanism, isolation stance. The frame.
2. **`<phase>-base` / `<phase>`** — WHEN: lifecycle position, mandate, tool posture (`writes` flag), output contract (verdict vs plan vs artifact vs findings). This is the *high abstraction* — the posture every domain inherits at this phase.
3. **`<domain>`** — WHAT: the phase-neutral concerns + antipattern catalog + vocabulary. The *low abstraction* — the domain specificity the phase posture wraps.
4. **`<personality>`** — HOW: the disposition (skeptic hunts flaws, pragmatist passes cosmetics). Inlined last because it MODULATES the preceding three; it's the thinnest layer and the one that reads as "and do all of the above in *this* voice."

Division of labor, stated as a rule so codegen and reviewers can check it:
- **Phase-base owns**: output contract, tool posture (`base` + `writes`), lifecycle framing, read-only-vs-write discipline. Anything that's true for ALL domains at this phase.
- **Domain owns**: the antipattern catalog, the concerns, the vocabulary, the cross-domain boundary notes. Anything true for this domain across ALL phases — phase-neutral by construction.
- **Personality owns**: disposition only. Zero domain knowledge, zero phase-format. If a personality file mentions a flag code or an antipattern, that's a leak — it belongs in domain or phase.

The frontmatter `tools:` is assembled separately from the body (it's `phase.base ∪ domain.grants[phase]` per §1), not concatenated from the mode files — the mode files describe *posture in prose*, the tools-map produces the *enforced allowlist*. Keep those two as separate codegen inputs; don't try to parse tools out of prose.

**4. Unit breakdown — six units, harvest-first**

jelly-guild stays alive through Phase 7, so the clean-harvest domains can be lifted first and the adaptation-heavy ones can take their time. Each unit is one reviewable conceptual change.

- **U1 — Phase axis + personality axis (clean lift).** Harvest the 5 personalities + `personality-base.md` and all 4 phase modes from jelly-guild as-is, into `plugins/guild/agents/personalities/` and `plugins/guild/modes/phases/`. The one substantive edit: rewrite each phase mode's "Tool posture" section so the posture is least-privilege (the `writes` flag concept) rather than superset-plus-discipline, since that's what Phase 5 codegen consumes. Smallest, most mechanical, ships first to prove the layout.
- **U2 — Clean-harvest domains.** The four jelly-guild domains (a11y, composition, abstraction, naming) lifted into `modes/domains/`. Pure copy plus the cross-domain-notes updates needed now that there are 12 siblings, not 5. Low judgment.
- **U3 — Evaluator-sourced domains (catalog re-shape).** react, tokens, css-architecture, nextjs — adapt the four baked evaluators into phase-neutral domain files (strip the reviewer/VERDICT framing, keep the catalog). One unit because they share an identical transform shape.
- **U4 — The testing split.** test-unit + test-integration, from jelly-guild `testing.md` + the two baked evaluators, with the shared-catalog duplication-plus-regression-test decision from §2 Risk A. Isolated as its own unit because it's the one domain that's a *split*, not a 1:1 adapt — the weird one, gets its own review attention.
- **U5 — Design-sourced domains (framing flip).** performance, substrate — adapt `whiteboard-performance.md` and `whiteboard-substrate-engineer.md` from design-voice into phase-neutral domain structure (§2 Risk B). Separate from U3 because the transform direction is opposite (design→neutral, not review→neutral) and the fidelity risk is higher.
- **U6 — tools-map.toml + panel.manifest.toml + contract-fit + the design-systems recipe.** The wiring layer: the tools-map schema from §1, the manifest of needed combinations, the hand-authored `evaluator-contract-fit` retained verbatim (the one principled exception — it does NOT get collapsed into personality×domain×reviewer because "always-on baseline reviewer" is a panel-composition role, not a domain), and the `design-systems` recipe = `composition + abstraction + tokens + naming @ planner`. That recipe shape is exactly right semantically: design-systems isn't a *domain* (it has no antipattern catalog of its own that isn't already in those four), it's a *named co-dispatch* of four domains at the design phase. Naming it a recipe rather than a 13th domain is the find-cohesion move — it refuses to duplicate the four domains' knowledge under a fifth name.

Six units, harvest-first (U1–U2 clean lifts, U3–U5 escalating adaptation judgment, U6 the wiring). If U6 grows past a comfortable single review, the recipe is the natural calve-off into a U7 — it's the one piece that's a new concept rather than a harvest.

One naming flag to close on, in my lane: the 12-domain set is named after MEANING, not appearance, with one wobble. `a11y, react, naming, tokens, test-unit, test-integration, css-architecture, nextjs, composition, abstraction, performance, substrate` — eleven of these name a body of knowledge or a tier. `react` and `nextjs` are the wobble: they name *technologies*, not concerns, which is the literal-leak pattern (the `BlueButton` of domain names). But unlike `vitest`-vs-`test-unit`, here the technology IS the concern — "react-api correctness" and "Next.js framework correctness" don't generalize to a framework-agnostic principle the way "tier choice" does. So I'd keep them, but name the exception explicitly in the taxonomy doc: these two are intentionally technology-scoped because the framework is the subject matter, not an implementation detail leaking through. That's the off-the-rails escape hatch made into an explicit, named opt-out rather than a silent inconsistency — which is the whole posture.

### From guild:whiteboard-skeptic

The source layout is sound and the harvest-first ordering is the right call. My pressure is on three places where a subtly-wrong Phase 4 source produces a Phase 5 failure that won't surface until the generated panel runs — the gap between "the source reads fine" and "the codegen output is correct" is exactly where this kind of refactor leaks.

**1. The runtime model inverts between jelly-guild and guild, and `tools-map.toml` is where that inversion bites.** In jelly-guild, the agent declares a `tools:` *superset* (`Read, Glob, Grep, Bash, Write, Edit, mcp__*`) and the *phase mode* governs tool use *behaviorally* — `personality-base.md` is explicit: "Honor the phase's tool posture. A skeptic in reviewer phase is read-only; the same skeptic in implementer phase writes code." The new guild model moves that governance from runtime-behavioral to generate-time-frontmatter (least-privilege Bash grants baked per combination). That's a real improvement, but it means the proposed `(domain, phase) -> tools` key is *under-specified*: tool grants in the baked evaluators are domain-AND-phase-bound (`evaluator-test-unit` carries `Bash(npm test:*)`; `evaluator-test-integration` carries `Bash(npm run test:e2e:*)`) — but they're also *personality-invariant* and *phase-pinned to reviewer*. The skeptic personality's superset is identical to the synthesizer's; only domain+phase move the tools. So `(domain, phase)` is the correct key — but the failure mode the PLAN's Open Questions already half-names is the one to harden: **a `(domain, phase)` pair absent from the map at generate time.** Concrete remedy: codegen must *fail loud* on a missing key, never fall through to a permissive default. The dangerous silent path is "key missing -> emit the phase-base posture with no Bash grants" (a researcher-phase a11y agent that can't run axe, looks fine, flags nothing) OR "key missing -> emit the personality superset" (an implementer's `Write` leaking into a reviewer). Make the map *total over the manifest's needed combinations* and have `guild generate` assert that totality as its first step. This is a Phase 4 source-shape decision even though codegen is Phase 5: the map's schema needs an explicit "no default grant" contract written into `tools-map.toml`'s own header comment so the next person doesn't add a fallback to be "helpful."

**2. The testing split is real, but the substrate domain is the one pretending one file covers two jobs — and the direction of that risk is opposite to what the brief frames.** Read against the baked agents, `test-unit` vs `test-integration` is a *genuine* split, not cosmetic: the two baked evaluators have distinct antipattern catalogs (vi.mock hoisting, fake timers, spy-reset vs. fixture-leak, storage-state-race, auto-wait), distinct runtime signals (`npm test` vs `npm run test:e2e`), and distinct tool grants. jelly-guild's single `testing.md` is the *thinner* artifact — it's the tier-agnostic architecture layer ("choose the cheapest reliable signal," "mock at the right boundary") that sits *above* both. So the harvest isn't "split one body of knowledge into two" — it's "the design-phase testing-strategy concerns map to jelly's `testing.md`, and the two reviewer-phase evaluator catalogs are *additional* domain prose that has no jelly source at all." Don't let the split framing trick you into halving `testing.md`; it should become the *planner/researcher-phase* content for *both* test domains, with the two evaluator catalogs supplying the *reviewer-phase* content. The actual cosmetic-split trap is **`substrate`**: `whiteboard-substrate-engineer.md` says outright "there is no `evaluator-substrate-engineer`. Substrate concerns are design-phase, not review-phase." So `substrate` is a domain that legitimately has *no reviewer phase*. Same for `performance` — the PLAN itself defers the reviewer-phase performance evaluator ("`performance` stays a planner/researcher domain"). If the source model or `panel.manifest.toml` assumes every domain crosses all four phases, you'll either generate a hollow `substrate@reviewer` agent (prose written for design, masquerading as a reviewer) or codegen will look for a reviewer-phase body that doesn't exist. Concrete remedy: the manifest must encode **per-domain valid-phase sets**, not a uniform 4-phase assumption — `substrate: {researcher, planner}`, `performance: {researcher, planner}`, the test domains weighted toward reviewer. This is the single most likely place a subtly-wrong Phase 4 source silently produces a wrong-but-parseable Phase 5 agent.

**3. Source drift during the Phase 4-7 window is the compounding debt, and the remedy is a test, not a discipline.** Between Phase 4 (mode files authored) and Phase 7 (baked agents deleted), both the new mode files *and* the baked `evaluator-*`/`whiteboard-*` files exist and encode the same domain knowledge. The brief names this correctly. The trap: someone fixes a real bug in `evaluator-test-unit.md`'s catalog during this window (it's the live, panel-wired file) and the new `modes/domains/test-unit.md` *doesn't* get the fix — so Phase 5 codegen bakes the *stale* knowledge and the bugfix silently regresses at cutover. "We'll keep them in sync" is the failure mode; sync-by-vigilance across a multi-week window with parallel agent sessions doesn't hold. Concrete remedy, and it's the same lesson the project's own RESEARCH lineage already learned (fixtures-mask-real-breaks): write a **drift-detection test in Phase 4** that asserts the harvested mode prose still contains the load-bearing invariants of its baked source — not a full string-diff (the prose is legitimately reshaped), but a content-presence assertion over the antipattern *flag codes* (`test-unit-vi-mock-not-hoisted`, `test-integration-storage-state-race`, etc., are stable identifiers that *must* survive the harvest). If a baked evaluator gains a flag code the mode file lacks, the test fails and names the drift. That converts "remember to sync" into "CI tells you." It also gives Phase 7's deletion a green-light signal: the baked files are safe to delete when the drift test confirms every flag code they carry is present in the mode source.

One thing I'm explicitly *not* flagging as a real risk: the taxonomy overlaps the brief invites me to hunt (react vs nextjs, css-architecture vs tokens, composition vs abstraction). Those boundaries are already adjudicated in `PANEL-COMPOSITION.md` with file:line precision — the tokens/naming/architecture three-way boundary, the react-api/nextjs runtime-vs-framework split, the composition/abstraction cross-domain notes in jelly's `testing.md`. That's *settled* consensus that survives pressure, not false consensus; the boundaries are documented, tested by precedence ordering, and the overlap-resolution policy is explicit. Re-litigating them would be exactly the contrarian-for-its-own-sake move I'm supposed to avoid. The one boundary I'd ask the panel to *confirm* rather than assume: `PANEL-COMPOSITION.md` is the source of truth for the *runtime panel* (which evaluators fire on which files); make sure Phase 4's `panel.manifest.toml` *derives from* that doc rather than re-encoding the file-type mapping independently — two sources for "which domains exist" is its own drift risk, smaller than #3 but the same shape.

