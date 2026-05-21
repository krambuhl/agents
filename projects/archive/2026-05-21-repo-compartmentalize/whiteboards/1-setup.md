# Whiteboard: Phase 1 Setup: shared plugin skeleton + sync extension

## Round 1

### From whiteboard-substrate-engineer

The shape question worth pressing in PR1 is whether `plugins/shared/` is one substrate primitive or two stapled together. Right now the plan treats it as a single plugin that ships (a) a cross-plugin lib (`cli/lib/`), (b) cross-plugin docs (`docs/`), and (c) cross-plugin skills (`grill-me`, `find-skills`, eventually `review-skill`). Those are three different sync surfaces with three different consumer sets: only PLUGINS_WITH_CLI (griot/guild/loom) want the lib, but every doc-citing plugin (ev included, which has no `cli/` tree at all) wants the docs, and the skills cascade via marketplace dependencies independent of either sync. Conflating them under one `shared` name is fine — the substrate is small enough — but the sync-shared contract should be explicit that there are now **two orthogonal flows from shared**, not one.

On Q1 (shape of `plugins/shared/.claude-plugin/plugin.json`): match the existing five exactly — `{name, description}`, no `version`. That's not a carve-out call, it's a family-shape-consistency call. The memory note on plugin version auto-increment establishes the family default; deviating here would force every future maintainer to ask "why is shared special?" forever. The cost of cohesion is zero; the cost of a parallel convention compounds.

On Q2 (cascade wiring at PR1): I'd push back on PLAN's leaning toward (a) "wire all eventual consumers now." Wiring a dependency that points at an empty plugin is a write you can't take back without a second cascade-edit PR if Phase 2 reshapes which consumers actually need shared. **(b) — wire only plugins that already cite content shared will own at PR3-PR5 — is the safer call**: loom and ev already cite `docs/AGENT-CONVENTIONS.md` per RESEARCH.md § 3, so they get the dep at PR1; griot and guild get it later when something concrete moves under them. The PLAN's "verify in PR" hedge for griot/guild is doing the right thing; lock that in rather than wiring speculatively. agent-loop-full needs the dep at PR1 regardless, since its job is cascade-the-family.

On Q3 (sync-shared.ts contract for PR2): the substrate concern is that `detectDrift` and `applySync` today both compute `planAll()` then iterate. Adding a second direction tempts a developer to introduce a second `planAllShared()` that runs alongside — two planners, two drift checks, two write paths over the same `plugins/<plugin>/` subtree. That's the parallel-writer smell, even though it's sequential within one process: the *invariant* "every file under sync-managed subdirs has exactly one upstream source" must survive the extension. Concretely: today the orphan check iterates `['cli', 'skills', 'agents']` (line 276) and rejects anything not in `expectedDestinations`. If shared-direction adds `docs/` and writes to `cli/lib/` from a different source than the root-direction, the union of expected destinations needs to be computed before the orphan check runs, or PR2 will start spuriously deleting files. **Shape the extension as one planner that emits both kinds of SyncSpec, with a `source` discriminator** (`{kind: 'root' | 'shared', source, destination}`); keep `detectDrift`/`applySync` single-pass. Two planners parallel-running is the design smell.

On parallel-session safety: sync-shared is already a deterministic generator under `projects/CONVENTIONS.md` Category 4 ("generated-from-upstream"), so concurrent runs against unchanged input converge. The extension preserves that property only if both directions are pure copies. The moment someone proposes `plugins/shared/` content that is itself derived from another plugin (don't — but the temptation will arise), the convergence claim breaks and you'd need a topological ordering. Worth a one-line tripwire test in PR2: `plugins/shared/` has no `cli/verbs/`, no plugin-specific content — it is leaf-source-only.

On Q4 (backward-compat during Phase 1): the real invariant is *root remains canonical for everything* through PR1+PR2. The shared→consumer flow must be a no-op until PR3 actually moves `cli/lib/` and `docs/` under shared. A concrete way to make that idempotent-by-construction rather than by-convention: in PR2, the new direction's source paths point at `plugins/shared/cli/lib/` and `plugins/shared/docs/` which **don't exist yet** — and the planner skips missing source roots silently (today's `walkFiles` already returns `[]` on missing). Good. But the `--check` mode should *not* treat the absence of shared-direction outputs as drift during Phase 1. The cleanest shape: the shared planner emits zero specs when shared has no content; then drift detection has nothing to compare and the check passes trivially. Verify this in a PR2 test ("shared with empty content yields zero specs, zero drift").

On Q5 (cascade timing on install): a sixth plugin in the cascade is the same shape as the existing five, so I'd expect no new failure mode beyond what `marketplace-manifest.test.ts:201-209` already guards. R1 in the plan is appropriately scoped.

On Q6 (Phase 2 risks worth naming in Phase 1's brief):

- **The orphan-sweep blast radius at PR3.** When `cli/lib/` moves from root to `plugins/shared/cli/lib/`, the old root-direction planner stops emitting specs for the root path, and the new shared-direction planner starts emitting specs for the same destinations. If the cutover isn't atomic within one PR, one run of `applySync` will see destinations with no upstream source and **delete the per-plugin lib copies as orphans** — exactly the wrong moment to drop them. Mitigation lives in PR3's design, but PR2 should make the extension shape *force* PR3 to be a single-commit cutover: the planner's source-direction is one configuration value, not a feature flag.

- **`docs/` consumer set diverges from `cli/lib/` consumer set.** Today, PLUGINS_WITH_CLI = `['griot', 'guild', 'loom']` is the lib consumer set. The doc-citing set per RESEARCH.md § 3 is `loom + ev` at minimum, possibly more. The sync extension needs *per-flow consumer rules*, not a single shared list. If PR2 hardcodes "every plugin gets shared docs," ev's tree grows a `docs/` it didn't have before; if PR2 hardcodes the lib consumer set, ev's doc citations stay broken. Name this in PR2 as an explicit `PLUGIN_SHARED_CONSUMERS = { lib: [...], docs: [...] }` shape.

- **`agent-loop-full` is zero-content.** It cascades the others but ships no files of its own. Make sure PR2's shared-direction planner *skips* agent-loop-full for both lib and docs — its job is dependency cascade, not content carrier.

### From whiteboard-skeptic

The PRs themselves are honest, but the surrounding posture has more weight on it than the headline acknowledges. Three concerns worth surfacing before the contract gets written.

**1. The "exactly six plugins" tripwire isn't a footnote, it's the gating asymmetry of PR1.** `cli/marketplace-manifest.test.ts:53-60` and `:98-102` aren't soft assertions — they assert *exactly* the six expected names, including a hard-coded list and a `toEqual(expected)` on the sorted array. PR1 doesn't just "add a seventh plugin to the cascade." It mutates a test that the rest of the suite treats as a structural invariant, plus the `EXPECTED_PLUGIN_NAMES` list, plus every `describe('declared dependency edges')` block at `:181-209`. None of those are mentioned in the PR1 bullets — the plan says "update lines 53-60 and 201-209" which understates it. **Concrete remedy**: spell out in the PR1 description that "seven plugins" is the new invariant and enumerate every assertion touched, so the reviewer can recognize when the tripwire is genuinely loosened vs. quietly defanged. A test that says "any plugin name is allowed" is a much weaker tripwire than "exactly seven, named X." Keep the closed-set shape.

**2. PR1's "wire the cascade now (option a)" is a lock-in decision the plan treats as a styling choice.** PLAN leans toward adding `shared` as a dependency of loom + ev + agent-loop-full *before* any content lives in shared. The framing is "backward-compatible, nothing breaks." But this is exactly the class of decision that compounds: once `agent-loop-full → shared` is declared, the cascade order is observable behavior, fresh installs start exercising the seventh-plugin install path against an empty shared, and any future "actually, maybe shared is two plugins" reshape has to unwind a dependency edge users already installed. **Counter-position worth pressure-testing: option (c)** — defer the cascade wiring to PR3 (when shared first owns real content). PR1 then ships only the skeleton + the empty manifest entry, no dependency edges declared. Empty-shared-as-a-dep is a footgun: if a consumer cascades shared in before PR3 lands, they get a no-op plugin that some future install-time validation might object to (Claude Code's loader behavior on zero-content plugins isn't a guaranteed contract — it's a behavior). At minimum, the PR should say *why* (a) over (c), not just "PLAN leans toward (a)."

**3. PR2's "both sync paths active in parallel" sounds free; it isn't.** The dual-mode sync between PR2 and PR3 has a subtle property the plan glosses: during that window, **two upstreams claim the same downstream files**. Today `scripts/sync-shared.ts:160-166` mirrors root `cli/lib/` into every plugin's `cli/lib/`. PR2 adds `plugins/shared/cli/lib/` → same destinations. The plan says the new path is a "no-op until Phase 2 populates `plugins/shared/`" — that's true *if and only if* `plugins/shared/cli/lib/` is empty. The moment a contributor (or a stray PR3 prep commit) drops a single file into `plugins/shared/cli/lib/`, both syncs write to the same destination and the second one wins. The order of iteration in `applySync` becomes load-bearing without anyone naming it as such. **Concrete remedy**: PR2 should ship an explicit conflict-detection guard in `detectDrift` — "if a destination has more than one upstream source, fail loudly" — before the new path is wired. That's the cheap version of an invariant the dual-write window assumes silently. Bonus: that guard survives into Phase 3 as a permanent tripwire against future shared/plugin-overlap drift.

**One thing I'd ask the panel to resolve in round 2:** whether PR1 should declare the cascade edges at all. The PLAN's lean toward (a) reads to me like "the eventual shape, scaffolded early" but the framing of Phase 1 as "nothing breaks" depends on the new edges being inert. They aren't quite inert — they reshape the install graph users see. Worth a sentence of justification or a flip to (c).

### From whiteboard-design-systems

The thing that jumps out from the existing plugin descriptions is that every one of them already uses a shared dialect: `"X substrate: ..."`. Loom is "Project substrate", guild is "Panel substrate", griot is "Learnings substrate". That dialect is the prior art for naming the new plugin, and it tells us something the PLAN hasn't fully articulated yet: the marketplace already has a *category-of-thing* vocabulary, and the new plugin needs to slot into it cleanly.

### Q1 — Naming and the day-1 description

The PLAN reaches for `"shared"`. **`shared` is a literal name, not a semantic one.** It describes *the relationship to other plugins* (other things share from it), not *what the plugin IS*. It's the `<BlueButton>` problem in marketplace clothing — it tells you the color (this plugin's color is "stuff other people use") without telling you the meaning. Every plugin in a marketplace is, in some sense, "shared."

Look at the existing dialect: each plugin name is a *role* (loom weaves, griot tells, guild gathers, ev executes). `shared` breaks that pattern — it's the only sibling that names its position rather than its function.

A few candidates that name the *role* instead of the *position*:

- **`commons`** — a real word with a real semantic ("the commons" = shared infrastructure that belongs to no one and supports everyone). Carries weight. Still partly the same problem as `shared`.
- **`foundation`** — describes the structural role (other plugins rest on it). Carries the "primitives that other things compose against" meaning explicitly. Closest to the design-systems instinct of *foundational abstractions vs specific components*.
- **`substrate`** — bare. Owns the word the other plugins keep claiming. Honest about the relationship: every other plugin is "X substrate"; *this* plugin is "the substrate itself." Pleasing recursion but possibly too clever.
- **`agent-loop-base`** — parallels `agent-loop-full` (both meta plugins), names the structural role (base of the loop), reads honestly when shared has zero content on day 1. **This is my favorite**: it leverages the existing `agent-loop-*` convention and pairs nicely with `agent-loop-full`: one is the base of the loop, the other is the full bundle. Reads as a *family*.

If I had to ship today, I'd push toward `agent-loop-base` for the family-coherence reason.

Note on the description: even keeping the name `shared`, the proposed description in the PLAN is unwritten. A skeleton plugin with zero content but a real cascade role *can* read honestly on day 1 if the description names the role rather than enumerating contents. Something like:

> "Foundation substrate: cross-cutting helpers (shared CLI lib + agent-conventions docs) that the loom, guild, griot, and ev plugins all depend on. Cascades in via marketplace dependencies; consumers receive a synced local copy of the substrate at install time."

What I'd avoid in the description: any phrasing that promises specific contents on day 1 ("contains the grill-me, find-skills, and review-skill skills"). That's a description that lies until Phase 2 finishes.

### Q2 — Cascade wiring at PR1

The `dependencies` field is doing three semantically different jobs at once:

1. `loom` depends on `guild` and `griot` — **peer-relationship dependencies**.
2. `agent-loop-full` depends on everything — **bundle-membership dependency**.
3. The proposed `loom → shared`, `ev → shared` — **substrate dependency**. Not peer, not bundle — *foundation*.

These three relationships look identical in JSON but mean different things to a reader.

Two cheap things make the semantic legible:

- **Order the dependency array by kind**: substrate first, peer second. So `loom: ["shared", "guild", "griot"]` rather than happening to start with shared. Make it intentional and document the order convention.
- **In the marketplace test**, have the substrate-dependency assertion be a separate test from the peer-dependency assertion. Two tests, two intentions: "every CLI-shipping plugin depends on `<base>`" and "loom depends on guild and griot."

One naming-as-architecture observation for the marketplace.json plugin description: if we ship `agent-loop-base` (or whatever the final name is), the meta-bundle `agent-loop-full`'s description should evolve too — right now it reads "cascade-installs the full agent-loop family (griot, guild, loom, ev, review-skill)." Adding the base plugin without updating that description leaves the name *family* incomplete in the prose. Tiny edit, but worth catching in PR1 not PR11.

### Q3 — `sync-shared.ts` extension contract, naming-shape

The current script uses **`PLUGINS`** and **`PLUGIN_CONTENT_RULES`**. The new mode introduces a third concept: *the plugin that's the source for a sync*. Right now, "source" is implicit — it's always the repo root. The Phase 1 extension introduces a *named* source.

Two candidates:

- **`SUBSTRATE_PLUGIN`** (singular const naming which plugin is the source-of-truth substrate): `export const SUBSTRATE_PLUGIN = 'shared' as const;` — then the script reads as "for each consumer plugin, copy from the substrate plugin's subdirs." This names the role; if the plugin name changes later, the role name doesn't have to.
- **`SHARED_SOURCE_PLUGIN`** — more literal, slightly clunkier.

I prefer the first. It composes with the existing vocabulary: `PLUGINS` (the universe), `SUBSTRATE_PLUGIN` (the one that's the source), `PLUGIN_CONTENT_RULES` (per-plugin ownership). Three nouns, three roles.

The other naming thing worth flagging: the script's banner comment will get stale fast — after PR2 it has a *second* source of truth, and after PR4 the top-level cli/ source of truth goes away. **The banner should be rewritten in PR2 to describe the contract in its eventual shape** (substrate → consumers), not in the current half-broken transitional shape.

### Q4 — Backward-compat invariants, naming-flavored

From a naming-is-architecture lens, the backward-compat invariant I'd add explicitly: **no skill, no agent file, no doc, and no CLI module changes its name in PR1 or PR2.** All naming is additive in Phase 1.

### Q5 — Cascade timing on install

One semantic note: **if** the cascade resolution order matters at install time, and **if** the substrate dependency is listed first in each consumer's dependency array (per Q2 above), then the install ordering follows the *semantic* ordering naturally. The naming convention ("substrate first in the array") becomes a load-bearing structural guarantee. A test that asserts "if `<base>` is a dependency, it's the first element of the dependencies array" would catch this.

### Q6 — Phase 2 risks Phase 1 shapes

1. **The `cli/lib/` → consumer `cli/lib/` sync direction encodes a flat namespace.** Phase 1 bakes in the assumption that "all of cli/lib/ is one indivisible substrate." Worth noting in the PLAN as a future-shape consideration.

2. **`docs/` is a flat namespace too.** If the substrate eventually gains a `migration-guide.md` or `troubleshooting.md` or `glossary.md`, do those live in `docs/` too? The name `docs/` doesn't disambiguate. Phase 1 doesn't need to solve this — but if we're committing to "docs/ is the cross-cutting doc namespace forever," that's worth being intentional about. Possibly `docs/conventions/` as a subdirectory.

3. **The `learnings/` migration in PR7 has a namespace-collision smell.** The substrate plugin (whatever we name it) is "where cross-cutting stuff lives." But the `learnings/` directory at repo root in PR7 *also* becomes a cross-cutting resource. The naming distinction "substrate = authored cross-cutting content, learnings/ = generated cross-cutting content" deserves to be written down somewhere.

### TL;DR (the one thing I'd push hardest on)

**Rename `shared` before PR1 lands.** `shared` is a literal-not-semantic name, breaks the existing role-naming dialect, and locks in a bad word that Phase 2-3 will propagate through every dependency reference, every sync rule, every test assertion. Pick `agent-loop-base` (my preference) or `commons` or `foundation` — but pick a name that *describes the role*, not *the relationship*. Costs nothing in Phase 1; cleanup cost compounds with every later PR if we wait.

### From whiteboard-testing-strategy

The Phase 1 plan is admirably backward-compatible, which means almost every test risk during this phase is about *protecting the safety net itself* — not about catching new behavior. That's an unusual posture and it should shape tier choice.

**1. PR1 — keep it at the unit tier, but add one structural assertion the existing tests don't have.** The marketplace-manifest test is a pure-static manifest invariant test: it reads JSON, parses, asserts shape. Adding a seventh entry to `EXPECTED_PLUGIN_NAMES`, an `entry: shared` describe block, and one new dependency-edge test is the right shape — same tier, same fixture model, same failure mode. What that test *doesn't* defend, and probably should, is the new cascade-ordering invariant the plan implicitly relies on: `agent-loop-full` must list its deps in an order Claude Code's loader doesn't choke on. I'd resist a fresh-tmpdir integration test for PR1 — there's no new code path, just a new row in the same data structure.

**2. PR2 — stay with real-fs tmpdir, factor the fixture builder, and split the contract.** The existing `scripts/sync-shared.test.ts` already does the right thing. Mocking node:fs here would be the antipattern — the whole point of `applySync` is that it touches the filesystem correctly.

What I'd press on for PR2 is *fixture-builder evolution*. `buildMinimalSourceTree` is currently a single canonical fixture. PR2 introduces a second sync direction with different semantics. The temptation will be to bolt the new shape onto `buildMinimalSourceTree`. Resist that — split the helper:

- `buildOldDirectionTree()` — what exists today, defends the old root→plugin direction
- `buildSharedDirectionTree()` — `plugins/shared/cli/lib/foo.ts`, `plugins/shared/docs/X.md` upstream + empty consumer trees, defends the new direction
- `buildBothDirectionsTree()` — composition of the two, defends the *interaction* (which is the actual risk Phase 1 introduces)

Three describe blocks, each defending one named risk.

**3. The `--check` drift detection during Phase 1's mixed shape is the real test design question, and the answer is (c) validate both — but with explicit per-direction failure attribution.** Right now `detectDrift` returns `DriftRecord[]` with no provenance about *which direction* the drift came from. After PR2 ships, a CI failure could be old-direction drift or new-direction drift or both. Same `divergent` kind, very different debug paths. **I'd add an optional field on `DriftRecord` — `origin: 'root-canonical' | 'shared-canonical'`** — and assert on it in the test suite. The cost is small, the signal at debug time is large.

The defense statement, written out: *this test catches the case where CI says "drift" and a developer can't tell whether they edited the wrong source or the sync script has the wrong mapping for one of the two directions.*

**4. Fresh-machine smoke test — make it manual and gate it with a checklist line, not a CI job.** The V4 smoke test referenced in RESEARCH § 9 is `claude plugin install agent-loop-full@krambuhl` against a clean directory. Building that into CI is a substrate change of its own — out of scope for Phase 1. For Phase 1, the cheapest reliable signal is a checklist line in PR1's description: "Verified: ran `claude plugin install agent-loop-full@krambuhl --scope user` on a fresh dir; all plugins (including new `shared`) cascaded; `/grill-me` resolves to a no-op (shared is content-empty at PR1, but the skill *directory* should not 404)."

**5. The test coverage gap Phase 1 reveals (and shouldn't try to fill mid-flight).** The substrate today has *no test that asserts the cascade actually loads on a fresh machine*. That's an e2e test, expensive, and not Phase 1's job to add. But it *is* the test that, if it existed, would have made R1 in the PLAN's risk section a non-risk. Worth a one-line note in PR1's description acknowledging the gap.

### From whiteboard-performance

### Q1 — Cascade install-size cost

Honestly? **Below the noise floor.** Claude Code plugins aren't node_modules — they're file trees the loader walks. The "cost" of cascading shared into loom + ev + agent-loop-full is: an extra directory traversal at plugin-load time (microseconds), an extra dependency edge in `marketplace.json`'s manifest test, zero bundle impact in the web-app sense. **Don't measure what isn't measurable yet** — wait until Phase 2 actually populates shared.

### Q2 — Sync script cost

Looking at the shape: `applySync` iterates 6 plugins, plans each, then `copyFileSync`s. Per plugin that's a low-hundreds-of-files walk + a handful of writes. `detectDrift` does a forward `readFileSync` + `Buffer.equals` per planned destination — ~40 file-pair reads total.

PR2's doubling claim is actually pessimistic: in Phase 1 the new direction is a no-op (shared is empty), so PR2's runtime cost is "one more set of empty walks." Real doubling lands in Phase 3 when both directions coexist with content, but PR3 immediately starts dismantling the root direction — the doubling window is narrow.

Worth doing in PR2 since you're touching the script anyway: **have the new sync path's tests assert wall-clock runtime stays under some loose budget** (like "1 second for the empty-shared case"). Not as a CI gate — as a tripwire that fires if Phase 3 accidentally pulls in a glob that walks `node_modules` or `projects/archive/`. The bound doesn't have to be tight; it just has to catch O(n²) accidents.

### Q3 — Duplication cost of "every consumer carries its own copy"

The numbers in the question are correct order-of-magnitude. A few things on the cost side, none load-bearing:

- **Git pack cost**: identical content across 4 plugin trees compresses extremely well — git's delta + zlib will collapse most of the duplication. Working-tree shows ~250KB; `.git/` grows ~30-50KB.
- **Editor cold-start / grep noise**: this is the cost I'd flag as *actually* worth noticing. When a developer greps for a function name across the repo, they get 4 hits for every shared-lib symbol. Real DX cost that scales with consumer count. Mitigation is `.gitattributes` + ripgrep-ignore patterns.
- **Sync drift surface**: a human reading `plugins/loom/cli/lib/project.ts` doesn't see "this is generated" — there's no header comment in the synced copies. **Worth considering: have the sync script stamp a `// GENERATED FROM plugins/shared/cli/lib/project.ts — edits will be overwritten` comment at the top of each synced file post-dissolution.** Tiny overhead, big "don't touch this" signal.

The interview's resolution (sync-into-every-plugin instead of cross-plugin runtime resolution) is the right call from a cost perspective: the runtime alternative would push complexity into the plugin loader's resolution machinery, dramatically more expensive to debug.

### Q4 — Phase 1 constraints on Phase 2 performance

I see one shape concern, and it's not severe: PR1 wires up cascade dependencies that have no live content behind them. That means the manifest-test assertions end up asserting "shared is in the cascade" without asserting "shared actually carries anything." Add the fresh-install smoke as part of PR1's verification too, not just R1's risk-mitigation language.

The other Phase-2 constraint: PR2 keeps both sync directions live in parallel. That's the right backward-compat shape, but the doubled-runtime window is bounded by Phase 2's schedule. If PR3 slips, you're running the doubled-work sync for longer than planned. Doesn't change the design, just worth knowing.

### From whiteboard-a11y

Carving out: this phase has no rendered surface. No DOM, no focus, no contrast, no screen-reader read order, no keyboard interaction. The whole change lives in `plugins/shared/`, `.claude-plugin/marketplace.json`, and `scripts/sync-shared.ts` — all build-time substrate.

**No a11y concerns visible from this phase's surface.**

A couple of small adjacent things worth naming briefly:

**1. CLI error messages from `sync-shared.ts`.** When the script fails, the error text *is* the UX for the contributor. Plain language over jargon. Don't rely on color alone — make sure the *word* "error" or "ok" is also present.

**2. README / contributor docs for `plugins/shared/`.** If PR1 adds a README explaining the cascade: heading hierarchy that actually nests (`#` → `##` → `###`, no skips); link text that means something on its own; code blocks with language hints.

**3. plugin.json/marketplace.json descriptions are microcopy.** When they eventually surface in a UI, the description is short, plain, says what the plugin *does* not what it *is*. Worth writing it that way now so the future UI consumer doesn't have to re-litigate.

The a11y bar actually shows up later when there's a rendered gallery, sketch chrome, or UI consuming the marketplace metadata. Phase 1 is laying pipe.

### From whiteboard-react-architect

Carving out gracefully — this phase is pure substrate (marketplace.json cascade, plugin.json skeleton, a TypeScript sync script). No React, no JSX, no `'use client'` boundary, no hook composition, no prop API. The React-API-architecture lens has nothing to grab onto.

The closest analogues would be: function-signature shape in `sync-shared.ts` (one monolithic `syncShared(direction, source, target, options)` vs a small composable pair) and symmetrical naming for the two directions. But those are generic software-design calls better owned by design-systems' naming lens or the script's substrate architect.

**No React-API concerns visible from Phase 1's surface. Will re-engage when a phase touches component code.**

### From whiteboard-sketch-ideation

Out of scope — this is marketplace-repo substrate work (plugin skeleton + sync script), not sketches, sketch infrastructure, or aart.camp gallery framing. Deferring to substrate and tooling voices. No design pressure to add from the generative-art lens here.

(Noted in passing: the `whiteboard-sketch-ideation.md:88` "loom/draft CLIs" line is a downstream prose-sweep concern for PR11, not a Phase 1 input — flagging only so it doesn't get lost.)

