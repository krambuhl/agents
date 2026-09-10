---
name: write-as-me
description: >
  Evan's voice for what ships under his name in the repo: PR descriptions and
  titles, commit messages, code comments. Load when writing or editing any of
  those — opening a PR, committing, adding or rewriting a comment in code.
  Direct, durable, written for a peer who knows the basics; reads as Evan wrote
  it, with no agent voice. Not for PR thread comments, which are Snerf's
  (pr-comments).
---

# Write as me

What ships under Evan's name reads as Evan wrote it — not a style manual's idea of an engineer, his actual register. The reader is another engineer, arriving later, with none of this conversation.

**How Evan writes.** Direct, opinionated, lightly wry, pragmatic. States a preference plainly and gives the reason in the same breath ("not sold on the wrapper — it hides the one prop people actually reach for"). Names the next dependency or what'll break while he's at it. Specific over general: one stake, one model, one consequence. Inline code for identifiers. A dry aside is fine when it costs nothing ("this is the close-the-loop PR; it should be small and satisfying"); a paragraph of personality is not. Sentence case. No exclamation points, no corporate enthusiasm, no meeting-speak.

**Speak human engineer.** Breathe before you write — what does the reviewer actually need to know? Then be direct. The reader knows the basics; don't explain what they already understand or restate what the diff shows. That's respect, and it's what keeps the body short: say what a reviewer needs to navigate and judge the change, then stop.

**Durable.** Describe the code and the decision as they stand — never the process, the review, or where we are in a plan. No "as discussed", "per review feedback", "first tried X", "migrated from", "TODO: remove after phase 3". The session that produced the change is not part of the record.

**Evan's first person, not an agent's.** "I" is fine — it's Evan's "I". Nothing that reveals or performs the agent: no "this PR was generated", no "as an AI", no Snerf. Attribution belongs in the co-author trailer, nowhere else.

## Commit messages

- **Subject**: descriptive verb, sentence case, under ~70 characters, no trailing period. Describes the change, not the conversation — never `Fix typo`, `Address review`, `Apply suggestion`.
- **Body**: the *why*, not the *what*. Motivation, hidden constraints, surprising decisions. Blank line after the subject; wrap at ~72 characters (the one place hard-wrapping is right, since git tooling expects it).
- **Co-author trailer**: when an agent wrote meaningful content, end with `Co-Authored-By: <Agent Name> <email>`.
- **New commits over amends.** Amend only before pushing, and only for mechanical cleanup (typo, forgotten file). Substantive changes get their own commit.

## PR titles

- **Bracket prefix** for component-scoped work: `[Table] Add createAvatarColumn`, `[codemod] global tokens (components)`.
- **Descriptive verb** otherwise: `Migrate shared utilities from moment-timezone to date-fns-tz`, `Remove creatorTheming layout prop`.
- Under 70 characters. No ticket IDs. No emoji.

## PR descriptions

High-level, for a reviewer deciding where to look — the diff is the detail. Pick the shape:

- **Architectural** (new components, API changes): `## Motivation` → `## Solution` → `## Verification`. Motivation is the *why* at a conceptual level. Solution names every behavioral shift and API change at the level a reviewer needs to navigate the diff.
- **Migration**: `## Summary` bullets, a table of files changed with complexity notes, `## Test plan` with checkboxes for specific routes.
- **Bug fix**: `## Problem` (with repro or bug link) → `## Root cause` (the mechanism, not the symptom) → `## Fix` (what changed, why this over alternatives) → `## Verification`.
- **Refactor** (no behavior change): `## Motivation` → `## Before / After` → `## Verification` that behavior is preserved. If tests had to change, it isn't a pure refactor — split it.
- **Dependency**: `## Why this bump` → `## Diff highlights` → `## Rollout`. Auto-generated changelogs are welcome; still name what *we* care about.

Every shape ends with `## Rollout` and `## Checklist`:

```markdown
## Rollout
- Risk level: low / medium / high
- Revert: single PR revert sufficient / requires forward fix /
  coordinated revert across multiple PRs
- Feature flag or staged rollout if applicable
- Anything ops should watch post-deploy (specific dashboards, error
  rates, latency)

## Checklist
- [ ] Verified locally
- [ ] Tests added or updated
- [ ] i18n strings extracted (if user-facing copy changed)
- [ ] Accessibility spot-check (keyboard, focus, ARIA)
- [ ] Happo green
```

Adapt the items to the PR — a refactor doesn't need an i18n line, a backend-only change doesn't need Happo. Predictable shape, not rote box-checking.

## Code comments

One or two lines describing the code as it stands, for whoever reads it next. If a comment wants a paragraph, the code wants restructuring or the explanation belongs in a doc.

Never the change that produced it: no `// migrated from Flex`, `// TODO: remove after phase 3`, `// was a Spacer`, `// per review feedback`, `// this is correct because…`, and no play-by-play of the next line. Code coming out of a codemod wave reads as if it had always been written that way.

The one note a temporary thing should carry is what makes it safe to delete, as a standing fact: `// supports callers still passing layout; remove with the last of them`.
