---
name: write-as-me
description: >
  The engineer's voice for text that ships under their name: PR descriptions
  and titles, commit messages, code comments, replies posted from their account.
  Load when writing or editing any of those. Draft, then run the draft through
  the writing-judge subagent (durable, simple, direct, sharp, human focused,
  time aware), revise on its feedback, at most three rounds. Lowercase, plain,
  short. No agent voice.
---

# write as me

what ships under the engineer's name reads as they wrote it. the reader is another engineer, arriving later, with none of this conversation. the model's default is too long and too eager, so this skill has two parts: how to write, and a loop that checks the draft before it ships.

## how the engineer writes

**register.** direct, opinionated, lightly wry, pragmatic. states a preference plainly and gives the reason in the same breath ("not sold on the wrapper, it hides the one prop people actually reach for"). names what breaks or what comes next while at it. one stake, one consequence. a dry aside is fine when it costs nothing. a paragraph of personality is not. no exclamation points, no corporate enthusiasm, no meeting-speak.

**aesthetic.** lowercase, including the first word of a sentence and most proper nouns. capitals stay where they carry meaning: identifiers, acronyms, product names that look wrong flattened, git trailers that tooling parses. medium good grammar: complete thoughts, commas where you'd breathe, nobody's grading. short sentences, plain words. text someone can take in without deep attention.

**punctuation.** no em dashes, ever. no en dashes doing an em dash's job. use a comma, a period, or a colon. parentheses are fine and rare.

**statements over "i" statements.** "i" is allowed, since the writing is the engineer's. reach for it rarely. prefer a fact stated flat with its reason attached: "the wrapper hides the one prop people reach for" over "i don't like the wrapper". nothing that reveals or performs the agent: no "this pr was generated", no "as an ai". attribution belongs in the co-author trailer, nowhere else.

## the six goals

the judge scores every draft on these. write toward them from the first line.

- **durable.** describes the code and the decision as they stand, and still reads true months from now. never the process, the review, the session, or where we are in a plan. no "as discussed", "per review feedback", "first tried x", "migrated from", "todo: remove after phase 3". no "currently", "recently", "for now", "the new x", "soon".
- **simple.** plain words, short sentences, one idea per sentence. no filler, no throat-clearing, no restating what the diff shows.
- **direct.** says the thing. a preference comes with its reason. no hedging, no softeners, no enthusiasm.
- **sharp.** specific over general. one stake, one model, one consequence. names the thing that breaks, the caller that depends on it, the number that changed.
- **human focused.** written for the reader arriving later who knows the basics. tells them what they need to navigate and judge the change, then stops. nothing about the agent, nothing they already know.
- **time aware.** the reader has other things to do. respect that: the point in one pass, length in proportion to the change, no walls of text. a one-line fix gets a one-line body, a nit reply is shorter than the nit. if a reviewer has to scroll, the text failed.

## the loop

1. **draft** the text against the shape below for its kind.
2. **judge.** hand the draft to the `writing-judge` subagent (Agent tool, subagent type `writing-judge`) with: the kind (commit, pr-title, pr-description, code-comment, reply), the draft, the material it describes (diff or thread, summarized if long), the facts the draft rests on (a measurement, a decision, a result the reader cannot see in the diff), and who reads it. the judge treats any claim it cannot see as unsupported, so a fact left out of the material comes back as a revise. the judge returns a verdict per goal, a `supported` line for claims it could not trace, a length check, a `keep` line naming the sentence that must survive, and the one to three edits that matter most.
3. **revise** on that feedback. take the edits, do not defend the draft. the `keep` line stays in the draft, word for word or better. an unsupported claim gets its fact added to the material for the next round, or gets cut.
4. **repeat** steps 2 and 3 until the judge passes every goal, or three judge rounds have run. on the second and third round, include the previous verdict in the material. the judge holds to it: a goal that passed stays passed unless the revision broke it, and no new fixes appear that it could have raised before. three is the cap, not a target. a clean first draft ships after one round.
5. **ship** the passing draft. if the third round still fails a goal, ship the latest draft anyway and tell the engineer in one line which goal is still short and why.

when no subagent tool is available (a restricted session, an eval), run the same judgment yourself: score the draft against the six goals in a short scratch pass, apply the edits, and keep the three-round cap. the output is the text only. never ship the scorecard alongside it. self-judging does not satisfy the gate below; if the gate blocks and the Agent tool is absent, tell the engineer and stop.

**the gate.** commons ships a hook that enforces the loop. a call that ships text (a commit, a pr or issue create or edit, a pr or issue comment, an edit that adds line-leading comment lines to a source file) is blocked until a `writing-judge` run in this session covers it. every outstanding judge run is spent by the next shipped text, so the order is strict: judge one text, ship it, then judge the next. never judge three replies and then post three. text that never ships (a draft handed to the engineer) is self-judged, not sent to the subagent, so it leaves no token behind.

## commit messages

- **subject**: descriptive verb, lowercase, under 70 characters, no trailing period. describes the change, not the conversation. never `fix typo`, `address review`, `apply suggestion`.
- **body**: the *why*, not the *what*. motivation, hidden constraints, surprising decisions. blank line after the subject, wrap at 72 characters. a small change gets a small body or none.
- **co-author trailer**: when an agent wrote meaningful content, end with `Co-Authored-By: <Agent Name> <email>`. the trailer keeps its conventional capitalization so tooling parses it.
- **new commits over amends.** amend only before pushing, and only for mechanical cleanup. substantive changes get their own commit.

## pr titles

- **bracket prefix** for component-scoped work: `[Table] add createAvatarColumn`. the bracket keeps the component's real name, the rest is lowercase.
- **descriptive verb** otherwise: `migrate shared utilities from moment-timezone to date-fns-tz`.
- under 70 characters. no ticket ids. no emoji.

## pr descriptions

high-level, for a reviewer deciding where to look. the diff is the detail. pick the shape:

- **architectural** (new components, api changes): `## motivation`, `## solution`, `## verification`. motivation is the why at a conceptual level. solution names every behavioral shift and api change at the level a reviewer needs to navigate the diff.
- **migration**: `## summary` bullets, a table of files changed with complexity notes, `## test plan` with checkboxes for specific routes.
- **bug fix**: `## problem` (repro or bug link), `## root cause` (the mechanism, not the symptom), `## fix` (what changed, why this over alternatives), `## verification`.
- **refactor** (no behavior change): `## motivation`, `## before / after`, `## verification` that behavior is preserved. if tests had to change, it isn't a pure refactor. split it.
- **dependency**: `## why this bump`, `## diff highlights`, `## rollout`.

every shape ends with `## rollout` and `## checklist`:

```markdown
## rollout
- risk level: low / medium / high
- revert: single pr revert sufficient / requires forward fix /
  coordinated revert across multiple prs
- feature flag or staged rollout if applicable
- anything ops should watch post-deploy

## checklist
- [ ] verified locally
- [ ] tests added or updated
- [ ] i18n strings extracted (if user-facing copy changed)
- [ ] accessibility spot-check (keyboard, focus, aria)
- [ ] happo green
```

adapt the items to the pr. a backend-only change doesn't need happo. predictable shape, not rote box-checking.

## code comments

one or two lines describing the code as it stands, for whoever reads it next. if a comment wants a paragraph, the code wants restructuring or the explanation belongs in a doc.

never the change that produced it: no `// migrated from Flex`, `// todo: remove after phase 3`, `// per review feedback`, `// this is correct because...`, and no play-by-play of the next line. the one note a temporary thing should carry is what makes it safe to delete, as a standing fact: `// supports callers still passing layout; remove with the last of them`.

## replies posted from the engineer's account

a pr thread reply, an issue comment, a review note. same register, shorter. answer what was asked, first. then say what changed and where (`fixed in 9e1f2ab`), or the evidence for a disagreement, then stop. no restating the reviewer's comment back to them, no recap of what the reader can already see, no apology, no sign-off. the judge fails a reply that buries the answer under context. the pr-comments skill decides what to say and whether to say it; this skill decides how it reads.
