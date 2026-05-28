# Research notes — substrate-followups

The standard `/loom-research` playbook (relentless interview +
per-domain whiteboard panels + evaluator fact-check) was bypassed for
this project. The substrate-consolidation retro at
`projects/archive/2026-05-26-substrate-consolidation/retros/project.json`
is the de-facto research foundation: each of the 4 follow-ups has
already been documented with current state, the gap, and candidate
approaches by the parent project's loop discipline (per-PR checkin
`notes_for_pr`).

The RESEARCH.md dossier is a synthesis of:

- The parent retro's `follow-up` findings (4 of the 5 entries; the
  5th — PR cadence — is excluded because PR #100 resolves it).
- Per-unit checkin `notes_for_pr` from the parent project's last
  several PRs, where the substrate-followup candidates were first
  named.
- Direct inspection of the code surfaces named in the retro
  (`pr.ts:364`, `doctor.ts:105-106`, `AGENT-CODEGEN.md`, the
  3 plugin copies of `plugins/*/docs/LOOM-CONVENTIONS.md` +
  `SUBSTRATE-COMPOSITIONS.md`).
- Related memories: `[[loom-doctor-exit-zero-on-unreadable]]`
  (substrate papercut underlying follow-up #2);
  `[[genericize-on-deletion]]` (related lesson from the parent
  project's M4 cleanup).

## Bypass rationale

The auto-spawn path documented in `/loom-plan` (Step 2: spawn
`/loom-research` as a fresh-context `Agent` sub-agent with
`subagent_type=loom-research`) is structurally unreachable in this
Claude Code environment: there's no `loom-research` Agent registered,
and `/loom-research`'s skill file (`plugins/loom/skills/loom-research/SKILL.md`)
carries `disable-model-invocation: true`. Both the Agent-tool and
Skill-tool paths are blocked.

Operator chose, after surfacing the gap, to have Claude author
RESEARCH.md directly using the parent retro as the foundation, in
the parent `/loom-plan` session. The substrate gap itself is
recorded in RESEARCH.md § Out of scope as a candidate for a future
substrate-shape follow-up project.

## Domain coverage

- **loom CLI** (follow-ups #2 + #4): `loom doctor` exit-code +
  `pr respond` responses-path. Code/test/prose changes inside
  `plugins/loom/cli/`.
- **substrate-shape / doc-shipping** (follow-up #1): 3-copy doc
  redundancy across all three active plugins' `docs/` trees.
- **guild verification** (follow-up #3): one-shot post-install
  operator action documenting that the renamed agents dispatch
  cleanly. No code change; prose only.

## Open questions left for /loom-plan to resolve

1. **Phase decomposition**: 4 phases (one per follow-up), or fewer
   (group by domain — loom-CLI phase + doc-redundancy phase +
   smoke-doc phase)? RESEARCH.md leans toward 4 phases because the
   follow-ups don't share dependencies and shipping them
   independently is the simplest cadence.
2. **Choice resolution per follow-up**: RESEARCH.md names a
   recommended option for each (1d, 2a, 3a, 4a). The interview can
   override.
3. **Loop strategy**: interactive (units are creative/architectural)
   or confidence (units are mechanical)? Recommendation: interactive,
   matching the parent project; each follow-up has at least one
   judgment call (which option to pick).
4. **PR cadence**: same as parent (per-unit branches into a `.plan`
   integration), or simpler (each follow-up = one PR direct to main
   once #100 lands)? Recommendation: simpler cadence given the
   smaller surface — no integration branch needed; each follow-up
   PRs directly to main.
5. **Ordering**: smallest-first (#2 → #1d → #4 → #3) or
   operator-driven? RESEARCH.md suggests smallest-first to build
   confidence; the interview can re-sequence.

## What's NOT here

This RESEARCH-NOTES.md does NOT carry the per-engineer whiteboard
contributions a standard `/loom-research` run would produce. The
4 follow-ups don't span enough distinct domains to warrant a
whiteboard panel — each is a small, well-bounded question. If the
operator wants whiteboard pressure on any specific follow-up
(particularly #1, which is the only substrate-shape question), it
can be run during the `/loom-plan` interview as a per-phase
whiteboard rather than a project-birth whiteboard.
