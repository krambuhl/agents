# RESEARCH-NOTES: Marketplace portable install

This file is the raw running record of the research session: the
interview transcript, the shift detection event, and a pointer to
the per-engineer whiteboard contributions. The synthesized dossier
is `RESEARCH.md` in the same project directory.

## Session metadata

- Date: 2026-05-18
- Skill: `/loom-research`
- Mode: human-paired (not `--mode=auto`)
- Whiteboard rounds: 1
- Shifts: 1 (single shift, the topic was coherent throughout)
- Fact-check pass: see RESEARCH.md § "Open verification tasks"

## Pre-flight observations

- `bin/griot use --as=llm` returned "no rollup yet" — the marketplace
  has no committed rollup at session start.
- `~/.claude/skills/` on the user's machine had stale symlinks dated
  `May 18 01:44`, missing `loom-research`, `loom-plan`, and
  `loom-revise-plan` — the install.sh symlink farm hadn't been
  re-run since these skills were added. This is itself an observable
  for the research topic: the install pipeline drifts silently.
- The Skill tool's registered-skills list did not contain
  `loom-research`, so the skill could not be dispatched via Skill;
  the session executed the skill's process manually by reading
  `skills/loom-research/SKILL.md` and following its steps.

## Interview transcript

### Q1 (framing): Which of seven install gaps is the real itch?

The session opened with seven gaps I had identified in the install
pipeline by reading `install.sh`, the `~/.claude/skills/` symlink
state, and the README. The user's answer reframed the question
entirely:

> "i'm interested most in the framing of making the agent
> skills/cli/agents portable. we also want to keep griot learnings
> in the actual repo, not the agent repo. nothing in particular
> initiated this skill, i have a work environment which I want to
> simply use my personal agent skills because they help the type of
> work we do"

### Shift 1 detected

Both shift signals fired on Q1's answer:

- **Vocabulary delta**: prior 6 messages were about install
  mechanics (symlinks, `~/.agents/`, gh repo clone, npx skills,
  drift). The user's response introduced new content vocabulary
  (portable, work-environment, personal agents, griot-in-repo,
  separation of concerns). Set intersection over set union of
  content words: < 0.6.
- **Stated focus-shift cue**: "i'm interested most in the framing
  of..." — explicit reorientation phrasing.

**Shift 1 topic** (one-sentence summary):

> Portable-by-design framework where the marketplace ships tools,
> and the consumer repo owns its own learnings and context.

Later refined (not a second shift, just narrowing) by user inputs
about `claude plugin` + `settings.local.json` + per-user install:

> Plugin marketplace shape — the marketplace becomes a public
> Claude Code plugin marketplace (skills.sh-compatible), installed
> per-user via `settings.local.json` so colleagues aren't enrolled,
> with griot learnings resolved project-relative.

### Q2: Coupling shape at work?

Walked through four options (clone-and-reference, vendor-into-work-
repo, npm-package-the-framework, per-machine clone + per-project
skill-CLI install). Recommended B+D hybrid. User reframed:

> "i'm defintiely thinking that this repo will become public if
> that simplifies things. I want to be able to install this with
> `claude plugin vis skills.sh or as a settings.local.json
> marketplace. I want to be able to use this without making it
> universal for all my colegues"

This was the refinement that locked the plugin-marketplace shape.
The public-repo decision unblocked everything; the
`settings.local.json` mechanism was the right per-user shape.

### Q3: Granular plugins vs mega-plugin?

Walked through trade-offs. User answered:

1. mega-plugin for sure
2. claude plugin for the mega-kit, skills.sh for the granular-pick
3. CLIs in the agents repo, learnings in the source/project repo

Q3.3 named the architectural question that became the whiteboard's
center: where do CLIs live, where do learnings live, how does
install actually work.

### Whiteboard panel — round 1

Spawned 8 engineers in parallel via `/guild-spawn` (composed from
`/guild-whiteboard`'s skill). Brief at
`projects/2026-05-18-marketplace-portable-install/whiteboards/research-shift-01-cli-residency-and-learnings-location.md`.

In parallel, invoked the `claude-code-guide` Agent to verify the
actual Claude Code plugin/marketplace API before the panel
contributed. Returned authoritative facts (see RESEARCH.md
§ "Verified Claude Code plugin API facts").

Engineer outcomes:

- whiteboard-a11y: recused (with one note on shim error message
  shape).
- whiteboard-design-systems: substantive — naming pressure-test,
  proposed `agents@krambuhl` rename, flagged orphan skills, flagged
  the `~/.agents/docs/` skill-body path issue.
- whiteboard-performance: substantive — measured payload + cold
  start, recommended ship-as-is.
- whiteboard-react-architect: substantive — boundary argument,
  Shape A wins (ship source).
- whiteboard-skeptic: substantive — six edge-case findings; two
  high-impact (PATH ordering, Node version drift).
- whiteboard-sketch-ideation: recused (not sketch territory).
- whiteboard-substrate-engineer: substantive — confirmed invariants
  preserved, surfaced the `bin/loom adopt` naming smell, proposed
  `bin/griot init` for gitignore-amendment.
- whiteboard-testing-strategy: substantive — tiered test plan,
  risk-named.

Round-1 verdict: questions-raised. Resolved via subsequent
interview loop (Q4 series via `AskUserQuestion`).

### Q4 series — multi-choice decisions via AskUserQuestion

After the panel returned with raised questions, the interview
shifted to focused multi-choice questions per user feedback that
prior questions had bundled too many decisions.

**Q4-A: Naming.** Open prose response from user: "A. `agent-loop@krambuhl`"
— diverged from design-systems' proposal (`agents@krambuhl`) but
adopted the same marketplace name and the spirit of the rename
(no stutter, room for future plugins).

**Q4-B: Node version remedy.** Open prose response: "patreon is
on node 24. we can make this a requirements. (a) failure makes
sense" — picked option 1 (shim version check), made Node 24 a
hard requirement.

**Q4-C: CLI bin namespace.** Open prose response: "makes sense"
— picked bare commands, accepted lock-in.

**Q4-D: Learnings root resolution.** First asked as open prose:
"this should be project root (like where package.json exists),
not cwd". Then refined via `AskUserQuestion`:

- Question: What marker should `griot capture` / `griot use` walk
  up to find as the project root?
- User choice: `.git/` directory (Recommended).

**Q4-E: settings.local.json enrollment safety.** Open prose
response: "can't we smoketest this? try running it and failing".
Captured as Phase-0 verification task V1 in RESEARCH.md.

**Q4-F: `loom adopt` meaning.** Open prose question from user:
"what is loom adopt for? like adopting a non loom-research+loom-plan
derived plan.md". Answer: yes, exactly that — `bin/loom project
adopt` is the bridge from "I have a PLAN.md" to "this is a
loom-managed project." The install.sh:154 reference to `bin/loom
adopt` (without `project`) is a typo for `bin/loom project adopt`.
There was no second adopt verb — the brief had introduced a phantom
"framework adopt" concept that dissolved.

**Q4-untether (follow-up via AskUserQuestion):** Build a
`bin/loom project untether` verb to clean up committed bin/ shims?
- User choice: Skip — rm the shims by hand (Recommended).

**Q4-final (procedural via AskUserQuestion):** Ready to compose
dossier and run fact-check?
- User choice: Done — compose dossier + fact-check (Recommended).

### Feedback captured mid-session

User correction on grill-me posture (2026-05-18): "you should be
asking 1 question a time and asking multi-choice questions as you
grill me." Saved to memory at
`~/.claude/projects/-Users-krambuhl-Sites-agents/memory/feedback_grill_me_posture.md`.
Going forward in this session, all decision-point questions used
`AskUserQuestion` with concrete multi-choice options.

## Whiteboard contributions — pointer

Per-engineer verbatim contributions live at
`projects/2026-05-18-marketplace-portable-install/whiteboards/research-shift-01-cli-residency-and-learnings-location.md`,
round 1, ~1500 lines across 8 attributed sections.

This RESEARCH-NOTES.md does not duplicate the verbatim sections;
the whiteboard file is the canonical record. The synthesized
load-bearing signal from each engineer is captured in
RESEARCH.md § "Whiteboard contributions" as one paragraph per
engineer.

## Out-of-band reference work

Invoked `claude-code-guide` Agent in parallel with the whiteboard
panel to verify the Claude Code plugin/marketplace API facts.
Returned authoritative answers grounded in docs at code.claude.com.
Result folded into RESEARCH.md § "Verified Claude Code plugin API
facts" with cited URLs.

## Course-correction late in the session

The user clarified mid-composition that this research dossier is
**input to a separate `/loom-plan` session** that will grill on
still-open questions. This reshaped the dossier from "decisions
taken" into "working directions, to be ratified in plan session"
and surfaced an explicit "Open questions for `/loom-plan` grill-me"
section in RESEARCH.md (PQ1-PQ7).

The Q4-A through Q4-F decisions from this session are preserved as
working directions, not finals. The plan session can revisit any of
them with new information.

## End of session

Ready for fact-check pass via `/guild-validate` with
`evaluator-contract-fit` and an evidence-anchored rubric. After
fact-check, commit via `bin/loom research` and report. The next step
beyond this session is `/loom-plan marketplace-portable-install` (or
similar slug) which consumes this dossier as input.
