# 0007. Host/broker node relays ADR questions; the store is the message bus

- **Status**: accepted
- **Scope**: Phase 9 escalation architecture (refines decision 0006)

## Decision

Autonomous multi-machine runs have **two node roles**:

- **Worker nodes** — the coder boxes. Headless `claude -p`, subscription
  `setup-token`, **not** remote-controllable (decision 0006). They do the
  work; on an ADR moment they write a question record to the shared store
  and park that phase. They **never** do an interactive login.
- **Host / broker node** — the operator's driving session (e.g. the local
  `/ev-goal` that dispatched the workers). A **full-scope `claude auth
  login`** session, human-attended, and therefore **remote-controllable**.
  It watches the store's `questions/` partition, surfaces pending ADR
  questions to the human (locally via `AskUserQuestion`, or remotely —
  the operator attends the host via Remote Control from a phone), and
  writes the answer back to the store.

**The message bus is the git-synced shared store** (decision 0006's
question/answer partition + pull-before-act), **not** a direct worker→host
connection. Workers and the host rendezvous through the repo.

## Why

The operator's interpretation: a worker can't be remote-controlled
(verified, 0006), so it escalates to a node that *can* host the human. That
is correct — and the relay needs message passing, which we already have in
the store. Routing through git, not RPC, means:

- **No inbound connectivity** to workers; nothing to open or expose.
- **Durable** — a question survives a worker box dying; a host being
  offline merely queues it.
- **Many-to-any** — any human-attended node watching the partition can
  answer, so Phase 8's massive concurrency keeps a single rendezvous.

Remote Control re-enters in the *right* place: it makes the **operator**
reachable at the **host** (the one full-scope, persistent session), not the
workers. The one-time `/login` lives on the host, for the operator;
workers stay headless on the subscription token.

## Consequences

- Phase 9 gains a **broker-watcher** step: the host/driver session polls
  the `questions/` partition (pull-before-act) and relays to the human.
- The operator can be away: Remote Control answers the host's surfaced
  question from a phone; the host commits the answer; workers resume.
- No worker ever needs a full-scope login or Remote Control — the
  verified constraint (0006) is satisfied by construction.
