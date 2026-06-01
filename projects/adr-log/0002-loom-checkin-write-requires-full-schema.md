# 0002. Loom checkin write requires full schema

- **Date**: 2026-05-28
- **Status**: accepted

## Context

During Phase 3 P3D1 of the `2026-05-28-loom-adr` project (introducing the `loom adr` verb and wiring it into `ev-loop-interactive`), `loom checkin write` rejected a contract-only intermediate checkin with `manifest-schema-invalid: [[checkins]] #N is missing required table [execution]`. The substrate enforces a full-schema shape on checkin writes — the file must carry contract + execution + verdict + notes_for_pr at write time.

The `ev-loop-interactive` skill body's step 2.1 (Negotiate) tells the loop to "Draft the unit contract for this deliverable and write it into a new numbered checkin (Contract section only)." The skill body's intent — that the contract is persisted at negotiation time and the execution + verdict get appended later at unit close — is not the shape the substrate verb supports today.

Unit goal that surfaced this: Insert a new step 5.5 (ADR-emit) into ev-loop-interactive's unit loop, between scope-shift detection and phase update.

## Decision

The skill body's language is wrong; the substrate verb's enforcement is right. The decision is to **tighten the skill body to acknowledge full-schema-at-close as the convention** rather than loosen the substrate to accept partial checkins.

The two options the friction surfaced were:
- (a) loosen `loom checkin write` to accept partial checkins (contract-only initial write + execution/verdict append at close), or
- (b) tighten the skill body to acknowledge full-schema-at-close as the convention and rephrase the negotiate step.

Option (b) is load-bearing because conversation already provides the intermediate-persistence benefit option (a) would add. The contract lives in the operator-agent conversation throughout the unit; the checkin is a closing artifact that captures the whole unit (contract + execution + verdict + notes_for_pr) atomically. Adding substrate complexity for a redundant persistence layer would invert the contract: every loop now has to track which fields are committed and which are pending, instead of treating the checkin as a single point-in-time snapshot.

## Consequences

- A checkin is a single point-in-time snapshot of a whole unit (contract + execution + verdict + notes), not a record assembled across writes — no loop has to track which fields are committed vs pending. The unit's contract lives in the operator–agent conversation until close.
- The skill-body rephrasing this decision called for was deferred at decision time; the negotiate step still said "Contract section only" until `2026-05-30-shared-insights` Phase 6 reconciled it. Until then, agents that read the prose literally hit the full-schema rejection repeatedly — the single most-recurring papercut of that remediation (~17 checkins).
- A unit that genuinely needs intermediate persistence uses two numbered checkins (a contract checkin + a resolution checkin), since checkins are create-once and immutable — "fill it in later" is a new checkin, never an edit.
- Watch: loosening `loom checkin write` to accept partial checkins would re-introduce the pending-fields bookkeeping this decision exists to avoid.
