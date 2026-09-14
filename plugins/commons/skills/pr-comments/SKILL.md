---
name: pr-comments
description: >
  Procedure for working a pull request's review comments to closure. Load when
  asked to "address the review", "handle the comments on #N", "respond to
  CodeRabbit", when a review or CI event arrives on a PR you're driving, or
  before posting in any PR thread. Reads every open thread, verifies each claim
  against the code before acting, fixes or answers or escalates, pushes, then
  watches CI and new comments and repeats until the PR is clean. Text it posts
  goes through write-as-me.
argument-hint: "[PR number or URL]"
---

# pr comments

this skill is the procedure for closing out a pr's review, nothing else. how the words read is write-as-me's job. load that skill before composing any reply, commit message, or pr edit this procedure produces.

## invocation

`/pr-comments [PR]`. `$ARGUMENTS` is a pr number or url. with none, use the current branch's pr (`gh pr view --json number,url`). ambient: run this whenever a review comment, ci result, or re-request arrives on a pr you are driving, or when you are about to post in a pr thread for any reason.

## the loop

work the whole pr on its current head every pass. one pass is: gather, verify, act (which starts by loading write-as-me), push, watch. repeat until the exit condition holds.

### 1. gather

collect the current state before touching anything.

- unresolved review threads, with path, line, author, and every comment in the thread. `gh api graphql` on `reviewThreads` gives `isResolved`, `isOutdated`, and the comments; `gh pr view --comments` gives top-level comments; `gh pr view --json reviews` gives review states (approved, changes requested).
- issue comments on the pr that ask for something.
- ci on the head commit: `gh pr checks`. note every failing check and whether it also fails on the base branch.
- merge state: conflicts block everything else.

skip threads you already answered where nobody replied since. skip echoes of your own comments.

### 2. verify the point of view

never act on a comment as stated. read the code at the location and check the claim first.

- open the file at the path and line the thread points to, plus enough around it to understand the claim.
- if the claim is testable, test it: run the existing test, write the failing test the reviewer implies, reproduce the bug, check the type, grep for the callers they say exist.
- a bot finding (coderabbit, a linter, a security scanner) is a bug report. verify it the same way. correct findings get fixed. incorrect ones get a reply with the evidence, not a dismissal.
- record one line per thread: the claim, whether it holds, and the evidence.

then classify each thread:

| class | when | action |
|---|---|---|
| **fix** | the claim holds and the change is local: a bug, a missing test, a rename, a nit | change the code |
| **decline** | the claim does not hold, and you can show why | reply with the evidence |
| **answer** | a question the code can answer | reply with the answer and where it lives |
| **decide** | taste, scope, architecture, or a reading the author has to choose between | escalate to the engineer |
| **route** | another person's or team's call | say so in the thread and name who |

when a thread could be read two ways and the readings lead to different code, it is **decide**, not **fix**.

### 3. act

**first, load write-as-me.** every action below produces text that ships from the engineer's account: a reply, a commit message. before composing the first word of any of it, invoke the `write-as-me` skill with the Skill tool. not from memory of what it says, the skill itself. load it once per pass, then for each text: judge it, ship it, move to the next. the gate spends every outstanding judge run on the next shipped text, so judging three replies and then posting three blocks on the second. a **decide** draft never ships, so it is self-judged and does not go to the subagent.

**fix.** make the change. one logical fix per commit, tests included where the reviewer asked or where the fix is load-bearing. run the repo's own fast checks before committing (lint, typecheck, the tests near the change). commit message through write-as-me. never amend, rebase, or force-push a branch someone else created. on your own branch, follow the repo's convention.

**decline, answer, route.** reply in the thread, text through write-as-me: the evidence or the answer, the file and line it lives at, and nothing else. for route, name the person or team and what you need from them. do not guess their stance.

**decide.** do not post. bring the engineer a ready-to-paste reply in their voice plus one line: what the thread is asking, why it is their call, and what you would say. keep working the other threads while it waits.

**after a fix is pushed**, reply on the thread with what changed and the commit (`fixed in 9e1f2ab`), then resolve the thread. resolve only threads you fixed. a thread you declined stays open for the reviewer to close. a thread you routed stays open until its owner answers.

### 4. push

push once per pass, after every fix in the pass is committed and the fast checks are green. a push that turns ci red costs a cycle. one validated push beats three speculative ones.

### 5. watch

after the push:

- check ci on the new head. red is your work now, whatever else is open. a failure in code the pr touches: fix and push. a failure that is red on the base too, or names a service the diff does not touch: say so once in the thread and re-run at most once. never skip, disable, or quarantine a test to get green. never push an empty commit to kick ci.
- re-gather. new comments arrive after pushes. reviewers reply to your replies. a changes-requested review needs a re-request after you address it.
- if anything is open, start the next pass.

### exit

stop when all of these hold on the current head: no unresolved threads that are yours to act on, ci green, no merge conflict, and every **decide** thread has been handed to the engineer. or when the engineer says stop. then report a short checklist: threads fixed with commits, threads declined with the evidence, threads answered, threads routed and to whom, threads waiting on the engineer, ci state.

if the engineer gave a terminal condition ("get it green", "babysit until mergeable"), that condition is the exit.

## rules that do not bend

- verify before acting. a comment is a claim, not an instruction.
- never post a position on taste, scope, or architecture as the engineer. that is **decide**.
- never resolve a thread you did not fix.
- never rewrite history on someone else's branch.
- never argue with a bot. show evidence or fix the finding.
- prose goes through write-as-me. this skill decides what to say and whether to say it. that skill decides how it reads.
