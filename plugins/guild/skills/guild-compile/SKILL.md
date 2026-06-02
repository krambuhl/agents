---
name: guild-compile
description: >-
  Operator-invoked agent-codegen driver for the guild family. Composes
  per-cell agent bodies by parsing axes.toml → resolving fragments →
  fusing the three axes in-session (LLM, max-effort) → emitting agent
  files + cache. Cache-miss cells get freshly fused; cache-hit cells
  pass their existing committed body through. Driven by the
  fusion-prompt.md template; cache invalidates on prompt-template
  edits.
argument-hint: "[--axes-toml=<path>] [--output-dir=<path>] [--dry-run]"
user-invocable: true
allowed-tools: Read, Write, Bash, Bash(guild *)
---

# /guild-compile

Operator-invoked driver for the guild agent-codegen pipeline. Runs
parse → validate → derive → resolve via the `guild` CLI; fuses each
cache-miss cell in-session at max effort against `fusion-prompt.md`;
passes cache-hit cells through unchanged; emits the result via the
`guild` CLI.

The skill is the **only** path to LLM fusion. The CLI's full-pipeline
mode (`guild compile` with no `--stage`) runs the deterministic v0
text-concat compose stage; it does not perform fusion. Use this skill
when you want real LLM-fused agent bodies.

## Inputs

- `--axes-toml=<path>` — defaults to `plugins/guild/modes/axes.toml`. The
  authoritative source of the axis matrix.
- `--output-dir=<path>` — defaults to `plugins/guild/agents`.
  Where the composed agent files land and where the `.cache.toml`
  lives.
- `--dry-run` — optional. When set, the skill runs fusion for
  cache-miss cells and prints the resulting JSON bundle to stdout
  but does NOT call the emit stage. Useful for iterating on the
  fusion prompt without polluting the `agents/` tree.

## Process

### 1. Preflight

Ensure the fusion-prompt template exists. The skill's working
directory should be the repo root (so default paths resolve).

```
Bash("test -f plugins/guild/skills/guild-compile/fusion-prompt.md || { echo 'fusion-prompt.md missing — cannot fuse without a template' >&2; exit 1; }")
```

Compute the SHA-256 of the fusion-prompt template. This value
threads through to the cache as `prompt_hash`; an edit to the
template invalidates every cell.

```
Bash("shasum -a 256 plugins/guild/skills/guild-compile/fusion-prompt.md | awk '{print $1}'")
```

Save the value as `PROMPT_HASH` for the rest of the flow.

### 2. Run the parse → resolve stage

Invoke the through-resolve subset of the pipeline. The CLI emits a
JSON bundle describing every cell + which cells the cache says need
fresh fusion.

```
Bash("guild compile --stage=parse,validate,derive,resolve --prompt-hash=<PROMPT_HASH>")
```

Pass through `--axes-toml` and `--cache-toml` if the operator
overrode them. The stdout JSON shape:

```
{
  "schema_version": 1,
  "prompt_hash": "<PROMPT_HASH>",
  "cells": [ResolvedCell, ResolvedCell, ...],
  "cache_hits": ["<cell-id>", ...],
  "cache_misses": ["<cell-id>", ...]
}
```

Each `ResolvedCell` carries `id`, `phase`, `personality`, `domain`
(string or null for singletons), `source`, `source_name`, the three
fragment bodies (`phase_fragment`, `personality_fragment`,
`domain_fragment` — empty string for singleton domains), and the
folded `tools` list.

Parse the JSON. If `cache_misses` is empty, **stop here — no work
needed**. Print "no source changes; cache up to date" and exit. The
no-op path is exit criterion #5 of Phase 2.1.

### 3. Read the fusion-prompt template + personality-base

These are needed for every cache-miss cell. Read them once and reuse.

```
Read("plugins/guild/skills/guild-compile/fusion-prompt.md")
Read("plugins/guild/agents/personalities/personality-base.md")
```

The personality-base body is inlined into every composed agent as
the opening framing per the cross-axis composition guidance.

### 4. Fuse each cache-miss cell in-session

For each cell whose id appears in `cache_misses`:

1. Build the structured-slots input bundle per `fusion-prompt.md` §
   Input shape:
   ```
   ## Cell metadata
   phase: <cell.phase>
   personality: <cell.personality>
   domain: <cell.domain or "(none)">
   id: <cell.id>
   tools: <cell.tools joined with ", ">

   ## Personality base
   <personality-base.md body, frontmatter stripped>

   ## Personality fragment
   <cell.personality_fragment>

   ## Phase fragment
   <cell.phase_fragment>

   ## Domain fragment
   <cell.domain_fragment — omit this entire block for singletons>
   ```
2. Apply the fusion-prompt template to the bundle. **You are the LLM
   performing the fusion** — read the template's quality bar, hold
   all three axes (or two for singletons), and produce one coherent
   agent body at max effort.
3. The output is the cell's `composed_body`: a complete Markdown
   file content (YAML frontmatter + body).

Cache-hit cells skip fusion entirely — see § 5 for their handling.

### 5. Read cache-hit cells' existing bodies

For each cell whose id appears in `cache_hits`:

```
Read("<output-dir>/<cell.id>.md")
```

The file content becomes that cell's `composed_body` for the emit
bundle. The cache hit means source hashes + prompt_hash already
match — the on-disk body is the canonical fused output for these
sources + this prompt.

If a cache-hit cell's `.md` file is missing from disk (drift case),
treat it as a cache miss and fall through to § 4. This is defensive;
under normal operation the cache and disk stay in sync.

### 6. Compute source_hashes per cell

The emit stage's input JSON needs `source_hashes` on every
`ComposedAgent`. Compute SHA-256 of each fragment body. The easiest
path is a Bash heredoc per cell, or a single Node one-liner. Example
shape (one cell):

```
Bash("node -e 'const c=require(\"node:crypto\"); const h=(s)=>c.createHash(\"sha256\").update(s,\"utf8\").digest(\"hex\"); console.log(JSON.stringify({phase: h(process.env.PHASE), personality: h(process.env.PERSONALITY), domain: h(process.env.DOMAIN)}))' " /* with PHASE / PERSONALITY / DOMAIN populated from the ResolvedCell */)
```

In practice, build a small per-run helper script in `/tmp` that
takes the through-resolve JSON and emits a per-cell source_hashes
table, to avoid one Bash call per cell.

### 7. Construct the emit bundle

For every cell (cache-hit + cache-miss), build the `ComposedAgent`
JSON object:

```
{
  "id": <cell.id>,
  "phase": <cell.phase>,
  "personality": <cell.personality>,
  "domain": <cell.domain or null>,
  "source": <cell.source>,
  "source_name": <cell.source_name>,
  "phase_fragment": <cell.phase_fragment>,
  "personality_fragment": <cell.personality_fragment>,
  "domain_fragment": <cell.domain_fragment>,
  "tools": <cell.tools>,
  "composed_body": <fused-or-passthrough body>,
  "source_hashes": <computed-per-§ 6>
}
```

Wrap them in the top-level emit envelope:

```
{
  "schema_version": 1,
  "prompt_hash": "<PROMPT_HASH>",
  "agents": [<ComposedAgent>, <ComposedAgent>, ...]
}
```

### 8. Run the emit stage

Pipe the envelope to `guild compile --stage=emit`. If `--dry-run`
was passed, instead print the envelope to stdout and stop here.

```
Bash("guild compile --stage=emit --prompt-hash=<PROMPT_HASH> < /tmp/emit-bundle.json")
```

Pass through `--output-dir` if the operator overrode it. The stdout
JSON reports the written files + cache entries:

```
{
  "written_files": [<path>, ...],
  "cache_entries": [{cell_id, source_hashes, output_hash, prompt_hash, fused_at}, ...]
}
```

### 9. Report

Print a short summary: cells total, cache hits, cache misses (fused
this run), output dir, prompt_hash short prefix. Example:

```
guild-compile: 19 cells (12 hits, 7 misses fused), wrote to plugins/guild/agents/generated/, prompt_hash=abc12345...
```

## Rules

- **Fuse at max effort.** This is the whole reason the skill exists.
  Hold all three axes; do not fall back to text-concat. The
  deterministic v0 path is `guild compile` (no stage); use that when
  you do not need fusion.
- **Source-grounded.** Every claim in a fused body should trace to
  the input fragments or personality-base. Do not invent
  antipatterns, tools, or mandates absent from the inputs.
- **One voice, not three.** A fused body that reads as three sections
  stapled together is a failure. Restructure freely; preserve
  meaning.
- **Bare commands only.** Use `guild compile`, never `bin/guild
  compile`. The marketplace's plugin install puts `bin/` on PATH;
  bare invocations resolve.
- **No emojis.**

## Failure modes

- `fusion-prompt.md` missing → preflight fails loud. Stop.
- through-resolve stage errors (validate-stage finding, missing
  fragment file, etc.) → forward the stderr verbatim. Stop.
- emit stage errors (malformed JSON, schema mismatch) → forward the
  stderr verbatim. Stop. The cache + agents are unchanged.
- A cache-hit cell's on-disk `.md` is missing → fall through to
  fusion as in § 5. Surface a one-line warning so the operator
  knows the cache + disk got out of sync.
- The operator hand-edited an agent file → the cache will still hit
  on its source_hashes match, and § 5 will pass the hand-edited
  body through. Use `guild compile --check` (Phase 2.1 U4) to detect
  this drift before re-fusion.
