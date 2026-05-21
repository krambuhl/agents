# Plan — repo-compartmentalize

## Context

This plan addresses structural drift, naming relics, and compartmentalization
gaps in the `agents` marketplace repo. The motivating dossier is at
`projects/2026-05-21-repo-compartmentalize/RESEARCH.md` — every load-bearing
claim below cites a finding there.

The user (Evan) framed it as: "clean up, shared, and compartmentalize the
codebase better… probably lots more once you start thinking about it." The
research audit surfaced thirteen findings; six of them are load-bearing for
the plan, the rest fold into the cleanup phase.

The defining commitment of this project is the **dissolution of the canonical-
at-root layer**: the `cli/`, `skills/`, `agents/`, `docs/` directories at
the repo root will go away. Each plugin becomes the authoritative source
for the content it ships, and `scripts/sync-shared.ts` shrinks from "mirror
everything from root into plugin trees" to "mirror only genuinely cross-cutting
artifacts (the commons lib + docs) from the new `commons` plugin into consumer
plugins." This is a bigger structural reshape than the research initially
recommended, but it matches the user's compartmentalize intent and removes
the relic edit-time layer that the marketplace migration left behind.

## Scope

### In scope

- New `commons` plugin (`plugins/commons/`) housing `grill-me`, `review-skill`,
  `find-skills`, the cross-substrate docs, and the commons TS lib.
- Dissolution of root-level `cli/`, `skills/`, `agents/`, `docs/` directories.
- `sync-shared.ts` rewrite: from root→plugins to commons→consumers.
- Draft restructure: `cli/lib/draft-project.ts` and `cli/lib/draft-git.ts`
  dissolve into `cli/lib/project.ts` and `cli/lib/git.ts` respectively; all
  "draft" prose / comment / package-keyword / skill-text references are swept.
- `learnings/` migration into the griot capture pipeline so the marketplace
  eats its own dog food and produces a real `learnings/rollup.json`.
- Folding `plugins/review-skill/` into `plugins/commons/` (one fewer top-level
  marketplace entry).
- Deleting root `bin/` shims (gitignored relics with misleading provenance).

### Out of scope

- Cross-plugin runtime code import (the canonical-shift moves the canonical
  source from `cli/` to `plugins/commons/cli/`, but each consumer plugin still
  ships its own synced copy at install-time — no runtime cross-plugin
  resolution required).
- Migrating `moshi-best-practices` (user's personal Mosh/SSH/tmux helper,
  doesn't fit the commons substrate identity).
- Hunting `claude-code-guide` agent (not in this repo; likely ships with a
  different installed plugin).
- Repairing broken user-global symlinks (`~/.claude/skills/draft-plan`,
  `~/.claude/skills/a11y-review-file` — out of repo, RESEARCH.md § 12).

### Deferred (not in this plan, but flagged)

- Per-plugin `cli/lib/` trim (RESEARCH.md § 3): every CLI-shipping plugin
  currently carries the full lib copy, including helpers it doesn't import.
  Trade-off (script-complexity vs ~12KB dead code per plugin) doesn't earn
  its keep today; revisit if compartmentalization pressure increases.
- `plugin.json` description deduplication with `marketplace.json`
  (RESEARCH.md § 11) — single-source-of-truth opportunity, not a relic.
- `projects/CONVENTIONS.md` placement + loom-as-runtime-owner declaration
  (RESEARCH.md § 6): the conventions doc inside `projects/` is functionally
  a loom invariant, but the directory lives at repo root for legacy
  reasons. Moving the doc into the loom plugin (or `plugins/commons/docs/`)
  and updating the marketplace description to declare loom owns
  `projects/` at runtime is a small clarification. RESEARCH framed it as
  lower-priority because moving the directory itself would touch archived
  projects' internal paths. The PR11 prose sweep updates the doc's
  text but does not relocate it. Revisit in a future cleanup project.

## Phases

### Phase 1 — Setup (backward-compatible groundwork, 2 PRs)

**PR1 — Create `plugins/commons/` skeleton + marketplace entry**

- Add `plugins/commons/.claude-plugin/plugin.json` with `{name: "commons",
  description: ...}` (no `version` field per the every-commit-auto-version
  posture, RESEARCH.md § 11).
- Add `plugins/commons/bin/<no bin>` — commons ships no CLI of its own
  (initially), only skills + docs + a lib for other plugins to consume.
- Update `.claude-plugin/marketplace.json` to register commons and add it as
  a dependency of every other plugin that needs `grill-me`, `review-skill`,
  the commons lib, or the docs. **Per the interview's cascade-wiring
  decision (option a — wire all eventual consumers at PR1, even when
  commons is content-empty), the initial cascade after this PR is**:
  - `griot`: gains `commons` dep (CLI-shipping plugin; will receive
    `commons/cli/lib/` content post-PR3)
  - `guild`: gains `commons` dep (same — CLI-shipping)
  - `loom`: gains `commons` dep (loom skills cite `docs/AGENT-CONVENTIONS.md`,
    RESEARCH.md § 3; also CLI-shipping)
  - `ev`: gains `commons` dep (ev skills cite multiple docs)
  - `agent-loop-full`: gains `commons` in the cascade list (it's the
    meta-bundle; cascades the family including commons)
  - `review-skill`: no `commons` dep (its content folds INTO commons at PR8;
    plugin disappears at that point)
- **Dependency ordering** (per design-systems whiteboard finding): list
  `commons` first in each consumer's dependency array (substrate-kind
  dependencies precede peer-kind dependencies). So `loom: ["commons",
  "guild", "griot"]`. Add a test assertion enforcing "if `commons` is
  a dependency, it's the first element."
- Update `cli/marketplace-manifest.test.ts:53-60,201-209` to assert
  commons is present in the cascade AND that the closed-set "exactly 7
  plugins, named X" invariant is preserved (don't loosen to "any name
  allowed" — the closed-set tripwire is load-bearing per the skeptic's
  whiteboard note). Split substrate-dep assertions from peer-dep
  assertions so the two semantic kinds are visible in CI output.
- Update `scripts/sync-shared.ts:PLUGINS` and add a `PLUGIN_CONTENT_RULES`
  entry for commons (placeholder: commons owns nothing yet at this PR
  — content moves in Phase 2). Empty plugin content tree at this stage.
- **Description copy** for `plugins/commons/.claude-plugin/plugin.json`:
  name the role, not the inventory. Draft: "Foundation substrate:
  cross-cutting helpers (commons CLI lib + agent-conventions docs) that
  the loom, guild, griot, and ev plugins all depend on. Cascades in via
  marketplace dependencies; consumers receive a synced local copy at
  install time." Survives day-1 emptiness because it describes role,
  not contents.
- Update `agent-loop-full`'s description in marketplace.json to include
  commons in the cascaded family list.
- **Backward-compat**: nothing breaks. The commons plugin exists with
  zero content; consumers depend on it but receive no synced files until
  PR2 populates the new sync direction and PR3 actually moves content in.

Verification: `npm test` passes (in particular the marketplace-manifest
test); fresh install of `agent-loop-full@krambuhl` cascades commons in
without error.

**PR2 — Extend `sync-shared.ts` for the commons→consumer direction**

Architectural shape (per the substrate-engineer whiteboard finding):
**one planner emitting both kinds of SyncSpec with a source discriminator**,
NOT two parallel planners. The invariant "every file under sync-managed
subdirs has exactly one upstream source" must survive the extension.

- Refactor the planner to emit `SyncSpec { kind: 'root' | 'commons',
  source, destination }`. `detectDrift`/`applySync` stay single-pass.
- Add per-flow consumer rules: `PLUGIN_SHARED_CONSUMERS = { lib: [...],
  docs: [...] }`. doc-consumer-set differs from lib-consumer-set —
  `ev` needs docs but has no `cli/`; `agent-loop-full` is content-empty
  and excluded from both.
- Add the new sync mode: `plugins/commons/cli/lib/` → every consumer
  plugin's `cli/lib/`, and `plugins/commons/docs/` → every consumer
  plugin's `docs/`.
- Keep the old root→plugin sync working in parallel so the canonical
  sources at root continue to be the live edit point during Phase 1.
  (Both kinds of SyncSpec active simultaneously through the same
  planner; the test suite passes with the unified contract.)
- **Add `origin: 'root-canonical' | 'commons-canonical'` field to
  `DriftRecord`** (per the testing-strategy whiteboard finding). When
  CI fails, the developer can distinguish "edited wrong source" from
  "sync script has wrong mapping for one of the two directions."
- **Add a conflict-detection guard in `detectDrift`** (per the skeptic
  whiteboard finding): if any destination has more than one upstream
  source claiming it, fail loudly. Permanent tripwire against the
  dual-write window — survives into Phase 3.
- **Add a tripwire test asserting `plugins/commons/` is leaf-source-only**
  (per substrate-engineer): no `cli/verbs/`, no plugin-specific content.
  Defends the deterministic-generator property under Category 4 of
  `projects/CONVENTIONS.md`.
- **Add a wall-clock budget assertion in the test suite** (per
  performance whiteboard finding): sync runs under ~1 second for the
  empty-commons case. Not a tight bound — catches O(n²) accidents in
  later phases.
- Update `scripts/sync-shared.test.ts`. Split the fixture builder into
  three factories per the testing-strategy whiteboard finding:
  `buildOldDirectionTree()`, `buildCommonsDirectionTree()`,
  `buildBothDirectionsTree()`. Three describe blocks, each defending
  one named risk.
- Rewrite the sync-shared.ts banner comment to describe the contract
  in its eventual shape (commons → consumers), not the half-broken
  transitional state. The transitional state is documented by the code;
  the banner names intent.
- Run `node scripts/sync-shared.ts` to materialize the new (empty)
  commons→consumer flows so the test fixtures exist.
- **Backward-compat**: existing dev workflow unchanged; the new sync
  paths are no-ops until Phase 2 actually populates
  `plugins/commons/`. Per substrate-engineer: the commons planner emits
  zero specs when commons has no content; drift detection has nothing
  to compare; `--check` passes trivially. Verify in a test
  ("commons with empty content yields zero specs, zero drift").

Verification: `npm test`; `node scripts/sync-shared.ts --check` passes
(no drift); manually inspect that consumer plugin trees still get root
canonical content as before.

### Phase 2 — Bulk migrations (strict serial, 5 PRs)

**PR3 — Move commons lib + docs into `plugins/commons/`; cut over canonical source**

- Move `cli/lib/*.ts` (~13 files) into `plugins/commons/cli/lib/*.ts`. The
  commons copy is now the authoritative source.
- Move `docs/AGENT-CONVENTIONS.md`, `docs/LOOM-CONVENTIONS.md`,
  `docs/PANEL-COMPOSITION.md`, `docs/SUBSTRATE-COMPOSITIONS.md` into
  `plugins/commons/docs/`.
- Rewrite `scripts/sync-shared.ts`: drop the root→plugin mirror for
  `cli/lib/` and for the to-be-deleted root `docs/`; the new commons→consumer
  flow becomes the only path for these.
- Run sync so all consumer plugin trees pick up `cli/lib/` and `docs/` from
  commons. Per-plugin `cli/lib/` and `docs/` copies are still synced
  (RESEARCH.md § 3 + Q3 of the interview — sync-into-every-plugin won out
  over cross-plugin-resolution).
- Update the AGENT-CONVENTIONS.md § "Marketplace-rooted doc paths" claim at
  `docs/AGENT-CONVENTIONS.md:78-91` (now at `plugins/commons/docs/...`) to
  describe the new shape accurately: "docs/X.md resolves to the consumer
  plugin's own synced copy of plugins/commons/docs/X.md."
- Keep root `cli/lib/` and root `docs/` directories during this PR as
  copies to avoid breaking the canonical edit-time pattern that still
  drives PR4. (Phase 3 deletes them.)

Verification: `npm test`; every skill citation of `docs/X.md` resolves
locally in every consumer plugin tree (a new `plugins/commons/cli/docs-
resolution.test.ts` that walks each consumer's `docs/` and asserts every
referenced doc file exists is the concrete check — write it if not
already covered by the existing sync drift check).

**PR4 — Dissolve canonical root for content (skills, agents, per-plugin CLI)**

- Stop syncing `skills/<skill>/` → `plugins/<plugin>/skills/<skill>/`. Each
  plugin's existing `plugins/<plugin>/skills/<skill>/` tree becomes the
  authoritative source. Same for agents and per-plugin CLI:
  `cli/<plugin>.ts` and `cli/verbs/<plugin>/` are no longer mirrored from
  root; the per-plugin copy is authoritative.
- Rewrite `scripts/sync-shared.ts` to drop the root→plugin mirroring for
  skills, agents, and per-plugin CLI. The script now only handles
  commons→consumer for `cli/lib/` and `docs/`.
- Update `cli/sync-shared.test.ts` to reflect the new (much smaller)
  contract.
- Add a tripwire test that asserts root `skills/`, `agents/`, `cli/<plugin>.ts`,
  `cli/verbs/<plugin>/` are *not* the authoritative source (e.g., a manifest
  invariant test) — protects against accidental drift back to the old shape.
- Update `README.md:97-126` "What's inside" section to describe the new
  topology.
- Update `cli/skill-bodies-call-bare-commands.test.ts` if it walks the root
  `skills/` tree (probably; rewire to walk `plugins/<plugin>/skills/`).
- Update `cli/parallel-work-invariant.test.ts` registry references at lines
  96-101 if they point at root paths.

Verification: `npm test`; sync drift check passes (no spurious files in
the new sync's output); the tripwire test fires when root `skills/` is
re-introduced.

**PR5 — Migrate `grill-me` + `find-skills` into `plugins/commons/skills/`**

- Copy `~/.claude/skills/grill-me/SKILL.md` (the 11-line skill body cited
  in RESEARCH.md § 7) into `plugins/commons/skills/grill-me/SKILL.md`.
- Copy `~/.claude/skills/find-skills/SKILL.md` into
  `plugins/commons/skills/find-skills/SKILL.md`.
- Update `scripts/sync-shared.ts:PLUGIN_CONTENT_RULES` for shared to
  declare ownership of `grill-me` and `find-skills`. (The skills live
  directly in `plugins/commons/skills/`; no root sync since canonical root
  is gone.)
- Delete the `feedback_vscode_remote_ssh_split_session.md`-adjacent
  memory note about grill-me being a user-global (or update it to say
  "now bundled in the commons plugin via the marketplace cascade"). Out
  of repo (lives in `~/.claude/projects/...memory`); flag in the PR
  description.
- Verify `loom-plan`, `loom-revise-plan`, `loom-research` skill citations
  to `/grill-me` now resolve (RESEARCH.md § 7).

Verification: `npm test`; manually invoke `/grill-me` on a fresh
`agent-loop-full` install (cascading commons in) and confirm it resolves.

**PR6 — Draft restructure**

This is the biggest single-PR file-touch but mechanically uniform per
RESEARCH.md § 1.

- **Module dissolution**:
  - Merge `plugins/commons/cli/lib/draft-project.ts` into
    `plugins/commons/cli/lib/project.ts`. Both filter functions
    (`findByPlan`, `findByManifest`) end up exposed from `project.ts`.
    The duplicated `SLUG_RE` / `DATELESS_RE` regexes collapse into the
    single set already in `project.ts`.
  - Rename `plugins/commons/cli/lib/draft-git.ts` to
    `plugins/commons/cli/lib/git.ts` (the only git wrapper in the repo;
    "draft" prefix is misleading).
  - Merge `plugins/commons/cli/lib/draft-project.test.ts` into
    `plugins/commons/cli/lib/project.test.ts`.

- **Import sweep** (RESEARCH.md § 1):
  - `plugins/loom/cli/verbs/loom/plan.ts:12-13` — update imports
  - `plugins/loom/cli/verbs/loom/research.ts:6` — update
  - `plugins/loom/cli/verbs/loom/project.ts:29` — update
  - `plugins/loom/cli/verbs/loom/plan.test.ts:13` — update
  - `plugins/loom/cli/verbs/loom/research.test.ts:13` — update
  - Any other `from './lib/draft-*'` import — grep -r and sweep.

- **Doctext / comment sweep**:
  - The module-level commentary in the old `draft-project.ts:6-13` and
    `draft-git.ts:4-9` is rewritten or dropped (it described loom + draft
    as paired halves of one project, which is no longer the architecture).
  - `cli/verbs/loom/project.ts:23-29` — drop "when they lived under the
    draft surface" comment.
  - `cli/verbs/loom/plan.test.ts:53,70,111,143` — rename test names that
    say "draft files" to "PLAN-and-INTERVIEW files" or similar.

- **DraftCliContext type**: verify whether the type still exists in any
  module; if so, rename to `LoomPlanContext` or fold into existing
  `LoomCliContext`-style types. Update all referenced usages.

- **Defer to PR11**: the broader prose sweeps in package.json keywords,
  README.md, projects/CONVENTIONS.md, the dead `/draft-revise` reference
  in `plugins/ev/skills/ev-loop-confidence/SKILL.md:25-28`, and the bogus
  `LOOM-CONVENTIONS § Pairing with draft` cite at `cli/lib/project.ts:148-151`
  — those land in the final cleanup PR for a single satisfying "draft is
  gone" diff.

Verification: `npm test` (the loom plan and research tests must still
pass with the dissolved modules); grep `from.*draft-` returns no hits
in any plugin's `cli/` tree.

**PR7 — Migrate `learnings/` through griot capture pipeline**

- Inside the marketplace repo:
  - Run `bin/griot init` (idempotent; per RESEARCH.md § 4 the directory
    name `learnings/` already exists at root but the structure isn't
    the consumer-side shape `griot init` produces).
  - For each of the 4 notes (`bulk-transforms.md`,
    `check-version-before-config.md`, `generator-antagonist-pattern.md`,
    `verify-dependency-usage.md`), invoke `bin/griot capture` with the
    note content and appropriate metadata. Each becomes a session-note
    capture in `learnings/session-notes/<date>-<slug>/`.
  - Run `bin/griot compact` (or the `/griot-compact` skill via Claude
    Code) to produce a real `learnings/rollup.json`.
- Delete the 4 original root markdown files (`learnings/bulk-transforms.md`
  etc.) — they've been absorbed into the structured pipeline.
- The marketplace's own `bin/griot use --as=llm` invocations now surface
  the seed corpus (verified by running `bin/griot use --as=llm` in this
  repo and confirming the 4 learning titles appear).
- Update `cli/verbs/griot/init.ts:15,76` if anything needs to be different
  about how this repo's already-initialized `learnings/` directory is
  treated (probably no change; init is already idempotent).

Verification: `bin/griot use --as=llm` returns non-empty rollup with all
4 captured learnings; `learnings/rollup.json` exists and is well-formed
JSON.

### Phase 3 — Cleanup (close the loop, 4 PRs)

**PR8 — Fold `plugins/review-skill/` into `plugins/commons/`**

- Move `plugins/review-skill/skills/review-skill/SKILL.md` into
  `plugins/commons/skills/review-skill/SKILL.md`.
- Delete `plugins/review-skill/` directory entirely.
- Update `.claude-plugin/marketplace.json`:
  - Remove `review-skill` as a top-level plugin entry.
  - Remove `review-skill` from `agent-loop-full`'s dependency cascade
    (commons already in there per PR1).
- Update `cli/marketplace-manifest.test.ts:53-60,201-209` to assert
  commons owns review-skill and that review-skill is no longer a
  standalone plugin.
- Update `scripts/sync-shared.ts:PLUGIN_CONTENT_RULES`: drop the
  review-skill entry (lines 90-94 currently); commons now owns
  `review-skill` along with `grill-me` and `find-skills`.
- Update `README.md` plugin table (line 13-22).

Verification: `npm test`; install `agent-loop-full@krambuhl` on a fresh
machine — `/review-skill` invocation resolves via commons rather than the
old standalone plugin.

**PR9 — Delete canonical root directories**

The first of two close-the-loop deletion PRs. Per the user's three-phase
pattern preference: "a small and satisfying close-the-loop PR."

This PR handles the substrate-level deletion (Q7 — dissolve canonical-at-
root layer). PR10 handles the separate dev-loop shim deletion (Q6b — delete
root `bin/`). Keeping them separate because rolling back the substrate
deletion unwinds Phase 2's net, while rolling back the shim deletion is
trivial; they answer different interview questions and warrant independent
PR boundaries.

- Delete root directories: `cli/`, `skills/`, `agents/`, `docs/`. After
  PR3-PR4 these are dead weight; this PR completes the dissolution.
- Any test that walked root `cli/`, `skills/`, `agents/`, `docs/` paths
  — already rewired in PR3-PR4, verify here.
- Update README.md to reflect the deletion if any references survived
  PR4's earlier edit.

Verification: `npm test`; `find . -maxdepth 1 -type d \( -name 'cli' -o
-name 'skills' -o -name 'agents' -o -name 'docs' \)` returns nothing;
the marketplace works end-to-end (install agent-loop-full on a fresh
machine, run a `/loom-plan` flow, confirm every reference resolves).

**PR10 — Delete root `bin/` shims + install-sh tripwire**

The second close-the-loop deletion. Independent of PR9 (Q6b decision,
not Q7), shipped separately so the substrate-level dissolution and the
dev-loop ergonomic deletion don't conflate.

- Delete root `bin/` shims (`bin/loom`, `bin/guild`, `bin/griot`) entirely
  — they're gitignored already (`.gitignore:1-6`), but deleting them from
  disk completes the removal. Developers run `node plugins/<plugin>/cli/<cli>.ts`
  for dev-loop testing, or install the plugin and use its bin.
- Remove the no-longer-needed `cli/no-install-sh-refs.test.ts` tripwire
  (the install.sh era is over twice — once when install.sh was deleted in
  W9 of marketplace-portable-install, and now when the dev shims themselves
  go away). (Note: the test file path itself moves with PR3 into the
  `plugins/commons/cli/` tree; this PR removes it from wherever it ended
  up post-shift.)
- Update `.gitignore:1-6` to drop the entry for `/bin/` (it's no longer
  needed).

Verification: `npm test`; `find . -maxdepth 1 -type d -name 'bin'`
returns nothing; `git grep -n 'install\.sh'` returns no live hits
outside `projects/archive/`.

**PR11 — Final sweep: prose, README, package.json, dead references**

- `package.json:4` — description "Marketplace for the draft/guild/griot/loom
  agent framework" → drop "draft".
- `package.json:16` — keyword `"draft"` removal.
- `projects/CONVENTIONS.md:3,68,88` — sweep "draft" prose; rename
  `draft revise` to `loom revise-plan` (RESEARCH.md § 1).
- `plugins/ev/skills/ev-loop-confidence/SKILL.md:25-28` — fix the dead
  `/draft-revise` skill cross-reference (the skill that never shipped
  under that name; replace with `/loom-revise-plan` or drop the example
  entirely since the surrounding sentence is about composition limits,
  not the specific command).
- `plugins/guild/agents/whiteboard-sketch-ideation.md:88` — "the loom/draft
  CLIs, scripts" → "the loom CLI".
- **Fix the bogus LOOM-CONVENTIONS cite at `cli/lib/project.ts:148-151`**
  (moved to PR11 from earlier draft of PR3 — it's a drift item, not part
  of the canonical move). The comment references `LOOM-CONVENTIONS.md §
  Pairing with draft` which does not exist (RESEARCH.md § 1 + § 13). Drop
  the bogus cite or replace with an honest section reference.
- `README.md` "What's inside" table (line 97-126) — final pass to reflect
  the new topology, post-dissolution.
- Any remaining grep hits for `from.*draft-`, `draft revise`, `Draft `
  outside of `cli/verbs/griot/capture.ts:208,212,262` (those are
  content drafts — "Learning draft" headers, not the legacy CLI;
  RESEARCH.md § 1 confirmed). Tag those lines with a comment to
  prevent future grep confusion.

Verification: `npm test`; `grep -rn 'draft' --include='*.ts' --include='*.md'
plugins/ projects/CONVENTIONS.md README.md package.json` returns only the
expected content-draft hits in `griot/cli/verbs/griot/capture.ts`.

## Dependencies

```
PR1 (commons skeleton)
   ↓
PR2 (sync extension)
   ↓
PR3 (move lib + docs into commons)
   ↓
PR4 (dissolve canonical root for content)
   ↓
PR5 (grill-me + find-skills into commons)
   ↓
PR6 (draft restructure)
   ↓
PR7 (learnings → griot pipeline)
   ↓
PR8 (fold review-skill into commons)
   ↓
PR9 (delete canonical root directories)
   ↓
PR10 (delete root bin/ + install-sh tripwire)
   ↓
PR11 (prose sweep)
```

Strict serial per the interview's Q8 answer. The chain is reviewable
incrementally; any single PR can be reverted without unwinding the rest
(PRs upstream of it stay; downstream PRs simply don't apply yet).

PR9 and PR10 are intentionally split rather than bundled: PR9 is the
substrate-level canonical-root dissolution (Q7), PR10 is the dev-loop
shim deletion (Q6b). They answer different interview questions and have
different rollback profiles — PR10 is trivially reversible, PR9 unwinds
Phase 2's net.

The two PRs that *could* run in parallel (PR6 draft restructure and PR7
learnings migration are independent of PR3-PR5 in principle) were
intentionally serialized to keep the dev-loop tractable for review.

## Verification

Every PR's verification block above. Cross-cutting invariants checked
continuously:

- `npm test` passes — covers `sync-shared.test.ts`, `marketplace-manifest.test.ts`,
  `parallel-work-invariant.test.ts`, `plugin-bin-shims.test.ts`,
  `skill-bodies-call-bare-commands.test.ts`, `no-install-sh-refs.test.ts`
  (until PR9 removes it), plus per-plugin tests.
- `node scripts/sync-shared.ts --check` passes — drift detection.
- After PR3-PR11 in particular: install `agent-loop-full@krambuhl --scope user`
  on a clean directory, run a sample `/loom-plan` flow with a synthetic
  topic, confirm:
  - `grill-me` invocation resolves (PR5)
  - `docs/AGENT-CONVENTIONS.md` resolves locally to each consumer plugin's
    synced copy (PR3)
  - `/review-skill` resolves via commons (PR8)
  - `/draft-*` invocations are no-ops or 404s (no dead references — PR6 +
    PR11 sweep)
  - root `bin/<cli>` shims absent (PR10)
  - root `cli/`, `skills/`, `agents/`, `docs/` absent (PR9)

## Risks

**R1 — Marketplace cascade subtlety in PR1**

Claude Code plugin dependency cascades are verified by the manifest test
(`cli/marketplace-manifest.test.ts:201-209`) but not by a fresh-machine
smoke test. Adding commons to the cascade introduces a sixth plugin in
the install chain; if any consumer cascades in the wrong order on a
fresh install, skills may not resolve correctly until a second install
pass. Mitigation: explicitly run the V4-style smoke test that
RESEARCH.md § 9 cites — install agent-loop-full on a clean machine,
verify all 6 plugins resolve their skills.

**R2 — PR3 cuts canonical mid-flight; dev-loop drift**

Between PR3 (canonical shift) and PR4 (dissolution of root for skills/agents
/per-plugin CLI), the repo has a mixed shape: some content is authoritative
in `plugins/commons/`, the rest is still root-canonical. Devs editing during
this window need to know which is which. Mitigation: the PR3 description
should explicitly call out "DO NOT edit root `cli/lib/` or root `docs/`
after this PR lands — edit `plugins/commons/`." A README note added in PR3
and removed in PR9 (when the root directories themselves are deleted).

**R3 — PR6 (draft restructure) is the biggest file-touch in the bulk phase**

~10+ files modified (imports, doctext, tests). Mechanically uniform, but
the volume invites accidental import-typo regressions. Mitigation: agent-
driven sweep with explicit before/after grep verification; tests must
pass at green before the PR opens.

**R4 — `learnings/` migration (PR7) depends on `bin/griot capture` ergonomics**

The pipeline expects interactive sessions; bulk-importing 4 existing notes
as captures may need a non-interactive flag or a workaround. Mitigation:
before PR7, run a single test capture to validate the flow. If `griot capture`
doesn't support non-interactive injection, a tiny scripting wrapper sits
inside the PR (write the session-notes directories directly, generate the
expected meta.json, then run `griot compact`).

**R5 — Memory feedback note inconsistency post-PR5**

The user's memory note `feedback_vscode_remote_ssh_split_session.md`
adjacent context (about grill-me being a user-global) becomes stale
after PR5. Not a code risk; flagging because the user's CLAUDE.md
asks for memory hygiene. Mitigation: update the memory file as part
of PR5's PR description checklist.

**R6 — The "what's deferred" trap**

Two RESEARCH.md items were classified as out-of-scope (per-plugin lib trim
and plugin.json description dedup). If they're never picked up, they
linger as small relics. Mitigation: add a note in the post-cleanup retro
(after PR11) calling them out as candidates for a future "house cleaning"
project.

## Open questions

None remaining as of plan synthesis. All interview branches resolved
(see `INTERVIEW.md`).

The previously-open "does Claude Code's plugin loader resolve cross-plugin
`docs/X.md`?" question (RESEARCH.md § Q1) was sidestepped by the dissolution
commitment plus per-consumer doc sync. The previously-open "where does
`scripts/` belong?" question was resolved by the user's preference to
keep `scripts/` rather than fold sync-shared.ts into `cli/`.

## Decisions

Resolved during the interview (full transcript in `INTERVIEW.md`):

1. **Commons plugin scope**: maximal — `grill-me`, `review-skill`,
   `find-skills`, `docs/`, `cli/lib/` (after canonical-shift). `moshi-best-practices`
   stays a user-global; `claude-code-guide` is out of scope. Named
   `commons` per the design-systems whiteboard finding (the original
   working name "shared" was literal-not-semantic; `commons` carries the
   "shared infrastructure that belongs to no one" semantic and reads
   honestly when content-empty on day 1).

2. **Docs delivery mechanism**: sync `docs/` into every consumer plugin that
   references docs (RESEARCH.md § 3 + Q1 option A). No cross-plugin loader
   resolution required.

3. **Draft cleanup approach**: full restructure (modules dissolve into
   loom-owned shapes; RESEARCH.md § 1). "Draft" exits the codebase
   except where it means "rough content" in griot capture headers.

4. **`learnings/` fate**: migrate through griot capture pipeline; produce
   real `rollup.json`. Eat own dog food (RESEARCH.md § 4 option C).

5. **`scripts/` location**: keep at root as the maintenance-script namespace.
   Don't fold `sync-shared.ts` into `cli/`.

6. **Root `bin/` shims**: delete entirely; developers use plugin-installed
   bin shims or `node plugins/<plugin>/cli/<cli>.ts` for dev-loop testing.

7. **Canonical-at-root layer**: dissolve. `cli/`, `skills/`, `agents/`, `docs/`
   at root all go away. Each plugin is self-contained for its own content;
   only `cli/lib/` + `docs/` (cross-cutting) flow from `plugins/commons/`
   into consumer plugins via the shrunk `sync-shared.ts`. This is the
   defining commitment.

8. **PR sequencing**: strict serial, lowest-risk first. PR1 → PR2 → … → PR11.
   No parallel waves in the bulk phase despite some PRs being independent
   in principle. The Phase 3 deletions (PR9 substrate-level canonical-root
   dissolution and PR10 dev-loop shim deletion) are intentionally split
   rather than bundled because they answer different interview questions
   (Q7 vs Q6b) and have asymmetric rollback profiles.
