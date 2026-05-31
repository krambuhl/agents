# INTERVIEW — guild-workflow-coverage

The walked decision tree behind `PLAN.md`. Research foundation: `projects/WORKFLOWS-AGENT-POSTURES.md` + `WORKFLOWS-PARALLEL-ADOPTION.md` (PR #142).

## Q1 — Phase decomposition

**Recommendation**: restructure-first, three phases.
**Answer**: Restructure first (3 phases).
**Rationale**: flattening `agents/` fixes the `guild:generated:X → guild:X` namespace the new postures land in, and de-registers personalities as spawnable agents. Setup → feature → cleanup matches the three-phase decomposition pattern. The dependency runs opposite to the stated "coverage then restructure" order.

## Q2 — Posture scope

**Recommendation**: both `implementer` + `fixer`, proof domain `css-architecture` first.
**Answer**: Both, proof domain first.
**Rationale**: proves the write-capable posture (and the codegen path for it) on one domain — the domain the dropped `generator-css-codemod` covered — before mass-generating; matches lowest-complexity-first wave sequencing.

## Q3 — Research / whiteboard handling

**Recommendation**: pipeline-only; defer the rename.
**Answer**: Pipeline-only; defer the rename.
**Rationale**: the `whiteboard → research` rename is a different *intent* (naming / upfront phase, not pipeline coverage). Per one-kind-of-change-per-PR, it splits off as an open question rather than tangling into the coverage work.

## Mid-interview correction (from reading `axes.toml` + `modes/phases/`)

The peek before synthesis overturned a research-dossier assumption: `axis.phase.implementer` already exists (write-capable, = the generator pattern reframed), and `researcher`/`planner`/`reviewer` are all authored too. Only `fixer` is unauthored; `implementer`/`researcher` are merely uninstantiated. This shrank Phase 2 from "author implementer + fixer" to "instantiate implementer + author fixer," and is recorded as the load-bearing decision correcting `WORKFLOWS-AGENT-POSTURES.md`.
