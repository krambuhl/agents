# Whiteboard: Bootstrap marketplace for self-development

## Round 1

### From whiteboard-substrate-engineer

Three shape questions I want to press on before the panel moves on. The brief is well-thought; my pushes here are about *which* invariants the bootstrap quietly establishes for everything downstream.

### 1. The doc family's shape needs a contract, not just a directory

The brief frames the three docs as siblings ("the family") but doesn't define what makes them a family. That gap will cost more than it looks. Substrate docs are read by future skill bodies, future sub-agents loading at `bin/griot use --as=llm`, future evaluators auditing recipe calls. Every reader needs to know: where does idempotency live? where do I look for the CLI shape? where does failure-mode live?

I'd argue for an explicit "recipe template" landing in `docs/SUBSTRATE-COMPOSITIONS.md` as a meta-section at the top — not as a footnote, as the literal first section. Something like:

> Each recipe in this doc has the shape:
> - **Heading**: `§ <Recipe name>` (the citation form skill bodies use).
> - **Wraps**: the CLI call shape (one verb, with the canonical flag set).
> - **Idempotency**: what happens when called twice (safe / fails-loud / not-idempotent-and-here's-why).
> - **Failure modes**: what fails, what's surfaced, what's left on disk.
> - **Callers**: which skill bodies cite this recipe (kept fresh by Phase 1.3's grep).

That last field is the substrate-shape one I most want. The cross-reference `Callers:` field turns the recipe doc into a *bidirectional* graph — Phase 1.3's grep cross-check becomes a recurring check, not a one-time port verification. When Phase 8 deletes `bin/draft`, the `Callers:` list on `§ Revise PLAN.md` tells you exactly which files need updating. Without it, every recipe deletion turns into a fresh grep.

Same instinct for `LOOM-CONVENTIONS.md`: each artifact section should declare its **schema_version** stance (additive-only? version-tagged?) and its **write surface** (which CLI verbs append? which are append-only? which mutate?). That gives Phase 4's ~25 new event types a stable home: they slot into a documented "events.jsonl is append-only, vocabulary is additive" contract, not a free-for-all.

`AGENT-CONVENTIONS.md` is the trickiest of the three because it's the only one being authored from whole cloth. The brief lists four things it documents ([portable], startup-brief, RECOVERY-STATUS.json, two-budget). Those are different *kinds* of conventions: marker syntax, ritual, file shape, parameter shape. I'd separate them into named sections rather than running them together — and I'd lean on the same `Callers:` shape so a future agent author can see "where does the [portable] marker get read?" without grepping.

### 2. RECOVERY-STATUS.json is a substrate artifact and needs schema discipline

This is the substrate-shape concern I most want surfaced in Phase 1. The brief introduces `RECOVERY-STATUS.json` as a new file shape that will be written by sub-agents starting in Phase 3 and read by parent skills in Phase 4, 5, etc. It joins `manifest.json`, `events.jsonl`, `config.json` as a piece of substrate state.

Phase 1 is documenting it in `AGENT-CONVENTIONS.md` — good. But the doc needs to commit to substrate invariants up front, before any code writes a single instance:

- **Lifecycle**: is RECOVERY-STATUS.json append-only (one file per failure, named with a timestamp / step id) or single-instance (one file, overwritten on re-failure)? The brief implies single-instance ("on next invocation, detect the file and offer to resume"). Single-instance is fine, but it means *the second failure clobbers the first failure's context*. That might be intended (only the latest failure matters), but it should be a written decision, not an emergent one.
- **Parallel-session safety**: what happens if two `/loom-plan` sessions are running concurrently against the same slug and both fail? They both write RECOVERY-STATUS.json. Currently the substrate doesn't enforce single-session-per-slug; the loom project doesn't lock. The doc should either declare "RECOVERY-STATUS.json assumes single-writer-per-slug, parallel-session use is undefined" or use a per-session naming scheme (`RECOVERY-STATUS-<session-id>.json`). Pick now, document now — finding this in Phase 5 means three skills already encode the wrong assumption.
- **Resume semantics**: the brief says "research resumes from last completed shift; plan re-reads partial PLAN.md and continues grill-me from the next unresolved question." That's resume semantics *per skill*, not per file. The file shape should encode which skill wrote it (`"parent_skill": "loom-research"`) and which step the resume target is (`"failed_step": "<step-id>"`, `"resume_from": "<step-id>"`). Without that, the read path in Phase 4+ has to infer from filename or content, which is fragile.
- **Where it lives**: brief says "at project root." Concretely: `<slug>/RECOVERY-STATUS.json` next to `manifest.json`? That's the right shape (project-scoped, alongside other substrate state), but state the path explicitly so the loop bodies in Phase 5+ don't each invent their own.

This is exactly the case where Phase 1 cheap commitment prevents Phase 5+ expensive churn.

### 3. Symlink shape: whole-dir is right, but the chicken-and-egg ordering is worth a note

The brief picks whole-dir (`~/.agents/docs` → `<marketplace>/docs`) mirroring `cli` and `learnings`. Agree fully. The `docs/` directory is marketplace-owned: there's no plausible future where an npx-installed skill ships its own docs to merge into `~/.agents/docs/`. Per-item symlinking is for namespaces with multiple authors (skills, agents); single-owner namespaces want whole-dir. The existing install.sh comment makes this exact distinction at lines 36-37 — `docs/` belongs in the `cli` / `learnings` group, full stop.

One adjacent shape concern: the doc paths cited in skill bodies need to resolve consistently across two invocation contexts:

- **From a consumer project**, when `/ev-loop-interactive` runs and references "see § Compose PR in docs/SUBSTRATE-COMPOSITIONS.md," that path is *not* cwd-relative. It needs to resolve to `~/.agents/docs/SUBSTRATE-COMPOSITIONS.md` (the symlinked location). The brief says "marketplace-rooted path" — be concrete in skill bodies about whether the citation form is `~/.agents/docs/SUBSTRATE-COMPOSITIONS.md` or just `docs/SUBSTRATE-COMPOSITIONS.md` (implicitly under `~/.agents/`).
- **From inside the marketplace clone itself**, when a maintainer is reading skill bodies during development, the path needs to also resolve there. `~/.agents/docs/` will resolve correctly in both cases (the marketplace clone's own `docs/` is reached via the symlink), so the citation form should be `~/.agents/docs/SUBSTRATE-COMPOSITIONS.md` — fully qualified, identical across contexts.

The current cwd-relative `projects/SUBSTRATE-COMPOSITIONS.md` form has bitten this exact shape: it only works when cwd is the marketplace clone. Don't replace it with another cwd-relative form (`docs/SUBSTRATE-COMPOSITIONS.md`) — go all the way to the symlinked path. That's the substrate-stable form.

### Pushing on the open questions in the brief

- **Test runner choice (vitest vs node:test vs uvu)**: not my lens; deferring to skeptic / performance. The substrate-shape question I'd add: whichever runner you pick, the choice constrains every future test in `cli/`. vitest's strength is config-via-package.json (no separate vitest.config needed for the simple case) and ESM-first ergonomics. node:test's strength is zero-dep (no `npm install` step before `npm test`). For a marketplace that wants to stay simple and dependency-light, node:test is the substrate-cleanest answer; for a marketplace whose tests already exist as `.test.ts` files and assume a vitest-ish runner, vitest avoids rewriting 20 test files. Check what the existing tests *import* (`import { describe, it, expect } from 'vitest'`?) — that constrains the answer hard. If they're already vitest-shaped, the migration cost to node:test outweighs the dep cost.

- **What could go wrong with the bootstrap (skeptic's territory, but one substrate concern)**: the `bin/draft` shim still exists at Phase 1 merge time, and Phase 8 deletes it. Between Phase 1 and Phase 8, *this project's own skill bodies* (the `/ev-loop-interactive` driving execution) will reference `bin/draft revise` in places where Phase 4 is going to swap to `bin/loom revise-plan`. The recipe doc bodies authored in Phase 1 need to commit to *which CLI* they wrap — `bin/draft` or `bin/loom`. The brief's "Update the § Revise PLAN.md recipe in Phase 8" suggests the recipe initially documents `bin/draft revise` and migrates in Phase 8. That's fine, but Phase 1's recipe body for `§ Revise PLAN.md` should *explicitly* note "(Phase 8 will migrate this to `bin/loom revise-plan`)" — that's a substrate-evolution breadcrumb the future reader (and the Phase 8 author) needs.

### What I'm not pressing on

- Recipe content discipline ("each recipe documents the CLI call shape and idempotency story") — design-systems' lens on vocabulary consistency overlaps here; defer to them on whether the *language* of recipes is consistent across the doc.
- Test runner ergonomics, watch-mode behavior, vitest config shape — performance / DX territory.
- The skill-body rewrite cost from `projects/SUBSTRATE-COMPOSITIONS.md` → marketplace-rooted — that's mechanical migration; it's fine.

### Summary, distilled to the contract for the Phase 1 unit

The substrate invariants Phase 1 should write down (not just imply):

1. Recipe template shape: `§ Name` / Wraps / Idempotency / Failure modes / Callers — applied uniformly across all recipes in `SUBSTRATE-COMPOSITIONS.md`.
2. RECOVERY-STATUS.json file shape: single-instance at `<slug>/RECOVERY-STATUS.json`, single-writer-per-slug assumption documented, schema includes `parent_skill` / `failed_step` / `resume_from` / `timestamp` fields, additive-only schema evolution committed to up front.
3. Doc citation form: skill bodies cite `~/.agents/docs/<file>.md`, not cwd-relative.
4. `LOOM-CONVENTIONS.md` artifact sections each declare schema_version stance + write surface, so Phase 3-7's ~25 new event types slot into a documented contract.
5. The `§ Revise PLAN.md` recipe in Phase 1 still wraps `bin/draft revise`, with an explicit "Phase 8 migrates to `bin/loom revise-plan`" breadcrumb — schema-evolution as a written cutover plan, not an oral tradition.

### From whiteboard-testing-strategy

The bootstrap phase is mostly docs and wiring, but there's a real test-strategy decision hiding inside it: the marketplace already has ~20 *.test.ts files that import from `vitest` and use `mkdtempSync` patterns. The runner choice isn't open — it's a *recognition*, not a decision. Let me push on what that means and on three other places where shape matters.

**On the runner choice: vitest is the right call, but for unromantic reasons.** The 20 existing test files already `import { test, expect } from 'vitest'`, use `beforeEach`/`afterEach`, call `toEqual` and `toThrow(/regex/)`, and import `.ts` files directly with no build step. Switching to `node:test` would require rewriting every assertion (no `toThrow(/regex/)` ergonomics), wiring `--experimental-strip-types` or a loader, and giving up the ergonomic `expect` chain. uvu is even further away. The "what's the trade-off" question in the brief is answerable like this: vitest costs one devDep (plus its tree, ~20MB) that runs only on contributor machines and CI, never in the published shape; node:test costs a multi-file rewrite of code that already works and a less expressive matcher API. **The tests are the constraint; the runner choice falls out of them.** That said — the install should pin a minor (`"vitest": "^1.6.0"` shape, not `*`), and `node_modules/` in the root gitignore should be just `node_modules` (no leading slash, no trailing — catches both root and nested, which matters because `cli/node_modules/` is currently a separate line and after this lift there's only one install location anyway; collapse them).

**On test tier for the bootstrap deliverables themselves.** The brief says "Confirm existing `cli/**/*.test.ts` passes (regression baseline)" — that's a unit/integration concern that's already covered. But the *new* things this phase ships have their own test surface that's being underspecified:

- **install.sh symlink shape** — does the new `~/.agents/docs` symlink get tested? Looking at install.sh, *nothing* tests it today. That's defensible (it's a shell script with `set -euo pipefail` and idempotency baked in), but if the docs symlink lands without a test and someone later changes the whole-dir pattern to per-item, there's no signal. **I'd lean: don't add an install-test infrastructure for this PR, but add a single `bin/loom doctor`–style check (or extend `cli/verbs/doctor.test.ts`) that asserts `~/.agents/docs/SUBSTRATE-COMPOSITIONS.md` resolves. That's a real-collaborator integration test against the filesystem, cheap, and defends the actual risk: "a future install.sh edit silently breaks doc resolution."**
- **The grep cross-check in 1.3** — this is described as a one-shot pre-merge check, but the more useful shape is a *test* (`cli/docs-cross-check.test.ts` or similar) that greps loop bodies for `§ <Recipe>` patterns and asserts every one resolves to a header in `docs/SUBSTRATE-COMPOSITIONS.md`. That makes the invariant *load-bearing* on green CI rather than on a human remembering to grep before merge. The defended risk has a name: "a loop body cites a recipe that doesn't exist; the loop fails at runtime in a consumer project." That's exactly the bug a unit-level test catches an order of magnitude cheaper than a runtime loop failure.

**On recipe shape discipline (the brief asks directly).** Each recipe currently gets "CLI call shape + idempotency story." That's two fields. I'd add two more, both motivated by what would catch real bugs:

- **Failure mode**: what does the recipe do when the CLI call exits non-zero? Today this is implicit in each loop body, which means six loops can disagree on whether `loom checkin write` failing is fatal or recoverable. A single line per recipe ("on failure: surface to operator, do not retry") prevents that divergence.
- **A worked example**: one paragraph showing the recipe being called in context, with realistic args. This is the difference between fixture-style ("here is the canonical call") and factory-style documentation — and recipes lean fixture, because the test (the loop body that calls them) is asserting against the recipe shape. The example is the fixture.

I'd resist adding more fields than that. Four fields per recipe (call shape, idempotency, failure mode, example) is enough to be useful without becoming the kind of template where the boilerplate outweighs the content.

**On parallel-test safety, which the brief doesn't ask about but I'd press on anyway.** Vitest runs files in parallel by default. The existing tests are already disciplined — every fs-touching test uses `mkdtempSync` per test, no shared `/tmp/loom-test` directories, no module-level mutable state. That's good and worth *codifying* in `docs/AGENT-CONVENTIONS.md` (which is being authored this phase): a short "Tests touching the filesystem must use `mkdtempSync` per test; never write under a fixed path" note. The new cross-check test I proposed above is read-only against the repo, so it's parallel-safe by default — but worth naming the rule before someone writes the first test that violates it.

**What I'd want to see resolved by next round.** Two open questions for the panel:

1. Does the grep cross-check graduate into a CI-enforced test (my recommendation) or stay a pre-merge human check (the brief's current shape)? This is a one-line tier choice that determines whether the invariant has teeth.
2. The doc-resolution invariant — `~/.agents/docs/<file>.md` exists and is reachable — does it get a smoke test in `verbs/doctor.test.ts`, or is it left to the operator running `bin/loom doctor` manually? Same shape of question: CI-enforced or human-remembered.

I'd defer to `whiteboard-substrate-engineer` on whether the cross-check test belongs in `cli/` (alongside the other CLI tests) or somewhere repo-rooted, since it's not testing CLI behavior — it's testing a doc-vs-loop-body invariant. Could go either way; substrate has the better lens.

### From whiteboard-design-systems

The plan reads cleanly through the design-systems lens — most of it is *exactly* the kind of architectural cleanup the substrate has been gesturing toward. The conventions docs lift is the heart of this phase, and that's where my perspective bites hardest. Let me walk the things worth pressing on.

### The doc family — naming and shape consistency

Three docs land together: `SUBSTRATE-COMPOSITIONS.md`, `LOOM-CONVENTIONS.md`, `AGENT-CONVENTIONS.md`. Reading them as a family, the names are doing two different jobs:

- `SUBSTRATE-COMPOSITIONS.md` — names the **content shape** (compositions / recipes).
- `LOOM-CONVENTIONS.md` and `AGENT-CONVENTIONS.md` — name the **subject** (loom, agents) and call out that the content is "conventions."

That's two parallel naming axes in the same directory. Not catastrophic, but it's the kind of inconsistency that compounds. A reader scanning `ls ~/.agents/docs/` will subconsciously try to deduce the rule and bounce off. If we want a coherent family, two reasonable options:

**Option A — name by subject, drop "CONVENTIONS" from the noise:**
- `SUBSTRATE.md` (or `COMPOSITIONS.md`)
- `LOOM.md`
- `AGENTS.md`

Short, scannable, no internal redundancy. The fact that they're conventions docs is implied by living in `docs/`.

**Option B — keep the CONVENTIONS suffix, apply it everywhere:**
- `SUBSTRATE-CONVENTIONS.md`
- `LOOM-CONVENTIONS.md`
- `AGENT-CONVENTIONS.md`

Consistent suffix, but `SUBSTRATE-CONVENTIONS.md` loses the "compositions" framing, which is the load-bearing word — these aren't conventions in the same sense as the others; they're a *recipe library*. Compositions and recipes ARE the substrate's primary nouns. Losing that name is a real cost.

My recommendation: **lean Option A** (rename to `SUBSTRATE.md` / `LOOM.md` / `AGENTS.md`) OR commit to a different axis entirely — name by content type:
- `RECIPES.md` (the §-prefixed substrate compositions)
- `ARTIFACTS.md` (loom file shapes, event vocabulary)
- `AGENT-CONVENTIONS.md` (marker conventions, recovery semantics, budget shapes)

This last shape is the strongest. `RECIPES.md` is what the document IS. `§ Compose PR` is a recipe. The current `SUBSTRATE-COMPOSITIONS.md` name is mildly literal ("compositions" describes the shape, not the role) and slightly grandiose. **RECIPES is semantic; COMPOSITIONS is descriptive-of-the-mechanism.** If we're going to do this lift once and live with the name, I'd push for the semantic name.

That said — this is a *judgment call with a real switching cost*. If the existing `SUBSTRATE-COMPOSITIONS.md` name has already calcified in skill bodies, retros, conversations, the cost of renaming may exceed the cohesion win. **Worth one explicit decision in the Phase 1 PR**: either commit to the family or accept the asymmetry and document why. Don't let it drift into "we'll fix it later."

### Recipe shape discipline — what fields belong on every recipe

The plan says "each recipe documents the CLI call shape it wraps and its idempotency story." That's two fields. For a substrate recipe library where the *whole point* is that loops can compose these reliably, two fields is thin. Here's the shape I'd push for, modeled on how design-system component docs work:

For each `§ <Recipe>`:

1. **Purpose** (one sentence — what role does this play in a loop?)
2. **CLI shape** (exact invocation, including arg semantics)
3. **Idempotency** (safe to re-run? what happens on retry? does it append, replace, no-op?)
4. **Inputs** (what state must exist before calling — manifest present? phase active? checkin staged?)
5. **Outputs** (what files change, what events emit, what return values mean)
6. **Failure modes** (the named ones — `slug-not-found`, `phase-mismatch`, `dirty-tree`)
7. **Callers** (which loops/skills use this — back-references for find-cohesion checks)

That last one is the design-systems-y move. **A recipe library without back-references is a one-way directory.** Six months from now, when someone asks "is `§ Phase update` still load-bearing?" they should be able to grep within the doc, not across the codebase. The `Callers` line is the API-usage equivalent of a component's "where used" view. Costs little to maintain (the grep cross-check in 1.3 already produces this list as a byproduct), pays back enormously.

The **Failure modes** field is the one I'd most strongly press for. Recipes that get called from auto-mode skills (per the broader plan) need explicit failure semantics so the calling skill can pattern-match on the named failure rather than parsing stderr. This is the same lesson as "tokens or nothing" — named failures inside the system, parsed strings outside.

### `[portable]` marker — naming check

The convention name is good. It says what it *means* (this finding has portable / cross-project relevance), not what it *looks like* (no `[GLOBAL]`, no `[!]`, no `[learning]`). Semantic-over-literal applies even to inline tags. Worth calling out in `AGENT-CONVENTIONS.md` *why* it's `[portable]` and not the alternatives — the documented "why" survives the next contributor's instinct to rename it.

One small worry: `[portable]` reads slightly close to "movable" in plain English ("this code is portable across systems"). In a substrate context the meaning is "this learning generalizes beyond this project." If we anticipate ambiguity, a one-line definition at the top of the AGENT-CONVENTIONS.md entry is enough. Don't rename — the existing name is good and renaming has cost — just anchor the meaning.

### `RECOVERY-STATUS.json` — file naming and shape

Two design-systems instincts here:

**Naming**: `RECOVERY-STATUS.json` reads as "the status of the recovery" — a passive observation. The file is *active*: it's the recovery instructions. `RECOVERY.json` or `RESUME.json` would be more direct. But `RECOVERY-STATUS` matches the broader loom naming style (`UNRESOLVED.md`, `RESEARCH-NOTES.md` — descriptive compound nouns), so I'd actually leave it. **Cohesion with the family beats marginal name optimization.**

**Shape consistency**: the plan describes the file as "capturing failed step + resume instructions." Push for the shape to be uniform across skills that write it — same top-level keys regardless of whether it's research, plan, or revise that failed. Something like:

```
{
  "skill": "/loom-research",
  "slug": "<slug>",
  "failed_at": "<step name>",
  "context": { ... skill-specific ... },
  "resume_from": "<step name>",
  "written_at": "<timestamp>"
}
```

The top-level shape is the substrate contract. The `context` blob is the skill-specific escape hatch. **On-the-rails preset + tweakable knob + off-the-rails escape**, exactly the philosophy. Document this shape explicitly in `AGENT-CONVENTIONS.md` so all three skills implementing it converge instead of drifting.

### `docs/` directory symlink — whole-dir is right

The plan picks whole-dir (`~/.agents/docs` → `<marketplace>/docs`), mirroring `cli` and `learnings`. That's the right call for the same reason as cli/learnings: **the marketplace owns this namespace**. There's no future where someone npx-installs a third-party `docs/` to compose under `~/.agents/docs/` — these are *the substrate's* conventions, not a pluggable thing. Per-item symlinks would be cargo-culting the skills/agents pattern into a space where it doesn't belong.

One small nit: install.sh's loop `for top in cli learnings; do` becomes `for top in cli learnings docs; do`. The shape generalizes cleanly. That's a good sign that the existing install.sh abstraction was sized right.

### Test runner choice (vitest vs node:test vs uvu)

Recusing slightly here — this leans more react-architect / general-engineering than design-systems. But one quick observation through the naming/cohesion lens: **the choice of vitest carries no semantic information** about what this repo is. It's an implementation detail. The relevant question for me is whether the *test file shape* — already established as `*.test.ts` colocated next to the file under test — survives the runner choice. vitest, node:test, and uvu all support that shape, so the cohesion is preserved either way. I'd defer to react-architect on the call; my only ask is that whichever runner we pick doesn't push us toward a different test-file layout (e.g. a separate `__tests__/` directory) that fragments the existing convention.

### Recipe path references in skill bodies

The plan says "update every loop / skill body referencing `projects/SUBSTRATE-COMPOSITIONS.md` (cwd-relative) to reference the marketplace-rooted path." A naming question lurks here: **what's the canonical reference shape?**

Options:
- Marketplace-absolute: `<marketplace>/docs/SUBSTRATE-COMPOSITIONS.md`
- User-symlink: `~/.agents/docs/SUBSTRATE-COMPOSITIONS.md`
- Symbolic: `docs/SUBSTRATE-COMPOSITIONS.md` (with implicit "at the marketplace root")

Skills are read by LLMs in the user's context. The user-symlink path (`~/.agents/docs/...`) is the one that resolves on the user's machine. The marketplace path doesn't exist at a stable filesystem location for the LLM. I'd pick `~/.agents/docs/SUBSTRATE-COMPOSITIONS.md` as the canonical reference and use it consistently — *one* shape, named in `AGENT-CONVENTIONS.md` as "the canonical doc reference path." That way the find-and-replace in this phase converges on a single target instead of leaving a mix.

### Things that could go wrong with the bootstrap (design-systems flavored)

Briefly, since the skeptic owns the broader pressure-test:

- **Doc-family drift**: three docs author in parallel, each developing its own section-heading conventions. By the time someone reads all three, they're trying to parse three slightly different shapes. *Mitigation*: pick a section-header template (e.g. "Purpose / Shape / Examples / Edge cases") and apply consistently across all three.
- **Recipe back-reference rot**: if `Callers:` lists go in, they need to stay accurate. *Mitigation*: a small test that greps for `§ <Recipe>` in skill bodies and confirms the `Callers:` list in `docs/RECIPES.md` matches. This is the same kind of cross-check the plan's 1.3 grep does, just persisted as a test.
- **The "we'll author it later" trap on `AGENT-CONVENTIONS.md`**: SUBSTRATE-COMPOSITIONS and LOOM-CONVENTIONS are *ports* (content exists somewhere). AGENT-CONVENTIONS is *new authoring*. New authoring under deadline pressure tends to come out thin. *Mitigation*: write AGENT-CONVENTIONS first in the phase, not last. The whole rest of the plan depends on it (sub-agent rollup-load convention, [portable] marker, RECOVERY-STATUS.json shape, two-budget shape). If it's thin, the downstream phases will paper over the gaps with prose that doesn't match across skills.

### One thing the plan does well, worth saying out loud

The plan's decision that "conventions docs at marketplace `docs/`, symlinked via `~/.agents/docs`" means adopted projects need no per-project setup is *exactly* the right design-systems move. The substrate provides the conventions; consumers reference them by symbolic path; no per-project copy-paste creates drift. This is the same pattern as a design system shipping a token JSON that all consumers reference, vs each consumer copying their own token values inline. The semantic contract lives in one place. Good.

### From whiteboard-skeptic

Two concerns with real teeth, one observation that lands as half-disagreement with the "good enough" framing, plus a clean self-recusal on one sub-question.

### Concern 1: the brief says "port or author" — there is nothing to port. This is *author*, and the workload framing is wrong.

A repo-wide glob for `SUBSTRATE-COMPOSITIONS.md` and `LOOM-CONVENTIONS.md` returns zero hits. They don't exist as files anywhere in the marketplace — not under `projects/`, not under `docs/`, not anywhere. The skill bodies *reference* them by path (`projects/LOOM-CONVENTIONS.md`, `projects/SUBSTRATE-COMPOSITIONS.md`) and reference *recipes inside them* by name (`§ State refresh`, `§ Compose PR`, etc.) — but the docs themselves were never written. Every skill that calls "see § Compose PR" today is calling into a void.

That changes the shape of Phase 1 meaningfully:

- **Workload**: this isn't a doc lift, it's net-new authoring of two substantial reference documents. The plan budgets a single PR for three deliverables (test harness + docs + grep check). Authoring `SUBSTRATE-COMPOSITIONS.md` *correctly* — recipe-by-recipe with CLI call shape and idempotency story for ~12 recipes — is the single biggest unit of work in the phase, larger than the test-harness and `AGENT-CONVENTIONS.md` combined. If the PR sizing target is "under 500 additions" (per CLAUDE.md), this phase is likely 1500-3000 lines of doc body. That's fine — but the PR description should call it out, and reviewers should know it's "author from cited usage", not "lift from existing source".
- **Risk**: when you author from cited usage rather than port, every recipe body is a *reconstruction* of what the skill bodies assumed. There is no canonical prior source to compare against. Mismatches between the recipe body and the skill body's expectations become bugs latent in the substrate — the kind that only surface when a skill is invoked and behaves unexpectedly. **Concrete remedy**: as each recipe body is authored, the PR description should link the *call sites* it was reconstructed against (file:line for each `§ <Recipe>` reference). That gives the reviewer a way to spot-check "does this recipe body match what the caller assumed?" without having to re-derive the question themselves. Without that audit trail, mistakes here are invisible.

### Concern 2: the "at minimum" recipe list is incomplete vs. the actual call sites — the grep check in 1.3 is the only thing that catches it, and the grep check fires too late.

The plan's 1.2 list cites these recipes: `§ State refresh`, `§ Phase update`, `§ Checkin write`, `§ Compose PR`, `§ Revise PLAN.md`, `§ Capture finding`, `§ Triage PR comments`, `§ Derive panel`, `§ Append finding`, `§ Save session`. Ten recipes.

The skills today also reference `§ Retro write` (ev-loop-confidence:69, 446), `§ Substrate compositions` (ev-loop-interactive:26 — a meta-reference to the doc itself, ignore), and `§ Panel auto-derivation` (ev-loop-confidence:250, 258 and ev-loop-interactive:149, 157 — referenced inline as "see § Panel auto-derivation below"). Plus `§ Retro` in `loom-archive` which appears to point at `LOOM-CONVENTIONS.md § Retro format`, not at the substrate compositions doc, so that one is in the other document.

So the "at minimum" list missed at least `§ Retro write` and `§ Panel auto-derivation`. Phase 1.3's grep is the mitigation — it explicitly says "Any miss is a blocker — author the body before merging" — but the wording leaves it ambiguous whether the grep runs *during* authoring (catching gaps that get filled in the same PR) or *after* the doc is written (potentially blocking the PR after most of the work is done). **Concrete remedy**: run the grep first, before writing any recipe body. Produce the *full* list of recipes that need bodies, then author against that list. Treat the grep output as the source of truth for the recipe inventory, not the prose list in PLAN.md. This is a five-minute reordering of the work and it removes the discovery-late failure mode entirely.

Bonus: `§ Panel auto-derivation` appears to be *inline* in the calling skill body ("see § Panel auto-derivation below"), meaning some recipes might be defined in the skill that uses them rather than in the central doc. That convention isn't documented anywhere. The doc family should decide: are all `§` recipes in `SUBSTRATE-COMPOSITIONS.md`, or can a skill define its own? Either is fine — but the next person reading the code can't tell, and the grep cross-check is meaningless until the rule is stated. **Document the convention in the AGENT-CONVENTIONS.md preamble.** One sentence: "All `§ <Recipe>` references resolve in `docs/SUBSTRATE-COMPOSITIONS.md` unless prefixed with `§ this:` for skill-local definitions." Or whatever the rule actually is — but state it.

### Concern 3 (lighter, but it's the one that compounds): the recipe shape is underspecified, and this PR will set the precedent.

The brief says each recipe documents "the CLI call shape it wraps and its idempotency story." Two fields. The concern_to_weigh in the brief asks "what other fields should a recipe have?" — naming it as a live question. The skeptic answer: pick a small set *now*, because Phase 1 sets the template every future recipe is authored against. The first ten recipes establish the shape, and "we'll add a field later" means retrofitting ten existing recipes the next time someone wants e.g. a failure-mode field.

The minimum cohesive shape I'd argue for, in priority order:

1. **Purpose** (one sentence, what it does at a behavioral level — not what the CLI does, what the composition accomplishes)
2. **CLI call shape** (the literal invocation)
3. **Idempotency story** (what re-running does; safe? destructive?)
4. **Failure modes** (what can go wrong; what the caller is responsible for handling)
5. **Used by** (back-references to the skills that call this recipe — auto-generated from the grep is fine)

Skipping #4 is the highest-impact omission. Without "failure modes", every caller has to derive failure handling from reading the CLI source. That's exactly the kind of compounding tech debt where the absence locks in: the next ten skill authors find a recipe that doesn't document failure modes, they don't write failure-handling, and the substrate accretes silent-failure assumptions.

This is the **lock-in kind of tech debt**, not the **refactor-later kind**. Once ten recipes ship in a shape, that shape *is* the documented contract for the substrate. Changing it later means updating ten recipes plus every reviewer's mental model. Worth getting right in Phase 1.

### Half-disagreement: the "whole-dir symlink for docs" call

The plan goes whole-dir (`~/.agents/docs` → `<marketplace>/docs`) "mirroring cli + learnings". The skeptic read: cli + learnings are *closed namespaces* the marketplace owns end-to-end. Docs is *also* a place future tooling (an npx-installed framework extension, a hand-authored project-local doc override, a per-machine note) might want to drop a file. Whole-dir symlink forecloses that — anything else dropping into `~/.agents/docs/` gets shadowed when the symlink is recreated.

That said: there is no consumer asking for per-item docs today. Going whole-dir is the simpler shape, and the install.sh code already has the per-item pattern for skills/agents if it needs to change later. So this is not a blocker, but I'd flag it in the install.sh comment ("docs is whole-dir today; switch to per-item if a consumer ever needs to drop in their own docs") so the next person doesn't have to re-derive the question.

This is the **refactor-later kind of tech debt** — exact opposite of #3 above. Worth naming why in the install.sh comment.

### Recusal: vitest vs. node:test vs. uvu

I don't have an angle on this that the performance / react-architect engineers can't cover better. The pragmatic call (vitest, because `cli/draft.test.ts:1` already imports from vitest and the ~20 test files would all need rewrites to switch) seems forced by existing code. The bigger-picture trade-off (dep weight vs. dev ergonomics) is a stack-philosophy question, not a pressure-test question, and CLAUDE.md's "keep it basic" voice is the relevant lens — not mine.

### Summary of the 2-3 things with real probability and real impact:

1. **"Port or author" is *author*** — there are no existing docs to port. PR sizing and review framing should reflect that. Audit trail (call sites → recipe body) is the concrete mitigation.
2. **The recipe inventory should come from grep, not from PLAN.md prose.** Run 1.3's grep *before* writing any recipe body, not after. `§ Retro write` and `§ Panel auto-derivation` are at least two recipes the prose list missed.
3. **Recipe shape is set by this PR for the lifetime of the substrate.** Add `failure modes` as a required field. Add a one-sentence rule in `AGENT-CONVENTIONS.md` about where `§ <Recipe>` references resolve (central doc vs. skill-local).

### From whiteboard-a11y

**Recusing.**

This phase is a test-harness lift plus three Markdown convention docs in a CLI/skills marketplace repo — no UI surface, no rendered HTML, no interactive components, no focus management, no keyboard parity questions, no color/contrast decisions, no motion concerns. The user-facing artifacts are (a) `vitest` terminal output, which inherits whatever accessibility properties the terminal emulator provides, and (b) Markdown documentation rendered by GitHub or read in an editor, where the accessibility contract is already well-established by the platform.

I considered whether documentation accessibility surfaced anything real — heading hierarchy in the three new docs, alt text on any embedded diagrams, semantic Markdown structure for screen-reader linearization, plain-language microcopy for the conventions docs themselves. These are legitimate concerns in principle, but they're better owned by whoever drafts the doc bodies as ordinary good-writing hygiene (use real `##`/`###` headings rather than bolded pseudo-headings; if a diagram lands in `SUBSTRATE-COMPOSITIONS.md`, give it a textual description nearby; keep sentences short and direct). Surfacing this as a dedicated a11y section on the whiteboard would be stretching — it's craft advice that applies to all Markdown everywhere, not a design decision this phase needs to lock in. The `evaluator-a11y` carve-out also doesn't bite here because there's no shipped code with image tags or interactive controls to catch downstream.

If a later phase introduces a generated site, web UI, or interactive CLI surface (TUI with focus states, color-coded output that needs a non-color signal, etc.), bring me back in. For Phase 1 as scoped, defer to `whiteboard-react-architect` (n/a here too, likely), `whiteboard-design-systems` for naming-in-docs questions, and the doc author's own writing taste.

### From whiteboard-performance

Two of the three concerns flagged are real and worth digging into; one is a non-issue at this scale.

### Test runner choice: vitest is already the right call, and the receipts back it up

The tests already import from `'vitest'` — that decision is upstream of this phase, made implicitly when the first test was written. Phase 1 isn't *choosing* vitest so much as *honoring* what the test files already assume. Switching to `node:test` or `uvu` now would mean a rewrite of ~30 test files (those `expect(...)` calls aren't free to migrate), and the rewrite would be a separate, larger PR — not in scope for "bootstrap the harness."

That said, let me steelman the alternatives so we know what we're not getting:

- **`node:test` + `node:assert`**: zero install cost, zero dep tree. Cold start is essentially node-startup-only. For a marketplace that gets cloned onto contributor machines, "zero deps" is genuinely attractive — `npm install` on a fresh clone becomes a no-op. But the API is more verbose (`assert.strictEqual` vs `expect().toBe()`), there's no watch mode that's as good as vitest's, no `.toMatchInlineSnapshot()`, no auto-typed `expect`. The existing tests would need a mechanical rewrite.
- **`uvu`**: ~2KB, fast cold start, similar API shape to vitest's `test()` but with a more spartan assertion library. Cold start in the 50-100ms range vs vitest's 500ms-1s on cold cache. Reasonable middle ground but, again, requires a migration of the existing tests.
- **`vitest`**: cold start is the slow one (vite dev server boot + esbuild transform graph), but watch-mode re-runs are excellent because of the dev-server-hot-cache model. For a dev loop that's mostly "edit one test, re-run" rather than "CI cold-start every time," this is the right shape. ESM-native, no TS config needed (it inherits via esbuild), `expect` API matches existing tests.

**Cost receipt for vitest install**: rough order of magnitude, `vitest` + its deps (vite, esbuild, etc.) is ~80-120MB on disk and ~600 packages in `node_modules/`. That's significant for a "marketplace clones onto contributor machines" framing. But: the marketplace is *already* asking contributors to run node, the shims already use ESM type-stripping which requires Node 22.6+, and `npm install` happens once per clone. Compared to the friction of rewriting tests, the install cost is the right trade.

**Cold-start estimate for 20-30 test files**: vitest with no config and esbuild-cached should land in the 1-2 second range on a warm cache, 2-4 seconds cold. Watch mode re-runs of a single file are sub-200ms. That's a fine dev loop. Not amazing, but the bottleneck for this repo isn't going to be test speed — it's going to be the manual-smoke loop against scratch slugs that dominates verification time anyway.

**One thing I'd flag explicitly in the package.json**: pin the major version (`"vitest": "^2.x"` or whatever the latest is) and add `"engines": { "node": ">=22.6" }` since the shims already require that node version implicitly (TypeScript via type-stripping landed in 22.6). Contributors with older node will hit confusing errors otherwise.

### Recipe dispatch latency: this is the more interesting one

Here's where I want to push back gently on the framing — and where the design choices in Phase 1 actually matter for performance downstream.

Every recipe call (`§ State refresh`, `§ Checkin write`, etc.) ultimately resolves to a shell-out to `bin/loom`, `bin/guild`, or `bin/griot`. Each of those shims does:

1. `bash` startup (~5ms)
2. `node` startup (~50-80ms on macOS, more on cold disk)
3. TypeScript type-stripping of the entry file + transitive imports (~30-100ms depending on dep graph)
4. The actual verb logic (usually milliseconds)
5. Process teardown

So a single recipe call is plausibly 100-200ms of pure substrate overhead before any work happens. If a loop body does ten recipe calls in sequence, that's 1-2 seconds of substrate cost per loop iteration — not catastrophic, but not free either.

**Where Phase 1 shapes this**: the recipes get *authored* in this phase. The body shape determines how recipes get composed downstream. A few things I'd want the conventions doc to flag:

1. **Batch where the contract allows it.** If a recipe like `§ Capture finding` is going to be called multiple times in a session (e.g., once per `[portable]` marker scanned from a whiteboard panel), the recipe body should document whether it can take an array input or whether the caller is expected to invoke it N times. The latter pays N × node-startup; the former pays once. The PLAN already implies single-finding-per-write semantics — that's fine for correctness but worth flagging that batch shapes are deferred-but-not-impossible.

2. **Document the per-call cost in the recipe body.** Not as a warning, but as a fact: "this recipe shells `bin/loom checkin`; expect 100-200ms per invocation." That lets the loop-body author make informed choices about when to inline vs when to recipe-out.

3. **Idempotency story matters for retries.** Phase 1.2 says "Each recipe documents the CLI call shape it wraps and its idempotency story." Good — but idempotent retries are also a performance multiplier. If a recipe is idempotent, a flaky network call can retry without harm; if it isn't, retries get expensive (need to read state first to figure out whether to skip).

**What I'd NOT do**: don't preoptimize the substrate dispatch path now. Don't ship a "long-running daemon" mode for `bin/loom` to avoid node startup, don't ship a `bin/loom batch` verb that takes a recipe DSL. Those are real optimizations *if* dispatch cost becomes a measurable pain point — but we don't have measurements yet, and the substrate is too young to know what the hot recipes will be. Measure after Phase 4 lands and we have real loop traces.

**Concrete recommendation**: in `docs/SUBSTRATE-COMPOSITIONS.md`, add a small "Performance notes" subsection (or a one-liner per recipe) noting the per-call cost ballpark and the idempotency story. That's a 5-minute add that pays off as soon as someone is choosing whether to recipe-out vs inline.

### Install-time cost: the lift exists but is acceptable

The marketplace today: zero dependencies, `git clone` is the install. After Phase 1: `git clone` + `npm install` (vitest dep tree, ~80-120MB, ~600 packages, ~30-60 seconds on a warm npm cache, longer cold).

Two things make this less bad than it sounds:

1. **vitest is a devDep**, not a runtime dep. The shims (`bin/loom` etc.) execute the `.ts` source directly via node's type-stripping — they don't need vitest at all. So a *consumer* project that adopts the framework via `install.sh` doesn't need to `npm install` anything; only contributors to the marketplace itself need vitest. The `install.sh` is unaffected.
2. **`.gitignore` for `node_modules/`** is already in scope (Phase 1.1 explicitly adds it). Good.

I'd suggest one small thing in `install.sh`: it could `echo` a note pointing contributors at `npm install` if they're going to develop on the marketplace itself. Not required for adoption, but a friendly hint. Something like "Marketplace development? Run `npm install` to enable the test suite."

### What I'd flag for measurement after Phase 1 lands

Things we can't measure yet but should look at once the harness is real:

- **Cold `npm test` time** with no cache: is it under 5 seconds for the current ~30 test files? If not, that's a dev-loop drag worth investigating.
- **Watch-mode re-run latency** for a single-file edit: should be sub-300ms. If not, vitest config might need a `pool: 'threads'` or `isolate: false` tweak.
- **`bin/loom plan` end-to-end wall-clock** on a scratch slug: gives us the substrate dispatch baseline. Useful to track over time as recipes get added; if it ever crosses 2-3 seconds for a single verb, we have a problem.
- **`npm install` cold time on a fresh clone**: should be in the 30-60s range. If it's significantly longer (a transitive dep with native build steps?), revisit.

### From whiteboard-react-architect

**Recusing, with one analog flagged because it actually has teeth for this phase.**

This phase is pure CLI/TypeScript marketplace infrastructure — vitest harness, three convention docs, a grep-based recipe cross-check. No React, no client/server boundary, no hooks, no prop API surface. My core lens (hook composition, `'use client'` placement, prop API shape, state location ladder) does not load-bear here. The architecture decisions in this phase belong to the CLI/docs/testing engineers; I'd be inventing relevance to stay at the table.

### One structural analog worth surfacing

There is one place where the React-API composition discipline rhymes with what this phase is actually doing, and I think it's load-bearing enough to leave on the whiteboard rather than swallow.

**"Composition over configuration" applies to the conventions docs themselves.** The three doc files being authored — `SUBSTRATE-COMPOSITIONS.md`, `LOOM-CONVENTIONS.md`, `AGENT-CONVENTIONS.md` — are the marketplace's prop-API surface for future contributors. Every convention written there is a configuration option that future recipes will inherit; every primitive left composable is a degree of freedom future recipes can spend.

The same failure mode I watch for in React shows up here: a convention doc that grows to enumerate every shape a recipe might take ("if your recipe is X, do Y; if Z, do W") is the doc-equivalent of a prop-heavy monolithic component. The healthier shape is a small set of orthogonal primitives (what a substrate *is*, what a loom *does*, what an agent *answers to*) that compose, with the long-tail edge cases living as recipes rather than as branches inside the conventions.

Concretely, for this phase: if `SUBSTRATE-COMPOSITIONS.md` ends up being the longest of the three and starts containing a lot of "in case X" prose, that's the signal that the substrate primitive isn't decomposed enough — same smell as a React component growing a tenth boolean prop. The recipe cross-check (1.3) is the validation loop that catches it: if recipes can't be expressed by referencing the conventions, the conventions are wrong-shaped, not the recipes.

I'll defer to `whiteboard-design-systems` on whether this analog actually pulls weight here — naming and composition philosophy at the doc level is closer to their lens than mine. Flagging it and stepping back.

### From whiteboard-sketch-ideation

**Recusing.**

This is substrate work — a CLI/skills marketplace for agent primitives (draft/guild/griot/loom), with the phase scoped to making the repo self-runnable and framework-referenceable. No sketches, no p5.js, no aart.camp gallery surface. The generative-art lens has nothing useful to press on here: there's no single-mechanic-vs-feature-creep tension to surface, no time-evolution-vs-static question, no numbered-sketch convention at stake, no portfolio framing to defend. Recusing cleanly and leaving the floor to the substrate-appropriate voices (skeptic, performance, design-systems for any docs-shape questions, and whoever owns CLI/test-harness lensing).

