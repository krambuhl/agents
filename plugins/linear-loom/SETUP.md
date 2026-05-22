# linear-loom — Setup

This document covers the one-time setup an operator does before the
first `linear-loom project create` call. The plugin is still in Phase 2
scaffolding — the verbs referenced here return `not-implemented` until
Phases 3-6 land. Setup steps are written ahead so the operator path
is documented as the surface evolves.

## Prerequisites

- **Linear workspace** with admin permissions sufficient to configure
  custom fields, labels, and the project schema. The schema bootstrap
  in step 3 below requires those permissions; day-to-day operator work
  after that does not.
- **Linear personal API key** (created once per operator in Linear's
  settings). Personal API keys give the v1 budget headroom called out
  in `docs/DESIGN.md` § 9 (1,500 req/hour); OAuth migration is a
  Phase 7+ concern only.
- **Linear MCP server** access in any agent runtime that reads Linear
  state mid-work (covered by `docs/DESIGN.md` § 2).
- **Linear's native GitHub integration** configured in the operator's
  Linear workspace (`docs/DESIGN.md` § 20). Out-of-band; not
  provisioned by linear-loom itself.
- **Node >= 24** on the operator's PATH. The bin shim enforces this
  loudly with `linear-loom-shim-error: node ... is too old` on lower
  versions.

## 1. Generate a Linear personal API key

In Linear: settings → API → personal API keys → create. Copy the
generated token.

linear-loom reads the key from one of two places, in this order:

1. The `LINEAR_API_KEY` environment variable. Recommended for
   day-to-day operator use; the value never lands in any file.
2. A fallback `~/.linear-loom/config.json` of the shape:

   ```json
   {
     "api_key": "lin_api_…"
   }
   ```

   This file holds **auth only** — no default Linear Project ID, no
   default loom-project name, no ambient state. The marker-file
   resolution model (step 4) is per-slug-only by design
   (`docs/DESIGN.md` § 4, § 9).

If neither source is set when a verb that talks to Linear runs, the
CLI exits with `linear-loom-error: missing-auth` and prints both
fallback paths in the error body.

## 2. Identify the Linear Project that hosts your work

A Linear Project is the umbrella that linear-loom writes Milestones,
Issues, Sub-Issues, and Documents into. **One Linear Project can host
one OR MORE loom projects** — the operator chooses granularity
(`docs/DESIGN.md` § 5).

Grab the Linear Project ID from its URL or via the Linear MCP. You
will need it for every `linear-loom configure` and
`linear-loom project create` call (no defaults — see step 4).

## 3. Bootstrap the Linear Project schema

```
linear-loom configure --linear-project=<id>
```

Idempotent one-time setup per Linear Project. Creates the required
labels (the `loom-project:<name>` identity label scheme, plus the
linear-loom routing labels per `docs/DESIGN.md` § 10), confirms or
creates Document templates, and otherwise prepares the Project to
receive linear-loom writes. Safe to re-run; the verb diffs the
current schema against the expected one and adds anything missing.

The schema this verb installs is documented in
`contracts/configure.schema.json` (filled in during Phase 3).

## 4. Create a loom project

```
linear-loom project create <slug> --linear-project=<id>
```

The slug is the operator-chosen short name for this workstream
(kebab-case, no date prefix needed — linear-loom uses a different
slug convention from loom; see `docs/DESIGN.md` § 6). The command:

- Writes `projects/<slug>/linear.json` containing the Linear Project
  ID, the loom-project name, and the schema version. **This file is
  the sole source of truth** for which Linear Project this slug
  binds to — there is no global default, no per-repo default, no
  implicit inheritance.
- Registers the loom-project's identity label
  (`loom-project:<slug>`) in Linear.
- Creates an initial PLAN.md skeleton on disk.

Per `docs/DESIGN.md` § 4: operators who work across multiple Linear
Projects pass `--linear-project=<id>` every time they create a new
slug. Operators who always use the same Linear Project still pay
that small ceremony cost — in exchange for the certainty that
`linear.json` is authoritative and never silently inherits stale
state.

## 5. Start working

From here on, operator-facing entry points are skill-level rather
than CLI-direct. The three operator-direct skills shipping in
Phase 4 are:

- `/linear-loom-research` — fresh research dossier; uploads
  RESEARCH.md as a Linear Document.
- `/linear-loom-plan` — interview + PLAN.md; uploads INTERVIEW.md
  as a Linear Document.
- `/linear-loom-archive` — close out a project.

All three shell to `linear-loom <verb>` calls under the hood; the
CLI is operator-callable too for one-off ad-hoc work.

Execution of phase-level work runs through the `ev-linear` plugin
(Phase 7; not yet installable). Until that ships, the linear-loom CLI
+ slash commands handle the standalone read/write surface, but no
loop driver is wired.

## Common error shapes

linear-loom errors emit a structured JSON object on stderr with a
non-zero exit code. The shape is:

```json
{
  "error": "<kebab-code>",
  "namespace": "<verb-namespace>",
  "verb": "<verb-name>",
  "message": "<one-line context, human-readable>"
}
```

Common codes (more land in Phase 3):

- `missing-auth` — neither `LINEAR_API_KEY` nor
  `~/.linear-loom/config.json` resolved a key.
- `missing-linear-project` — verb required `--linear-project=<id>`
  and none was passed (no defaults; see § 4 above).
- `unknown-namespace` — first positional arg is not a registered
  namespace. The error body includes the full candidates list.
- `not-implemented` — Phase 2 placeholder; the verb's wiring phase
  has not landed yet.

## When things go wrong

- **Auth refused (Linear 401)**: regenerate the personal API key in
  Linear settings, update either the env var or
  `~/.linear-loom/config.json`. Linear personal keys can be revoked
  individually; revoking + reissuing rotates safely with no other
  side effects.
- **Rate-limited (Linear 429)**: the v1 retry layer
  (`docs/DESIGN.md` § 15) handles transient 429s with exponential
  backoff inline. Repeated 429s under steady load indicate either a
  runaway loop or an OAuth-migration trigger — escalate to a
  follow-up workstream rather than tuning v1.
- **Linear-side schema drift** (a label or template was deleted by
  hand): re-run `linear-loom configure --linear-project=<id>`. The
  verb is idempotent and restores anything missing.
