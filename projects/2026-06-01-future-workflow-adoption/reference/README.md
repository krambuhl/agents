# Reference cache — future-workflow-adoption

Frozen reference material for the deferred "adopt guild (and the wider substrate) into Claude dynamic workflows" effort. Relocated here out of the main repo so the working tree stays clean while the effort waits on its triggers (see `../ROADMAP-SCAN.md` — no official timeline for a `workflows/` plugin component type as of 2026-05-31).

These artifacts are a snapshot, not live code. Nothing here is loaded or executed by the repo anymore.

## Contents and provenance

- **`demo/`** — throwaway validation artifacts from PR #142 (merged). `DEMO-RESULTS.md` holds the measured context-win numbers and the validated mechanics; `derive-workflow-agents.mjs` is the prototype logical-name to workflow-`agentType` mapper (now broken against the flattened agent layout — kept as a record of the approach); `FINDING-guild-generator-dangling-refs.md` records the generator-drop dangling refs; `fixture/` is the planted-issue React/CSS fixture the panel ran against. Relocated from the repo-root `demo/`.

- **`workflows/`** — the two demo workflow scripts (`guild-validate-demo.js`, `write-boundary-demo.js`). Relocated from the repo-root `.claude/workflows/`. Because they no longer live in a `.claude/workflows/` load path, they are no longer registered as the `/guild-validate-demo` and `/write-boundary-demo` commands — that de-registration is intentional decluttering.

- **`WORKFLOWS-PARALLEL-ADOPTION.md`, `WORKFLOWS-AGENT-POSTURES.md`** — the original prior-research dossiers (validated in PR #142). Relocated from loose files in `projects/`. The current `../RESEARCH.md` supersedes and verifies these against live source; they are kept for the full provenance trail.

- **`workflow-integration-test-manifest.toml`** — the salvaged manifest (event log + unit contracts) from the `2026-05-29-workflow-integration-test` loom project, which drove the loop-interleaving + kill-recovery integration test. The rest of that project was empty; its directory was deleted (not formally archived) and only this manifest was kept.

## Stale-path note

Citations inside `../RESEARCH.md`, `../ROADMAP-SCAN.md`, and the two `WORKFLOWS-*.md` dossiers that refer to `demo/...` or `.claude/workflows/...` reflect the original repo-root locations at research time. They now resolve under this `reference/` directory (`reference/demo/...`, `reference/workflows/...`). The citations were left as-written rather than rewritten, since they are an accurate record of where the artifacts lived when the research was done.
