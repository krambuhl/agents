# 0010. Loop-layer environment providers (`fella`, `coder`)

- **Date**: 2026-06-25
- **Status**: proposed

## Context

Today the loop drivers (`/ev-run`, `/ev-goal`) do all their work in
whatever session the operator kicked them off from. That session is
wherever the operator happened to be — a thin web session, a phone, a
local checkout. The actual development environment (the repo, installed
deps, a place to run the test suite, stand up a server, or burn through a
build) is something the operator provisions **by hand, ahead of time**:
spin up a container, install Claude inside it, and drive the work from
within. The substrate automated the *loop* (ADR-0009) but left the
*place the loop runs* a manual, out-of-band step.

ADR-0009's forward pointers already gesture at this — "Cherny's *5–10
parallel sessions*, automated" presupposes that the driver can stand up
the contexts those sessions run in. The missing piece is an actuator:
the layer that, given a project to drive, provisions an execution
environment for it.

The operator works across two stacks that provision environments very
differently:

- **Home** — `fella`, a CLI wrapper around OrbStack (local Linux
  machines/containers on macOS) from the `krambuhl/local-dev` repo.
- **Work** — `coder`, the Coder CLI for cloud workspaces.

Any actuator the substrate adds has to drive **both** without the loop
body knowing which one it is talking to. That is the whole problem: one
loop-level concept, two (and later N) concrete provisioners behind it.

This is deliberately **not** a loom concern. Loom owns project *state* —
the manifest, checkins, phase statuses, the project-scoped artifacts.
An execution environment is *context*, not state: it is machine-local,
ephemeral, and orthogonal to which phase is merged. It also can't live
in loom's project-scoped manifest, because the same project is driven
from home (`fella`) and work (`coder`) — the provider is a property of
the *machine*, not the *project*. The seam belongs at the loop layer
(the `ev` family), where control posture already lives.

## Decision

Introduce an **environment-provider seam** at the loop layer. A provider
is a thin adapter over a provisioning CLI; the loop drivers talk to the
seam, never to `fella` or `coder` directly.

### The provider contract

Every provider implements four operations, expressed as command
templates the loop shells out to. The contract is intentionally tiny —
the smallest surface that covers "make me a place to work, run things
there, tear it down":

| Op | Purpose | Idempotency |
|----|---------|-------------|
| `up <project>` | Provision-or-reuse an environment for this project; return a stable **handle** + readiness | `safe` — re-running returns the existing environment for the project |
| `exec <handle> -- <cmd>` | Run a command inside the environment | `safe` (delegates to the command's own idempotency) |
| `status <handle>` | Report readiness / connection info | `safe`, read-only |
| `down <handle>` | Tear the environment down | `safe` — tearing down an absent env is a no-op |

The handle is **keyed on the project slug** so `up` is reuse-not-recreate
across re-invocations: an `/ev-run` parked on a PR wake re-enters and
finds the same environment, rather than provisioning a fresh one each
phase.

### Two v1 providers, named by explicit per-machine config

v1 ships two providers — `fella` and `coder` — and selects between them
by **explicit configuration**, never by autodetecting which CLI is on
PATH. The active provider and its command templates live in
machine-local settings (`.claude/settings.local.json`, already the
substrate's machine-local, git-ignored carve-out — `/ev-run` § 0.5
explicitly filters it out of the dirty-tree check):

```jsonc
// .claude/settings.local.json  (machine-local, never committed)
{
  "ev": {
    "environment": {
      "provider": "fella",          // "fella" at home, "coder" at work
      "providers": {
        "fella": {
          "up":     "fella up {project}",
          "exec":   "fella exec {handle} -- {cmd}",
          "status": "fella status {handle}",
          "down":   "fella down {handle}"
        },
        "coder": {
          "up":     "coder ...",
          "exec":   "coder ssh {handle} -- {cmd}",
          "status": "coder show {handle}",
          "down":   "coder delete --yes {handle}"
        }
      }
    }
  }
}
```

The plugin ships sensible default templates for the two known providers,
so a machine only has to set `provider`; the `providers` block is an
override seam. Adding a third provider is **config, not code** — write
its four command templates and name it. Explicit config (not PATH
autodetect) is the load-bearing choice: the home and work CLIs may both
be installed somewhere, and silently guessing wrong would provision in
the wrong place. The config is the operator's unambiguous statement of
"this machine provisions like *this*."

### Operator-flag-gated in v1

The drivers gain an `--env` flag. v1 does **not** auto-decide whether a
phase needs an environment — the operator opts in per run:

- `/ev-run <slug> --env` / `/ev-goal <slug> --env` → before dispatching
  the loop body, resolve the configured provider, `up` the environment
  for `<slug>`, and run the phase's work inside it via `exec`.
- No `--env` → the loop runs in the current session exactly as today.
  Zero behavior change for every existing invocation.

When `--env` is absent the seam is dormant: this is a strictly additive
change. The "agent reads the phase and *decides* it needs an
environment" behavior — the original framing of this feature — is a
**v2 forward pointer**, not v1. v1 proves the seam with an explicit
operator switch before handing the decision to a panel.

### v1 runs the phase's commands in the environment; full Claude-in-env dispatch is v2

Two execution models exist once an environment is provisioned:

1. **Exec model (v1).** The Claude reasoning stays in the operator's
   session; the loop body's *commands* (test suite, build, server,
   codegen) run inside the environment via the provider's `exec`. The
   environment is a command executor with the repo and deps already
   present.
2. **Dispatch model (v2).** A full Claude session is bootstrapped
   *inside* the environment and drives the loop body there — the literal
   automation of today's manual "install Claude in the container and work
   from within." This needs session bootstrapping and an output channel
   back to the operator; it is deferred.

v1 takes the exec model: it delivers the core value (work happens in a
real environment with deps, not a thin session) without the harder
bootstrap-and-stream problem. The dispatch model is the natural v2 and
is where this rejoins ADR-0009's "5–10 parallel sessions" pointer.

## Consequences

**Now easy that wasn't before.** `/ev-run <slug> --env` (or `/ev-goal
<slug> --env`) provisions a real development environment on whatever
machine the operator is on — OrbStack at home, a Coder workspace at work
— and runs the phase's commands there, with no manual container setup
beforehand. The same flag, the same loop, two backends.

**Now harder.** A second config surface (`ev.environment`) and a
provider-adapter layer to keep coherent. The risk is template drift —
a provider's underlying CLI changing flags out from under the committed
default templates. Mitigation: the templates are overridable in
machine-local config, and a `status`/`up` failure surfaces a named
provider error (see *Watch for*) rather than a silent wrong-place
provision.

**Now possible to get wrong quietly.** Provisioning in the wrong place.
Explicit config is the guard, but a stale `provider` value (set to
`coder` on a machine that's now offline from the work VPN) fails at `up`
time. The seam must surface provider failures loudly and **fall back to
running in the current session with a warning**, never silently swallow
a failed `up` and proceed as if the env existed.

**Closed alternatives.**
- *A loom `env` verb* (rejected — loom owns state, not execution
  context; the provider is machine-scoped, which loom's project-scoped
  manifest is the wrong home for; and the operator explicitly wants this
  as a loop concept).
- *PATH autodetection of the provider* (rejected — both CLIs may be
  installed; guessing risks provisioning in the wrong place; explicit
  config is unambiguous and portable).
- *The harness `Agent(isolation:"remote")` primitive as the v1 actuator*
  (rejected for v1 — it provisions the platform's own gated cloud env,
  not the operator's `fella`/`coder` stacks, which is the actual
  requirement; it remains a candidate *additional* provider later).
- *Auto-deciding env-need in v1* (deferred — prove the seam under an
  explicit `--env` switch first; hand the decision to a panel in v2).

**Commits us to.** The four-op provider contract (`up` / `exec` /
`status` / `down`) and the project-slug-keyed handle as the stable
abstraction. Any third provider and the v2 dispatch model must fit this
contract, not widen it.

**Watch for.** A provider whose `up` succeeds but whose environment is
not actually ready (race between "created" and "ssh-able") — the seam
must gate on `status` readiness, not on `up` exit code alone. And an
`--env` run that silently *doesn't* provision (config missing, provider
unset) and runs locally without saying so — the absence of an
environment when one was requested must be a surfaced warning, not a
silent downgrade.

## Forward pointers

- **v2 — agent-decided env-need.** Replace the `--env` opt-in with a
  per-phase judgment: a panel (e.g. `evaluator-contract-fit` reading the
  phase's PLAN.md work shape — "runs the test suite / stands up a
  server" → needs an env; "pure doc/spec" → doesn't) decides whether to
  provision. This is the original framing of the feature; `--env`
  remains as the explicit override.
- **v2 — dispatch model.** Bootstrap a full Claude session inside the
  provisioned environment and drive the loop body there, with an output
  channel back to the operator. This is the literal automation of the
  manual "install Claude in the container" workflow and rejoins
  ADR-0009's "5–10 parallel sessions, automated" pointer — one
  environment per dependency-unblocked phase, driven in parallel.
- **v2 — environment lifecycle policy.** Who tears down, and when.
  Candidates: `/ev-goal` tears down at goal-converge (alongside the
  `/loom-archive` step); `/ev-run` leaves the env up for reuse across
  parked re-invocations; an explicit `--env-down` for manual teardown.
  v1 leaves teardown manual (`down` exists in the contract but no driver
  calls it automatically).
- **Additional providers.** `fella` and `coder` are the v1 set; the
  config seam admits a third (e.g. the harness remote-agent primitive, a
  plain `docker`/`devcontainer` provider, a remote SSH host) as four
  command templates without touching the loop bodies.
</content>
</invoke>
