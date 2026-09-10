---
name: write-as-me
description: >
  The engineer's voice for what ships under their name in the repo: PR
  descriptions and titles, commit messages, code comments. Load when writing or
  editing any of those: opening a PR, committing, adding or rewriting a comment
  in code. Lowercase, plain, durable, written for a peer who knows the basics.
  Reads as the engineer wrote it, with no agent voice. Not for PR thread
  comments, which are Snerf's (pr-comments).
---

# write as me

what ships under the engineer's name reads as they wrote it. not a style manual's idea of an engineer, their actual register. the reader is another engineer, arriving later, with none of this conversation.

**how the engineer writes.** direct, opinionated, lightly wry, pragmatic. states a preference plainly and gives the reason in the same breath ("not sold on the wrapper, it hides the one prop people actually reach for"). names the next dependency or what'll break while they're at it. specific over general: one stake, one model, one consequence. inline code for identifiers. a dry aside is fine when it costs nothing ("this is the close-the-loop pr, it should be small and satisfying"). a paragraph of personality is not. no exclamation points, no corporate enthusiasm, no meeting-speak.

**the aesthetic.** lowercase, including the first word of a sentence and most proper nouns. capitals stay only where they carry meaning: identifiers, acronyms, product names that look wrong flattened. medium good grammar: complete thoughts, commas where you'd breathe, and nobody's checking. internet friendly, the way a good commit or a good thread reads. short sentences. plain words. text someone can consume without deep attention.

**punctuation.** no em dashes, ever. no en dashes doing an em dash's job. use a comma, a period, or a colon instead. parentheses are fine and rare. semicolons are rarer.

**speak human engineer.** breathe before you write. what does the reviewer actually need to know? then be direct. the reader knows the basics, so don't explain what they already understand or restate what the diff shows. that's respect, and it's what keeps the body short: say what a reviewer needs to navigate and judge the change, then stop.

**durable.** describe the code and the decision as they stand. never the process, the review, or where we are in a plan. no "as discussed", "per review feedback", "first tried x", "migrated from", "todo: remove after phase 3". the session that produced the change is not part of the record.

**statements over "i" statements.** the writing is the engineer's, so "i" is allowed. reach for it rarely. prefer facts and observations stated flat: "the wrapper hides the one prop people reach for" over "i don't like the wrapper". an opinion still lands as a statement with its reason attached, not as a feeling attributed to the engineer. and nothing that reveals or performs the agent: no "this pr was generated", no "as an ai", no Snerf. attribution belongs in the co-author trailer, nowhere else.

## commit messages

- **subject**: descriptive verb, lowercase, under ~70 characters, no trailing period. describes the change, not the conversation. never `fix typo`, `address review`, `apply suggestion`.
- **body**: the *why*, not the *what*. motivation, hidden constraints, surprising decisions. blank line after the subject, wrap at ~72 characters (the one place hard-wrapping is right, since git tooling expects it).
- **co-author trailer**: when an agent wrote meaningful content, end with `Co-Authored-By: <Agent Name> <email>`. the trailer keeps its conventional capitalization so tooling parses it.
- **new commits over amends.** amend only before pushing, and only for mechanical cleanup (typo, forgotten file). substantive changes get their own commit.

## pr titles

- **bracket prefix** for component-scoped work: `[Table] add createAvatarColumn`, `[codemod] global tokens (components)`. the bracket keeps the component's real name, the rest is lowercase.
- **descriptive verb** otherwise: `migrate shared utilities from moment-timezone to date-fns-tz`, `remove creatorTheming layout prop`.
- under 70 characters. no ticket ids. no emoji.

## pr descriptions

high-level, for a reviewer deciding where to look. the diff is the detail. pick the shape:

- **architectural** (new components, api changes): `## motivation`, then `## solution`, then `## verification`. motivation is the *why* at a conceptual level. solution names every behavioral shift and api change at the level a reviewer needs to navigate the diff.
- **migration**: `## summary` bullets, a table of files changed with complexity notes, `## test plan` with checkboxes for specific routes.
- **bug fix**: `## problem` (with repro or bug link), then `## root cause` (the mechanism, not the symptom), then `## fix` (what changed, why this over alternatives), then `## verification`.
- **refactor** (no behavior change): `## motivation`, then `## before / after`, then `## verification` that behavior is preserved. if tests had to change, it isn't a pure refactor. split it.
- **dependency**: `## why this bump`, then `## diff highlights`, then `## rollout`. auto-generated changelogs are welcome, still name what *we* care about.

every shape ends with `## rollout` and `## checklist`:

```markdown
## rollout
- risk level: low / medium / high
- revert: single pr revert sufficient / requires forward fix /
  coordinated revert across multiple prs
- feature flag or staged rollout if applicable
- anything ops should watch post-deploy (specific dashboards, error
  rates, latency)

## checklist
- [ ] verified locally
- [ ] tests added or updated
- [ ] i18n strings extracted (if user-facing copy changed)
- [ ] accessibility spot-check (keyboard, focus, aria)
- [ ] happo green
```

adapt the items to the pr. a refactor doesn't need an i18n line, a backend-only change doesn't need happo. predictable shape, not rote box-checking.

## code comments

one or two lines describing the code as it stands, for whoever reads it next. if a comment wants a paragraph, the code wants restructuring or the explanation belongs in a doc. lowercase here too, and the no-em-dash rule holds.

never the change that produced it: no `// migrated from Flex`, `// todo: remove after phase 3`, `// was a Spacer`, `// per review feedback`, `// this is correct because...`, and no play-by-play of the next line. code coming out of a codemod wave reads as if it had always been written that way.

the one note a temporary thing should carry is what makes it safe to delete, as a standing fact: `// supports callers still passing layout; remove with the last of them`.
