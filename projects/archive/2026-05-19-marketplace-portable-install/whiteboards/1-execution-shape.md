# Whiteboard: Phase 1 execution shape — risks, ordering, and surprises before unit work on the marketplace portable install bundled PR

## Round 1

### From whiteboard-a11y

# Accessibility — recuse

Recusing on this one. The migration is pure substrate plumbing — `marketplace.json`, bin shims, sync scripts, install docs. No end-user UI, no rendered DOM, no keyboard interaction surface, no motion. The "users" here are other engineers and agents invoking CLIs; there's no assistive-tech experience to design for.

One adjacent observation I'll leave on the table rather than press, in case it's useful to whoever owns workstream 8 (README + install doc rewrite):

- **Install-doc plain language and code-block clarity matter.** The audience for the new install doc includes engineers who may be using screen readers or terminal readers — copy-pasting from fenced code blocks, following ordered steps. A few cheap habits help: language-tagged fenced code blocks (` ```bash ` not bare ` ``` `) so screen readers announce them as code; descriptive link text ("see the marketplace skeleton plan" not "click here"); explicit step numbering when order is load-bearing (e.g., "you must run `griot init` before adding the marketplace" — say that in prose, not just by step position). None of this is a blocker for Phase 1 merge; it's just the lowest-cost place to bake in habits that compound across future docs.

That's my only contribution. Deferring the rest to substrate-engineer, performance, skeptic, and testing-strategy — they're holding the load-bearing concerns here.

Files referenced (none read; recusal based on the brief alone):
- `/Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/PLAN.md` (per brief)
- `/Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/RESEARCH.md` (per brief)
- `/Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/whiteboards/research-shift-01-cli-residency-and-learnings-location.md` (per brief)

### From whiteboard-design-systems

Recusing. This phase is pure substrate plumbing — CLI shims, marketplace.json, sync scripts, install verbs. There's no component surface, no token layer, no design-to-code handoff, no shared visual vocabulary at stake. The "naming is architecture" lens does have a faint adjacent angle here (the six plugin names — `griot`, `guild`, `loom`, `ev`, `review-skill`, `agent-loop-full` — are an external-facing vocabulary that consumers will type and read), but that naming appears already settled in PLAN.md and RESEARCH.md, and pressure-testing it belongs to the skeptic, not to me.

Deferring to substrate-engineer, performance, testing-strategy, and skeptic for the load-bearing perspectives on this phase.

### From whiteboard-performance

Good — I have enough. The cli/lib tree is ~25 files, six plugins, so the sync script's worst case is ~150 file operations. That's tiny. Let me give my section.

---

## 2. Skill-body rewrite (Workstream 6) — cost is in the audit, not the execution

`Bash("bin/<cli> ...")` → `Bash("<cli> ...")` is a mechanical find-and-replace. The execution is free. What's load-bearing is the **audit cost** — making sure the find-and-replace didn't miss a variant.

Things that could shape the regex and bite if not enumerated:

- `Bash("bin/loom ...")` vs `Bash('bin/loom ...')` (quote style)
- `Bash("./bin/loom ...")` (leading `./`)
- Multi-line bash invocations where `bin/loom` appears on a continuation line
- Inline-prose references in skill bodies that document the CLI ("run `bin/loom plan`...") — those want rewriting too, for doc consistency, but they're not load-bearing for execution
- References inside fenced code blocks that are illustrative, not invoked

The Workstream 6 line in the plan reads as a one-liner — "pass through every `SKILL.md` and replace." The actual safe move is: **grep the universe first, classify the hits into rewrite-needed vs. illustrative-only, then transform.** Doing it blind risks corrupting documentation that intentionally shows the old form for historical context.

This is a substrate-engineer concern more than perf, but it touches the "render hot path" analog: every skill invocation is a hot path of sorts, and a broken Bash line at the top of a skill body is a 100% failure rate for that skill. Loud failure, but every consumer hits it.

---

## 3. Install-time cost — the only "perf" the end-user feels

Users will experience two install paths:

- **Turnkey** (`agent-loop-full`): one command, cascades into five installs.
- **Granular**: up to five sequential `claude plugin install` invocations.

The plan's Verification V4/V5 leaves open whether `requires` cascades exist. If they don't:

- The turnkey install becomes either (a) a copy-everything plugin (defeats the granular split's whole point AND inflates install download), (b) a post-install script (extra runtime, harder to reason about), or (c) docs-only ("run these five commands"). Option (c) has zero install-time cost beyond the user's typing — and in the "performance" frame, that's arguably the cheapest answer. The cost is UX, not bytes.

Worth flagging: each plugin install presumably clones or fetches the marketplace repo. If Claude Code re-fetches per plugin (rather than caching the marketplace tree across installs in one session), turnkey install does five redundant fetches of the same repo. That'd be a noticeable wait — tens of seconds of network on a slow connection. V4/V5 spikes should observe this and note it if it shows up; if Claude Code caches the marketplace tree, free; if not, the meta-plugin's UX is worse than expected and (c) docs-only might actually feel snappier.

---

## What I'd want measured after the unit ships

These are post-merge observations to capture in the project retro, not blockers:

- **`scripts/sync-shared.ts --check` runtime** on a clean tree (should be sub-second).
- **`scripts/sync-shared.ts` write runtime** on a fully-out-of-sync tree (cold sync — proxy for fresh-clone cost).
- **CI overhead delta** before/after the sync check is added. Probably under a second; if it climbs higher, the script's hot loop deserves another look.
- **Turnkey install wall-clock** on a fresh machine: from `claude plugin install agent-loop-full@krambuhl` to "skill executes." This is the user-facing "perf" number that matters most. If it's 90+ seconds, the meta-plugin shape isn't actually a turnkey experience; if it's under 30, fine.

---

## What I'm explicitly NOT worried about

- Bundle size — there is no bundle.
- Hydration — no React.
- Client-boundary placement — no client.
- Render hot paths in UI — no UI.
- The CLI's own runtime overhead per invocation — Node 24 startup on the user's machine is bounded (~50-150ms cold), the CLI verbs do bounded I/O, and the dominant cost when a skill runs is the LLM round-trip, which dwarfs everything else.

---

## One mild pushback on the plan

Plan § OQ2 ("commit `plugins/<name>/cli/lib/` to git, or gitignore it and regenerate"): from a pure-performance lens, **committing is the right call for now.** Reasoning:

- The repo isn't large; doubling the `cli/lib/` footprint across six plugins is maybe 100KB of duplicated TypeScript. Trivial.
- Gitignoring means plugin install requires the sync to have been run somewhere — either CI publishes a built artifact, or Claude Code runs the sync at install time. Both add complexity and install-time cost.
- Committing makes every framework change a multi-file diff, which the plan flags as a downside — but that diff is `git diff`-grep-able and `scripts/sync-shared.ts` produces deterministic output, so a noisy diff isn't a *confusing* diff. R6's "PR is large" risk grows slightly, but mechanical noise reviews fast.

If commit-the-sync-output becomes painful later (the diff noise actually obscures real review signal), revisit then. The performance lens says: pay the small commit-time cost now to keep install-time fast and predictable.

---

## Files referenced

- `/Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/PLAN.md` (read for workstream ordering and risks)
- `/Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/RESEARCH-NOTES.md` (skimmed for context on Node 24 environment claim)
- `/Users/krambuhl/Sites/agents/cli/lib/` (25 TypeScript files — confirms the sync surface is small)
- `/Users/krambuhl/Sites/agents/scripts/` (does not yet exist — sync-shared.ts is greenfield)

### From whiteboard-react-architect

Recusing: this phase is pure substrate plumbing — marketplace.json, bash shims, TypeScript sync scripts, CLI verbs. No React surface, no `'use client'` boundary, no component API shape, no hook composition. The React-architecture lens doesn't have purchase here.

One adjacent observation before I step back, in case it's useful to the substrate engineers: the `bin/griot init` verb is the closest thing in this PR to a "component API" — it's the human-facing call site that every downstream consumer will type. Worth treating its flag surface (positional args vs. named flags, default behavior when run in an already-initialized repo, what it prints to stdout vs. stderr) with the same care you'd give a prop API, because once it ships and people put it in their own scripts, the shape is sticky. But that's design-systems / substrate-engineer territory to lead on — flagging it sideways, not claiming it.

Deferring the load-bearing lenses to substrate-engineer, performance, skeptic, and testing-strategy.

### From whiteboard-skeptic

Good — I have enough. Now I can write the skeptic section. Let me focus on what the other engineers won't catch: the *execution-ordering* and *un-mergeability* risks specific to this being one bundled PR.

---

### From whiteboard-skeptic — Phase 1 execution pressure-test

The architectural decisions are mostly settled and I trust the panel's earlier round on those. What I want to pressure-test is the **execution shape**: nine workstreams, one PR, sequence-dependent failure modes, and a handful of load-bearing assumptions that PLAN.md treats as resolved when they're actually still live. Here are the three findings I'd put on the board before this PR gets opened.

---

#### Finding 1 (HIGH impact): V4 (`requires` field) is upstream of the marketplace skeleton — but it's listed as a verification, not a prerequisite. If it comes back negative, the manifest you author in workstream (1) is wrong shape.

PLAN.md § Verification V4 asks whether `marketplace.json` supports a `requires` (or equivalent) field on plugin entries. PLAN.md § Risks R5 names what happens if it doesn't: V5's spike has to pick between three ugly options for `agent-loop-full`. But the ordering in PLAN.md § Phases puts the marketplace skeleton at **workstream 1** (literally the first thing built), and V4 doesn't have an explicit "must complete before workstream 1" gate.

The concrete failure mode: you author `.claude-plugin/marketplace.json` with six entries including `agent-loop-full` declaring `requires: ["griot@krambuhl", "guild@krambuhl", ...]`. You build out the per-plugin trees. You write the bin shims. Two days into the work, V4 verification comes back negative — Claude Code's marketplace.json schema doesn't honor `requires`. Now `agent-loop-full` is in an undefined state: it's either a content-duplicating mega-plugin (defeats the granular split), a post-install script wrapper (Claude Code may not support plugin post-install hooks at all), or documentation-only ("run these five commands") — and the third option means workstreams 3 and 8 (bin shims, README) have to be rewritten to match.

**Remedy** (concrete, low-cost):
1. Re-order the workstreams. **V4 + V5 spike runs before workstream 1.** Spawn `claude-code-guide` to verify `requires` field support; if absent, also verify whether post-install hooks exist on plugin install. This is ~30 minutes of agent work that gates the manifest shape.
2. If V4 negative: explicitly choose the `agent-loop-full` shape *before* writing the manifest. PLAN.md § Risks R5 already names "revisit one-bundled-mega-plugin" as a fallback — surface that as a real decision point, not a "if both negative" footnote.
3. The PR's first commit should be the V4/V5 spike result documented inside the PR description ("V4 returned X, so `agent-loop-full` ships as Y"). Without that, the reviewer (the user himself) is being asked to ratify a manifest whose shape depends on a fact not in the diff.

This isn't a "design problem" — the design accommodates either outcome. It's a **sequencing problem**: V4 is treated as parallel-verifiable when it's actually upstream of every other choice. Fix the ordering in the PR's worklog before the worklog becomes the commit log.

---

#### Finding 2 (HIGH impact): "One bundled PR" + "shared lib drift" + "commit the generated trees" is a self-review trap. OQ2 is not a side question — it's load-bearing for whether this PR is reviewable at all.

PLAN.md § Risks R6 says reviewer cognitive load is "bounded by the user's own attention" because the user reviews their own PR. That's true *for non-mechanical changes*. But OQ2 (whether `plugins/<name>/cli/lib/` is committed to git or gitignored-and-regenerated) determines whether the diff contains **five copies of every cli/lib file** alongside the authoritative one — i.e., whether the PR has five times the line-count surface for any change that touches shared CLI code.

Concrete math. Workstream 4 (`bin/griot init` verb) adds a new file in `cli/verbs/griot/init.ts`. If `plugins/<name>/cli/lib/` is committed: the sync script copies the relevant cross-cutting code into `plugins/griot/cli/lib/`. But what about the verb itself? Does `cli/verbs/griot/init.ts` also get copied into `plugins/griot/cli/verbs/griot/init.ts`? PLAN.md § Scope says "shared `cli/lib/` + cross-cutting verbs into each plugin's `cli/lib/`" — but the per-plugin trees need *all* the verbs for that family, plus shared lib. So a new griot verb is at minimum a two-file change (authoritative + plugin copy). Multiply across workstream 5 (griot resolution refactor touches multiple files), workstream 7 (ev preflight touches 3 skill bodies), and you're looking at a diff where every conceptual change shows up 2-6 times depending on which plugins it cross-cuts.

The compounding risk: **the user reviews their own PR with high context, but a year from now the same user reading `git log` of this commit will see a 5,000-line diff and have no way to tell which lines were intentional and which were sync-script output.** The PR is the documentation; if the diff is dominated by mechanical sync output, the load-bearing intent is buried.

**Remedy** (concrete, in priority order):
1. **Resolve OQ2 before the PR opens, not in plan-implementation.** Lean: gitignore the generated trees. PLAN.md mentions "requires Claude Code's plugin install to include a build step; unclear if supported" — that's another V4-shaped verification that needs to happen up front. If Claude Code's plugin install can run a build/sync step (or if you publish via a separate publish action that does the sync before the marketplace.json sees the trees), keep the generated trees out of git. The diff stays focused on authoritative source + sync script + manifest.
2. If Claude Code's plugin install can't run a build step and the generated trees *must* be committed: split the PR. Workstream 1 (marketplace skeleton + manifest + empty plugin dirs) is the gate PR. Workstream 2 (sync script + first generated commit) is the bulk PR. Workstreams 3-9 layer on top. This violates "one bundled PR" from PQ1 — but PQ1 was decided when the scope of "bundled" was smaller than nine workstreams crossing five plugin trees with sync-driven duplication. The decision deserves a re-press now that the shape is concrete.
3. If neither remedy lands: at minimum, the PR description must explicitly call out which files are sync-script output ("generated by `scripts/sync-shared.ts`, do not review line-by-line; review the script + the source instead"). This is the "what does the next person reading this need to understand" remedy — make the review boundaries explicit in the diff itself.

PLAN.md § R1 ("shared lib drift") names the *runtime* risk of drift; this finding names the **review-time** risk of duplication. They're different concerns and the plan currently only addresses the first.

---

#### Finding 3 (MEDIUM impact): The pre-migration housekeeping bullet is doing too much load-bearing work for something that's "separate." Three pre-conditions need to be true before the migration PR can mechanically succeed, and the plan treats only one as an explicit prerequisite.

PLAN.md § Pre-migration housekeeping mentions deleting `skills/a11y-review-file/` and fixing the `install.sh:154` typo (mooted by deletion). Fine. But three other pre-conditions are baked into workstreams without explicit gating:

1. **The `~/.agents/docs` references in skill bodies.** Confirmed by grep: `skills/ev-loop-confidence/SKILL.md:31`, `skills/ev-loop-interactive/SKILL.md:31`, `skills/loom-archive/SKILL.md:30` all cite `~/.agents/docs/` as a path. PLAN.md § V3 names the audit. PLAN.md § Scope says "Cleanup of stale references in skill bodies (the `~/.agents/...` paths flagged by RESEARCH Phase 0 V3 audit)" — but it's bundled into workstream 6 (skill body rewrites). The remedy for each hit isn't trivial: each cite needs either (a) a new `bin/loom docs` verb that prints the doc path post-install, or (b) accepting that the plugin install *also* creates a `~/.agents/docs` symlink (defeats part of the cleanup goal per Design-systems' round 1 finding), or (c) inlining the convention content into the skill body. **None of these three is a find-and-replace.** They're three different design choices, and the plan currently treats them as bulk-rewrite scope.

2. **The 12 skill bodies that contain `bin/loom|guild|griot` references** (verified by grep above: 103 occurrences across 12 files). The rewrite is mostly mechanical, but several skills also contain `Bash("bin/loom adopt")` and similar shorthand that may or may not refer to a real verb (per substrate-engineer's round-1 finding about the `bin/loom adopt` phantom verb). Each reference needs a quick disambiguation pass: is this `bin/loom project adopt`? Or is it referring to a verb that doesn't exist? PLAN.md treats this as workstream 6 mechanical work; in practice it's mechanical-with-judgment.

3. **V1 (settings.local.json enrollment safety) is named as Phase-0 verification but PLAN.md doesn't gate the migration PR on its outcome.** The dossier's entire "invisible to colleagues" claim depends on V1's result. If V1 returns worst-case ("silent auto-install"), the migration PR's scope changes: you don't ship the meta-plugin at all, or you ship it with explicit warnings, or you use `--scope user` instead. PLAN.md § Verification V1 says "Pass / Failure criteria" but doesn't say what happens to the migration PR's content if V1 fails.

**Remedy** (concrete):
1. **Move the `~/.agents/docs` resolution decision to a pre-PR design call.** Pick one of (a)/(b)/(c) for the three cited skills before workstream 6 begins. The cleanest pick: option (c) for `ev-loop-confidence`, `ev-loop-interactive`, `loom-archive` — inline the relevant convention pointer or replace with a `bin/<cli> docs` invocation. But the decision shouldn't happen inside the bulk-rewrite workstream; it should happen before.
2. **Gate the migration PR on V1's outcome** explicitly. If V1 hasn't run or returns worst-case, the migration PR's `agent-loop-full` install instructions must change. Add this as a hard checklist item in the PR description: "V1 result: [X]. Install scope decision: [Y]."
3. **Audit the 103 `bin/<cli>` references for the phantom-verb class** before workstream 6 starts. A 15-minute grep + read pass would surface the references-to-nonexistent-verbs (substrate-engineer's Finding 3 from round 1) and let workstream 6 stay genuinely mechanical.

These three pre-conditions aren't risks per se — they're prerequisites the plan currently leaves as fold-into-workstream-N work. Surface them as explicit pre-PR gates and workstream 6 becomes the rote rewrite the plan wants it to be.

---

#### What I'm *not* flagging

A few things I want to explicitly *not* press on, because they're either already well-handled or out of scope:

- **R6 ("one bundled PR is large")** — already adequately mitigated by single-reviewer attention bounds, *conditional on Finding 2's resolution*. If OQ2 picks gitignored generated trees, R6 stays low. If it picks committed, R6 is wrong about cognitive load and Finding 2's remedy 2 applies.
- **R1 (shared lib drift)** — sync-script + pre-commit + CI is belt-and-suspenders. Right level of paranoia.
- **R3 (Patreon Node version drift)** — V2 verifies the current state, the shim's failure mode is loud. Acceptable.
- **The architectural decisions themselves** — naming, plugin shape, library-vs-binary boundary, learnings residency. All settled and well-reasoned in round 1; pressing again would be re-litigation.

---

#### Round-2 prompt for the panel (if there is one)

If the panel runs a round 2, the question worth pressing at performance + testing-strategy together: **does the sync-script approach create a hot-loop in development**? Every change to `cli/lib/` or a cross-cutting verb triggers a regen of five plugin trees, which means every dev iteration on the framework's internals now touches more files than before. Is the sync-script idempotent + fast enough that this is invisible (lean: yes, ~600 KB), or does it become a Friday-afternoon friction point? Worth measuring before committing to "sync runs on pre-commit + CI."

That's my section. The three findings above are the ones I'd insist on closing before the PR opens; everything else in the plan is sound enough to ship-and-iterate on.

---

Relevant file paths:

- /Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/PLAN.md
- /Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/RESEARCH.md
- /Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/RESEARCH-NOTES.md
- /Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/whiteboards/research-shift-01-cli-residency-and-learnings-location.md
- /Users/krambuhl/Sites/agents/skills/ev-loop-confidence/SKILL.md (line 31, `~/.agents/docs` reference)
- /Users/krambuhl/Sites/agents/skills/ev-loop-interactive/SKILL.md (line 31, `~/.agents/docs` reference)
- /Users/krambuhl/Sites/agents/skills/loom-archive/SKILL.md (line 30, `~/.agents/docs` reference)
- /Users/krambuhl/Sites/agents/cli/verbs/griot/capture.ts (line 446, cwd-rooted learnings resolution to be refactored to project-root walk-up)

### From whiteboard-sketch-ideation

This is substrate plumbing — marketplace.json, CLI shims, sync scripts, install paths. No sketches, no p5, no canvas, no gallery framing. Recusing.

### From whiteboard-substrate-engineer

I have enough context. Let me put my Round 2 substrate-engineer hat on for this Phase 1 execution brief.

---

### From whiteboard-substrate-engineer (round 2 — pre-execution)

The architecture is sound. My round-1 contributions on cwd-rooting, gitignore-amendment as a new invariant, and the `bin/griot init` shape all carried into PLAN.md. What I want to press on here is **what the PLAN.md ordering doesn't yet name about substrate-shape risk during the actual migration** — places where I'd expect this bundled PR to silently break a substrate invariant if we execute the workstreams in the listed order.

#### 1. Workstream 2 (sync-shared.ts) creates a new write surface. The PR introduces a second writer to `plugins/<name>/cli/lib/` files. That's a substrate-shape question.

The PLAN names sync-shared as a build-time tool with pre-commit + CI as guardrails. But step back: this is **a new mutating path against tracked files**, and it operates *on the same content* that humans edit. Two writers, one source of truth. Family-shape question: which of the three parallel-work categories does the sync script belong to?

- Category 1 (append-only)? No — it rewrites whole files.
- Category 2 (partitioned)? Partition key is the plugin name. Sort of — each plugin's `cli/lib/` is a separate partition. But the *content* is sourced from a single upstream, so two concurrent sync runs against the same upstream produce identical outputs (idempotent), and two concurrent edits of the same upstream file + sync collide on upstream, not on the partitions.
- Category 3 (single-writer)? The substrate-fit answer. The sync script is a Category-3-shaped writer against the union of all per-plugin `cli/lib/` paths, where the "exception" is *"generated-from-upstream-by-sync-shared"*. Two humans editing `cli/lib/manifest.ts` and racing the sync produces a non-determinism window that drift detection catches *after* the fact, not before. That's fine for a build artifact; it's not fine to leave undeclared in CONVENTIONS.md.

**Concrete substrate ask before workstream 2 lands**: add a paragraph to CONVENTIONS.md naming sync-shared as a generator and adding `generated-from-upstream` as a fourth-category-or-declared-exception. The registry test (`cli/parallel-work-invariant.test.ts`) doesn't need to grow a row — the generator isn't a CLI verb — but the doc needs the bullet so future-you doesn't accidentally hand-edit a `plugins/<name>/cli/lib/` file and ship the drift.

Sibling-shape concern: this is the same shape question as OQ2 ("commit or gitignore the generated trees"). The substrate-fit answer drops out of the category framing — if generated trees are committed, drift is a *visible* failure mode (CI catches a two-file diff that doesn't match). If gitignored, drift becomes a *plugin-publish-time* failure mode (the published artifact is stale relative to upstream). Committing wins on the substrate's general preference for "make failure modes visible at the substrate boundary, not at the consumer boundary."

#### 2. The PLAN's workstream ordering puts skill-body rewrites (W6) *after* sync-shared (W2), but the skill-body rewrites change substrate state that the sync script reads. The order is wrong.

Walk through what each workstream writes:

- W2 (sync-shared) generates `plugins/<name>/cli/lib/`.
- W4 (`bin/griot init` verb) adds a new file to `cli/verbs/griot/`.
- W5 (project-root resolution) edits files in `cli/verbs/griot/`.
- W6 (skill-body rewrites) edits `skills/**/SKILL.md` — and also generates `plugins/<name>/skills/`.

If W2 lands first, it generates per-plugin skill trees from skills that *still call `bin/loom`*. Then W6 rewrites the upstream skills, and the per-plugin trees go stale. Drift detection catches it on the next CI run, which is fine if W6 runs before commit — but if a developer (or a future replay session) executes the workstreams sequentially as numbered, W2's output is wrong for ~four workstreams' worth of intermediate state.

**Substrate-shape fix**: sync-shared should be the *last* mechanical step before commit, not the second. The ordering that respects the substrate's "fold-over-events" shape is:

1. W1 (marketplace skeleton — empty `plugins/<name>/` dirs)
2. W4 (`bin/griot init` — new upstream verb)
3. W5 (project-root resolution — upstream edits)
4. W6 (skill-body rewrites + V3 audit — upstream edits)
5. W7 (ev preflight — upstream edits)
6. W3 (per-plugin bin shims — upstream artifacts to be synced)
7. **W2 (sync-shared run)** — generates plugin trees as a *fold over the upstream changes*, not a midway snapshot
8. W8 (docs)
9. W9 (install.sh deletion)

The substrate principle: generators run last. The upstream is the source of truth; the generated trees are a fold. Running the fold before all upstream edits land creates a window where the substrate state is internally inconsistent — and any test that runs against the generated trees during that window reports false signal.

#### 3. `bin/griot init` is named in PLAN.md but its Category-3 exception isn't in the registry yet. Workstream 4 has a substrate-debt prerequisite the plan doesn't name.

PLAN.md § Pre-migration housekeeping mentions deleting `a11y-review-file` and the `install.sh:154` typo. It does not mention: **register `gitignore-amendment` as a declared exception in `CONVENTIONS.md` and add the `bin/griot init` row to `cli/parallel-work-invariant.test.ts`**. The test will fail loud on the new verb otherwise (and it should — that's the tripwire working). But the PR will hit that failure mid-execution unless the registry update is sequenced first.

**Substrate-shape ask**: workstream 4 has two sub-steps that must land *in order* within the workstream:

- 4a. Add `gitignore-amendment` to CONVENTIONS.md § Declared exceptions.
- 4b. Add the `griot init` row to the registry test with the new exception.
- 4c. Write the verb itself.
- 4d. Wire dispatch in `cli/verbs/griot/index.ts`.

This is the canonical substrate-evolution pattern: the *contract* (CONVENTIONS.md row, registry entry, tripwire) lands before the *implementation* that the contract permits. Reversing it produces a transient state where the registry test fails on the new verb, and any agent-driven dev loop will get stuck in a non-actionable "test failing" state.

#### 4. The griot project-root resolution refactor (W5) is the one substrate-contract change in this PR and it deserves a soft-extension treatment, not a hard cutover.

Currently: `ctx.cwd` is the resolution root. Three call sites (`capture.ts:446`, `use.ts:129-130`, `index.ts:11-13` docstring). The refactor walks up to find `.git/` with cwd fallback.

The schema-evolution question: what reads `learnings/` paths that were *written* under the old cwd resolution? Two places to worry about:

- **The marketplace's own `learnings/` tree.** It currently lives at the repo root, which IS the project root by the new walk-up rule. So the marketplace's own learnings keep resolving to the same place — no migration needed. Good.
- **Personal-machine projects that were `bin/loom project adopt`-ed and have an existing `learnings/` somewhere relative to wherever the user happened to `cd`.** If those projects' `learnings/` happens to be at the project root, no change. If it's nested (cwd was a subdirectory at the time), the new resolution will *not find it* and will create a sibling `learnings/` at the project root. The old `learnings/` becomes orphaned.

PLAN.md doesn't name this migration concern. The likely truth is "no such projects exist" (the user has used griot from the marketplace clone's root, not from nested subdirs), but the substrate-shape ask is **a one-line `griot doctor` check that warns when both `<cwd>/learnings/` and `<project-root>/learnings/` exist and differ**. Cheap to add, defends against silent context loss for any session that pre-dates the refactor.

Soft-extension shape, not hard cutover: keep the cwd fallback in `use.ts` (it's already a soft fallback when no `.git/` is found). Add the doctor warning. Document the new resolution rule. Done.

#### 5. The sync-shared "drift detected" CI failure has a UX shape that matters for the substrate-self-development loop.

When CI fails on sync drift, the developer (often me, often an agent session) needs to know *exactly which file to regenerate from which source*. Today's mental model — "run `npm run sync` and commit" — is fine if the sync script is hermetic. But the substrate principle here is **make the substrate state self-describing**: the CI error message should name the upstream source path, the divergent plugin path, and the one-shot remedy. Otherwise drift becomes a "what generates this file" question that the developer has to answer by reading the sync script.

Not a substrate-shape blocker, but a substrate-ergonomics ask that compounds: each generator we add (and this PR adds one; future PRs may add more — `agent-loop-full`'s implementation per V5 may add a second) should ship its remedy string inline with its drift message. One canonical shape: `drift in <plugin-path>; regenerate via 'npm run sync-shared'; upstream source is <cli-lib-path>`. Same shape as today's `checkin-already-exists` loud-fail.

#### 6. `agent-loop-full` (V5 spike) is the substrate-shape question I'd most want pre-decided before execution begins.

PLAN.md says "spike each option once V4 is verified, pick the cleanest." From the substrate-shape lens, the three options have very different fold-over-state implications:

- **Option (a) — copies of everything**: defeats the granular split. Two writers (upstream + meta-plugin tree). Drift surface doubles. Substrate-fit: poor.
- **Option (b) — post-install script that runs five `claude plugin install`s**: introduces an orchestration verb at the wrong layer. The meta-plugin is now a Category-3 mutating writer against the consumer's `.claude/settings.local.json`. That's a different shape from the other plugins entirely.
- **Option (c) — documentation only**: not a plugin, just a README section. Zero substrate footprint. Honest about what it is.

If V4 confirms `requires` works, option (a) collapses to a zero-content plugin manifest with deps — clean. If V4 says no, the substrate-fit answer is option (c), not option (b). Option (b) makes the meta-plugin a *different kind of thing* from its siblings — they're content-bundles, it's a script-runner. Family-shape inconsistency at the meta layer ripples into "how do you uninstall the turnkey?" questions that have no clean answer for option (b).

The substrate-shape ask: **make V4 a hard gate before W1 starts**. If V4 fails, pivot to option (c) (a README section, no plugin) rather than try to build option (b). Saves a substrate-shape regression later.

#### 7. One thing I'd add to "what would make this PR un-mergeable"

The parallel-work-invariant test (`cli/parallel-work-invariant.test.ts`) is the tripwire that asserts CONVENTIONS.md and the registry stay aligned. The PR adds **one new verb** (`griot init`) and **arguably one new write surface** (sync-shared). If either lands without updating the registry/CONVENTIONS pair, the test fails and the PR is un-mergeable until fixed. That's *good* — that's the tripwire doing its job — but it means the registry+CONVENTIONS update is a *load-bearing sub-step* the PLAN currently treats as implicit.

**Make it explicit in the workstream list**, alongside W4 step 4a above. The substrate's existing safety net catches the mistake; the plan should name the step so the agent driving the work doesn't get confused mid-execution by a "why is this test failing?" loop.

---

### Net substrate-shape additions to the plan

1. **Re-order workstreams** so sync-shared (W2) runs *last among mechanical steps*, after all upstream edits land. Generators fold over upstream state; they're not a midway snapshot.
2. **Sequence within W4**: CONVENTIONS.md + registry update *before* writing the `bin/griot init` verb body. The contract lands before the implementation.
3. **Add a CONVENTIONS.md paragraph** for `sync-shared` as a generator and `generated-from-upstream` as either a fourth category or a declared exception. Resolves OQ2 alongside it.
4. **Gate V4 (manifest `requires` field) before W1**, not after W5. If V4 fails, the meta-plugin pivots to documentation-only (option c), not a post-install script (option b).
5. **Add a `griot doctor` check** for the cwd-vs-project-root learnings divergence. Cheap, defends against silent context loss on the resolution refactor.
6. **Drift error message shape**: name the substrate-ergonomics convention — failed sync messages name source path, divergent path, and one-shot remedy. Same loud-fail shape as `checkin-already-exists`.

The PR remains one bundled migration. None of these are scope creep — they're load-bearing sub-steps the PLAN currently treats as implicit, and the substrate's existing tripwire test will surface them mid-execution if we don't sequence them in. Better to name them upfront.

---

Relevant files I consulted:
- `/Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/PLAN.md`
- `/Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/RESEARCH.md`
- `/Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/whiteboards/research-shift-01-cli-residency-and-learnings-location.md`
- `/Users/krambuhl/Sites/agents/projects/CONVENTIONS.md`
- `/Users/krambuhl/Sites/agents/cli/parallel-work-invariant.test.ts`
- `/Users/krambuhl/Sites/agents/cli/verbs/griot/index.ts`
- `/Users/krambuhl/Sites/agents/cli/verbs/griot/capture.ts` (lines 446, 465)
- `/Users/krambuhl/Sites/agents/cli/verbs/griot/use.ts` (lines 129-130)
- `/Users/krambuhl/Sites/agents/install.sh` (head — for context on what's being deleted)

### From whiteboard-testing-strategy

Good — I now have solid grounding. Vitest is the only test runner, no Playwright in this repo, and the test culture leans heavily on `mkdtempSync` for filesystem isolation. Let me write the section.

---

### From whiteboard-testing-strategy

The architecture for this migration is settled — the testing question now is which risks survive the design, and at what tier each one is cheapest to defend. I want to walk the workstream list and tag each risk to a tier, because a few of them are about to get over- or under-tested by reflex, and the panel hasn't pressure-tested *that* yet.

**Where the existing test surface already defends the work, and where it goes silent.** The repo's test culture is mature in one specific shape: every CLI verb has a `verb.test.ts` next to it, using `mkdtempSync` to build a throwaway project root, calling the verb function directly, and asserting on filesystem effects. That pattern catches logic regressions inside verbs beautifully. What it does *not* catch is anything that happens *outside* the verb function: the bin shim's bash, the marketplace.json schema, the skill body's `Bash("loom ...")` invocation, the cross-plugin lib sync. The migration is heavy in exactly that outside-the-verb territory, and the existing test shape will quietly miss most of the risk if we don't deliberately push tests up a tier.

**Tier-by-workstream, with the risk each test would defend.** Walking the nine workstreams:

1. *Marketplace skeleton + manifest.* The risk is "manifest is malformed and `claude plugin install` rejects it silently or with a confusing error." That's a schema-shape risk, and it's the cheapest possible test: a unit test that reads `.claude-plugin/marketplace.json`, asserts the six plugin entries exist with required `name`/`source` fields, and asserts each declared `source` points at a directory that actually exists on disk. Same flavor as `parallel-work-invariant.test.ts` — a registry-vs-reality tripwire. This belongs at the unit tier, full stop; it doesn't need to spin up Claude Code to catch a missing field.

2. *`scripts/sync-shared.ts`.* This is the highest-risk piece of new code in the migration and it deserves the most careful test plan. The risk has two faces: (a) the script writes the wrong content (drift bug), (b) the script *says* it succeeded when the trees are out of sync (false-green bug, the worse failure mode). Unit-test the pure copy/diff logic in isolation: given a source tree and target tree, does it produce the right set of writes? Then add one integration test that runs the script end-to-end against a fixture marketplace layout in a tmpdir, asserts the per-plugin `cli/lib/` matches authoritative `cli/lib/` byte-for-byte, and — critically — a "drift detection" test that *mutates* a per-plugin file post-sync and asserts the CI-check verb exits non-zero. That's the test that catches the false-green failure mode, and it's the test that lets you trust R1's mitigation.

3. *Per-plugin bin shims.* Bash scripts. The bash itself is mostly version-check + `exec node`, which the type system can't help with and a unit test can't reach. The risk: the version check rejects the wrong things, or the `BASH_SOURCE` resolution breaks on certain invocation paths (symlinks, relative paths, weird `$PATH` entries). This wants integration-tier shell tests — invoke the shim via `child_process.spawn` with controlled environments, assert exit code + stderr message. Don't unit-test bash by re-implementing the parsing in TypeScript; that tests the test, not the shim. *One concept per test*: one test for "rejects Node 23," one for "accepts Node 24," one for "resolves the CLI relative to BASH_SOURCE when symlinked." Three sharp tests beat one omnibus.

4. *`bin/griot init`.* New verb, fits the existing verb-test pattern cleanly. Unit-test via `mkdtempSync` of a fake project root. The interesting test isn't "does it create `learnings/`" — the type system and a one-line existence check cover that. The interesting tests are the *idempotency* invariant (run it twice, second run is a no-op and doesn't double-amend the gitignore) and the *gitignore-amendment edge cases* (existing `.gitignore` with `learnings/` already in it, existing `.gitignore` without trailing newline, no `.gitignore` at all, `.gitignore` with a comment block that mentions learnings). Those are the bugs that ship. Factory-shape the test setup: `makeProjectRoot({ gitignore: '...' })` rather than four fixture files.

5. *Griot project-root resolution refactor.* This one I want to push back on hardest. The risk: walking up to find `.git/` instead of using `ctx.cwd` introduces a behavior change in every griot verb that touches learnings — `capture`, `use`, anything else. The temptation will be to unit-test the new `findProjectRoot()` helper in isolation and call it done. That's necessary but not sufficient. The *integration* risk is "the verbs that call it pass through correctly," and the bug shape is "verb still uses `ctx.cwd` somewhere because the refactor missed a call site." The defense: a test for each affected verb that runs it from a deeply-nested `cwd` (e.g. `tmpdir/project/.git/`, then `process.chdir(tmpdir/project/a/b/c/)`) and asserts the verb wrote to `tmpdir/project/learnings/`, not `tmpdir/project/a/b/c/learnings/`. The walk-up *behavior* is the contract; the helper function is the implementation. Test the behavior at the verb boundary.

6. *Skill body rewrites.* The risk is "we missed a `Bash("bin/loom ...")` somewhere and it'll fail at runtime in the consumer's Claude Code." This wants a single repo-wide grep test, not per-skill tests. Same shape as the parallel-work-invariant registry test: `find skills/ -name SKILL.md -print0 | xargs grep -l 'Bash("bin/'` should return zero hits, and the test asserts that. One sentence: "this defends against missed shim references in the bulk skill-body rewrite." Cheap, fast, catches the whole class. Pair it with the V3 `~/.agents/...` audit as a sibling grep test — same shape, same file, two tripwires.

7. *`ev/*` preflight.* Each ev-* skill body gains a `command -v loom guild griot >/dev/null || fail` line. The naive test is "grep every ev-* skill body for the preflight line." That works for "did we add it everywhere" — but the *behavior* under test (does the skill actually fail when a dep isn't enabled?) isn't reachable without running Claude Code. I'd recommend the grep-test for completeness and accept that the behavioral test is V6/V7 (smoke tests on personal + Patreon machines). This is the place where the right answer is "we don't need a unit test for this, the behavior test is the manual smoke." Be honest about it; don't pad coverage with a fake unit test that asserts the string literal is present.

8. *README + install docs.* No automated test. This is documentation, evaluated by reading. Don't invent a "docs-have-no-broken-links" test for one PR; that's belt-and-suspenders churn.

9. *`install.sh` deletion.* The test is "does the migration PR build with `install.sh` deleted." That's CI, not a test. The deeper test is "does anything in the repo still reference `install.sh`" — another grep tripwire, same family as #6 above.

**The V6/V7 smoke tests are doing load-bearing work and they're not in the test plan as I see it.** V6 (personal Mac install smoke) and V7 (Patreon machine install smoke) are the e2e tier for this entire migration. They're listed as verification tasks, not as tests, but they *are* the tests for the integration between marketplace.json + Claude Code's plugin install + the bin/PATH resolution + the skill body's CLI invocation. Nothing the repo can automate will catch a manifest-shape bug that only Claude Code's installer surfaces. I'd push to formalize V6/V7 as a written script — even a markdown checklist of `claude plugin install ...`, then `claude run /loom-research <topic>`, then assert specific observable outcomes — so they're reproducible on the next migration and not one-time human runs. Same instinct as a Cypress test that names the user flow; this is the same shape, just executed by hand because Claude Code's plugin install isn't scriptable from inside this repo.

**Fixture-vs-factory call for the new tests.** Lean factory across the board. The marketplace.json shape will evolve (V4 may add a `requires` field; V5 may reshape the meta-plugin). Fixtures of marketplace.json will rot inside three PRs. Same for the per-plugin directory layouts — write a `makeMarketplace({ plugins: [...] })` helper that builds a tmpdir layout, and assert against properties (count of plugins, existence of `bin/<cli>`) rather than against a frozen JSON file. The one exception: the *current* marketplace.json that the migration produces should have a snapshot or fixture-comparison test that locks the exact shape the PR is shipping, so any unintended diff jumps out in review. Fixture against the shape you ship, factory against the shape you test through.

**Parallel-test safety call.** Vitest runs files in parallel. The new tests I'm proposing all touch the filesystem in `mkdtempSync` directories — the existing pattern is good, keep using it. The one trap: any test that does `process.chdir()` (which the project-root resolution test naturally wants to) is parallel-unsafe because `chdir` is process-global. Either don't `chdir` — pass `cwd` as an arg to the function under test — or wrap the test in `describe.sequential` and pay the parallelism cost. I'd push hard on the first option: make the project-root resolver take a starting path argument, never read `process.cwd()` directly. That's a design constraint on the refactor, not just a test concern.

**What I'd want resolved by the next round, distilling the test plan into a contract the implementer can inherit.** Three named tests that don't exist yet and need to:

- `marketplace-manifest.test.ts` — schema + plugin-source-exists tripwire (unit).
- `sync-shared.test.ts` with three cases: writes correctly, detects drift, idempotent re-run (unit + one integration).
- `skill-bodies-call-bare-commands.test.ts` — grep tripwire across `plugins/*/skills/**/*.md` (unit, repo-wide).

Plus one *deletion*: don't write per-skill rewrite tests; the grep covers the class. Plus one *upgrade*: formalize V6/V7 as a written checklist artifact, not a one-time human run. That's the test contract. Everything else (the project-root verb tests, the bin-shim shell tests, the griot init verb tests) follows the existing repo pattern and lands naturally in the migration PR.

---

Relevant file paths:
- `/Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/PLAN.md`
- `/Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/RESEARCH.md`
- `/Users/krambuhl/Sites/agents/projects/2026-05-19-marketplace-portable-install/whiteboards/research-shift-01-cli-residency-and-learnings-location.md`
- `/Users/krambuhl/Sites/agents/cli/parallel-work-invariant.test.ts` (the registry-tripwire pattern I'm extending)
- `/Users/krambuhl/Sites/agents/cli/verbs/griot/capture.test.ts` (the `mkdtempSync` verb-test pattern)
- `/Users/krambuhl/Sites/agents/package.json` (confirms vitest-only, no Playwright in this repo)

