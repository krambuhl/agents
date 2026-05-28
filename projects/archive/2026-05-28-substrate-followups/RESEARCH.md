# Substrate-followups research

Research foundation for substrate-followups — the tactical cleanup
carried over from the just-archived substrate-consolidation project.
The parent retro (`projects/archive/2026-05-26-substrate-consolidation/retros/project.json`)
recorded 5 follow-ups; this dossier covers the 4 that remain
unresolved. The 5th (PR cadence) is resolved by in-flight PR #100
landing `.plan → main`.

## Foundation

The parent project collapsed 6 fork plugin families into the canonical
loom/guild/ev plugins via a harvest-first / delete-last sequence across
7 phases (PRs #68–#99). The follow-ups below are the loose ends that
didn't fit the parent project's scope: either substrate-shape questions
deferred for clarity, or one-shot verification steps that gate on
post-install state. Each is independently shippable and the 4 share no
hard dependencies on each other.

References (every claim below cites one of these or a directly named code
location):

- Parent retro: `projects/archive/2026-05-26-substrate-consolidation/retros/project.json` (the `follow-up` category enumerates these 4 items verbatim).
- Parent PLAN.md: `projects/archive/2026-05-26-substrate-consolidation/PLAN.md`.
- Substrate-consolidation integration PR: #100 (`.plan → main`).
- AGENT-CODEGEN.md: `plugins/guild/docs/AGENT-CODEGEN.md` § Live-spawn smoke.
- Related memories: [[loom-doctor-exit-zero-on-unreadable]], [[genericize-on-deletion]].

## Follow-up #1 — 3-copy doc redundancy

### Current state

`plugins/{ev,guild,loom}/docs/` each ship their own copy of
`SUBSTRATE-COMPOSITIONS.md` and `LOOM-CONVENTIONS.md`. As of PR #96
all 6 copies are byte-identical (md5: `SUBSTRATE-COMPOSITIONS` =
`b7a8aecb...`, `LOOM-CONVENTIONS` = `f989a7b6...`). Citation footprint:

```
plugins/ev/docs/SUBSTRATE-COMPOSITIONS.md    (cited by ev skills)
plugins/loom/docs/SUBSTRATE-COMPOSITIONS.md  (cited by loom-plan / -research / -revise-plan / -archive)
plugins/guild/docs/SUBSTRATE-COMPOSITIONS.md (not cited by any skill)
plugins/ev/docs/LOOM-CONVENTIONS.md          (cited by ev skills)
plugins/loom/docs/LOOM-CONVENTIONS.md        (cited by loom-archive)
plugins/guild/docs/LOOM-CONVENTIONS.md       (not cited by any skill)
```

### The gap

The 3-copy model has no propagation mechanism. Each plugin ships its
own copy; edits to one must be hand-replicated to the other two. The
parent project's Phase 6 U1 surfaced the proof-by-existence: guild's
`LOOM-CONVENTIONS.md` had silently drifted from ev/loom's by U1
(carried `pr-opened`/`pr-updated`/`pr-merged` event-table rows that
commit-discipline (d) had retired in ev/loom). The drift went
undetected until Phase 6 U7 (PR #96) hashed all 3 copies in audit.

Without a structural fix, the next drift is just a matter of time —
whoever next edits one of these docs has to remember to update the
other two. The convention has no enforcement seam.

### Candidate approaches (named in the parent retro)

**(a) Canonical location + build-time copy at install.** One source
file at repo root (or in a designated "shared docs" plugin); each
plugin's `claude plugin install` step copies it into the plugin's
`docs/` at install-time. Trade-off: requires substrate to add an
install-time build step (not currently a thing). Cost: medium;
introduces new install-time machinery.

**(b) Symlinks in source / files at install.** One physical file +
symlinks from the other 2 plugins' `docs/` trees; the install
pipeline resolves symlinks to file content at install. Trade-off:
git tracks symlinks fine; install-time resolution may already be
supported (`claude plugin install` semantics need verification). Cost:
low if install supports symlinks; medium if it doesn't.

**(c) One-plugin-owns each doc + cross-plugin references.** loom owns
`LOOM-CONVENTIONS.md`; one plugin (ev or guild) owns
`SUBSTRATE-COMPOSITIONS.md`. Other plugins reference by cross-plugin
path (e.g. `plugins/loom/docs/LOOM-CONVENTIONS.md`) rather than ship
a local copy. Trade-off: clean owner model but cross-plugin paths are
brittle if the marketplace install layout changes. Cost: low; deletes
redundant copies + updates link targets.

**(d) CI hash check.** Keep all 3 copies; add a CI test that hashes
them and fails if they diverge. Trade-off: preserves per-plugin
"everything bundled" convenience but turns "remember to update all 3"
into a loud CI failure rather than silent drift. Cost: very low; one
small test file + a sync script.

### Recommendation

**Option (d) — CI hash check, ship first.** Lowest cost, highest
immediate value: turns silent drift into loud test failure with zero
install-time machinery. Doesn't preclude (a), (b), or (c) later if a
deeper substrate fix becomes attractive.

Options (a) and (b) require substrate build infrastructure that
doesn't currently exist; both are bigger questions than this
follow-up should bite off. Option (c) is appealing on "single owner"
grounds but cross-plugin-path brittleness is a real risk in
marketplace-install contexts.

### Risks

- The CI test needs a "first edit" workflow: when a contributor edits
  one copy intentionally and forgets the others, CI fails — that's
  the point. The test should print divergent files + a one-line "run
  `<sync-script>` to fix" message. Substrate needs the sync script.
- An early-test of the chosen mechanism on a toy change (touch one
  doc; see what happens) before declaring done.

## Follow-up #2 — `loom doctor` exit-code semantics

### Current state

`plugins/loom/cli/verbs/loom/doctor.ts:105-106` returns
`{ stdout: emit(report, pretty), exitCode: 0 }` **unconditionally** —
exit 0 regardless of `report.ok`. The verb reports
`manifest-unreadable` (and similar codes) as `ok:false` entries in
the JSON `issues[]`, but the process exits 0.

The ev preflight tier-2 added in PR #95 uses a stdout grep as
workaround:

```
loom doctor <slug> 2>/dev/null | grep -q '"ok":true' || <fallback>
```

This is keyed on the success-shape in stdout, not the exit code.

### The gap

A health-check verb that exits 0 even when the project is unhealthy
is an awkward contract for shell consumers: `||` doesn't work as
expected. The grep workaround is robust but more verbose than a clean
exit-code-based gate.

### Candidate approaches

**(a) Flip the default: exit non-zero on `ok:false`.** Single source
change at `doctor.ts:105-106`: replace `exitCode: 0` with
`exitCode: report.ok ? 0 : 1`. Test updates: `doctor.test.ts` adds
assertions for `exitCode === 1` on the unreadable + missing cases.
Consumer update: PR #95's ev preflight tier-2 simplifies to
`loom doctor <slug> 2>/dev/null || <fallback>` (drop the grep).

**(b) Add a `--fail-on-issues` flag.** Preserves the exit-0-by-default
contract; opt-in to non-zero-on-unhealthy via flag. Consumer update:
ev preflight uses `loom doctor <slug> --fail-on-issues 2>/dev/null ||
<fallback>`. Less aggressive change; preserves backward compatibility
for any consumer relying on exit-0.

### Recommendation

**Option (a) — flip the default.** The exit-0 contract is awkward;
no known consumer relies on it (the ev preflight is the only known
shell consumer today, and it uses the grep workaround). The
backward-compat concern of (b) is theoretical, not load-bearing.

### Risks

- A consumer somewhere may rely on `loom doctor` always exiting 0.
  If discovered, that consumer can be updated to handle non-zero.
  Risk is low: the verb is new (Phase 2 of parent project,
  post-cutover) and the only known shell consumer (the ev preflight)
  is updated in the same PR set.
- The change touches `doctor.ts` AND `doctor.test.ts` AND the ev
  preflight prose at three SKILL.md files. Multi-file but each piece
  is small.

## Follow-up #3 — Live-spawn smoke for renamed generated guild agents

### Current state

Phase 7 U1 (PR #97) renamed several guild agents during the codegen
cutover:

- `evaluator-react-api` → `evaluator-react`
- `whiteboard-react-architect` → `whiteboard-react`
- `whiteboard-substrate-engineer` → `whiteboard-substrate`
- `whiteboard-testing-strategy` → split into `whiteboard-test-unit` +
  `whiteboard-test-integration`
- Plus 11 newly-generated `whiteboard-*` from the 3-axis source.

The renames are reflected in source (`plugins/guild/agents/*.md`) and
in callers (PRs #97 + #98 swept cross-references). What's NOT yet
verified: that Claude Code actually dispatches these renamed agents
correctly after a fresh `claude plugin update` of the guild plugin.

The Phase 5 U4 deletion-ledger asserted tool-set equivalence between
baked + generated; the Phase 5 `generated-panel.test.ts` asserts the
committed generated files match a fresh regen. Both are CI checks.
What's missing: a real-LLM dispatch confirming a renamed agent returns
a conformant verdict.

### The gap

CI can't dispatch a real LLM. Renamed agents could be perfectly shaped
(correct frontmatter, correct domain content, correct tool grants)
and still fail at dispatch if Claude Code's subagent registry doesn't
pick up the new names or if some caller still references an old name.

This is a one-shot verification, not an ongoing regression guard.

### Candidate approaches

The verification is well-specified in `plugins/guild/docs/AGENT-CODEGEN.md`
§ Live-spawn smoke (rewritten in PR #97):

> 1. In a session, `Agent`-dispatch one generated reviewer (e.g.
>    `evaluator-a11y`) and one generated planner (e.g.
>    `whiteboard-react`) against a tiny known-bad sample diff.
> 2. Confirm a real `VERDICT:` comes back through `guild
>    parse-and-aggregate` (not just a parse check) — the line-anchored
>    `VERDICT:` regex is the gotcha to mind.

Two execution shapes:

**(a) Document-only checklist.** Write a SMOKE.md (or section under
AGENT-CODEGEN.md) that an operator runs once post-install. No
automation. Cost: very low; just prose.

**(b) Smoke-test script + skill.** Ship a shell script (or a small
operator-invoked skill) that runs the dispatch + verifies. Cost: low;
doesn't automate the LLM dispatch (that requires a session) but
standardizes inputs + the assertion shape.

### Recommendation

**Option (a) — document-only checklist.** Live-spawn smoke is an
operator action (it requires a real Claude Code session), not a
CI/scripted check. A clear checklist + a "run this once after the
guild plugin re-installs" footnote is the right shape. Partially
documented in AGENT-CODEGEN.md already; this unit completes the
checklist + adds an "I ran this on YYYY-MM-DD and got VERDICT: X"
log location.

### Risks

- The smoke could pass cleanly and still miss a subtler failure mode
  (e.g. a domain-specific evaluator finding a real antipattern in a
  different kind of artifact than the sample diff). The smoke is a
  proof-of-life, not a proof-of-correctness.
- The verification log location (where the operator records "I ran
  this on date X, got VERDICT Y") needs a home. Suggestion: a
  short-lived `learnings/session-notes/<date>-guild-smoke.md` so it
  travels with the substrate corpus.

## Follow-up #4 — L332 orphan path

### Current state

`plugins/loom/cli/verbs/loom/pr.ts:364`:

```
const responsesDir = join(projectPath, 'checkins', parsed.branch, 'responses');
mkdirSync(responsesDir, { recursive: true });
```

`loom pr respond` writes PR-comment response markdowns to
`projects/<slug>/checkins/<branch>/responses/<id>.md`. The
`checkins/` directory was eliminated as a state directory in Phase 2
of substrate-consolidation (consolidated into `manifest.toml`'s
`[[checkins]]` section), but this one `mkdirSync` still creates it
on-demand for PR responses.

The path is the only pre-M1 vestige left on disk for active projects.

### The gap

Two layers of weirdness:

1. **Aesthetic / semantic**: `checkins/` no longer means "where checkins
   live" (those are in `manifest.toml` now). Creating a directory
   called `checkins/` whose only contents are PR responses is
   misleading to future readers.

2. **Discoverability**: `LOOM-CONVENTIONS.md` § Project layout
   already calls this out as "the only residual of the pre-M1
   per-file state model." Removing the residual closes the loop on
   the M1 consolidation.

### Candidate approaches

**(a) Relocate to `responses/<branch>/<id>.md`.** The `checkins/`
directory disappears entirely from active projects. Change at
`pr.ts:364` is a one-line path swap. Existing on-disk response files
in this repo's `projects/`: zero (verified during parent project's
Phase 7 U2 audit via `find projects -maxdepth 3 -type d -name
responses`), so no migration needed locally.

**(b) Fold into `manifest.toml [[responses]]`.** Like checkins /
sessions / etc., responses become an array-of-table section in the
manifest. Response shape: `{ branch, comment_id, body (or body_file),
created }`. Trade-off: fully consolidates state into one file but
makes inline-table encoding of `body` markdown awkward — markdown
often has `=` or `#` characters; the TOML parser supports them via
escape mechanism, but the resulting inline-table prose for a long
response would be hard to read in manifest.toml. Readability for
long markdown values is poor.

### Recommendation

**Option (a) — relocate to `responses/<branch>/<id>.md`.** Cleanest
substrate shape: `checkins/` disappears entirely, responses live in
their own dir, the manifest stays focused on machine state. Markdown
content stays on disk where it reads naturally.

Option (b) is conceptually consistent ("everything in manifest.toml")
but markdown-in-inline-table awkwardness is a real cost without a
matching benefit.

### Risks

- A small chance some downstream project has on-disk responses at the
  old path. Mitigation: the change can ALSO scan
  `checkins/*/responses/` on read and migrate to the new location on
  first encounter. Given response files are rare (this repo has
  zero), ignoring legacy is reasonable. Recommendation: ignore
  legacy; document the migration in the PR body; move on.
- `LOOM-CONVENTIONS.md` § Project layout needs to drop the
  `checkins/` directory tree entirely. Small prose update — already
  half-acknowledged by the existing footnote.

## Cross-cutting

The 4 follow-ups span three plugins (loom × 3, guild × 1) and don't
share dependencies. Each is independently shippable; ordering is
flexibility-driven, not dependency-driven.

Suggested ordering by cost (smallest first): #2 `loom doctor`
exit-code → #1d CI hash check → #4 L332 relocation → #3 smoke
checklist. Could be interleaved as operator prefers.

The doc-redundancy fix (#1d) and the doctor exit-code fix (#2)
together would let a future substrate consumer write cleaner shell
preflights without any of the current workarounds.

## Out of scope

- **PR cadence** (5th retro follow-up): resolved by in-flight PR #100
  (`.plan → main`).
- **Substrate install-time tooling** (would enable doc-dedup options
  (a)/(b)): bigger substrate-shape question; not addressed here.
- **Generator class re-introduction**: Phase 7 U1 dropped the
  `generator-*` class entirely. Re-introducing it is a future
  question outside this project's scope.
- **`/loom-research` Agent registration**: the parent /loom-plan
  skill body expects to auto-spawn `/loom-research` as a fresh-context
  Agent subagent_type, but no such subagent is registered and the
  `/loom-research` skill carries `disable-model-invocation: true`. A
  real substrate gap, but a substrate-shape question worth its own
  project — not bundled here.
