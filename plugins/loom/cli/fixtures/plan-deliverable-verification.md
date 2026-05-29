# Test Plan: project vocabulary — Deliverable + Verification aliases

### Phase 1 — Parser work

**Deliverable**: widen the heading parser to accept project vocabulary.

**Verification**:
- parse-plan accepts Deliverable and Verification
- existing Goal/Exit/Output plans still parse

### Phase 2 — Mixed vocabulary in one plan

**Goal**: prove Goal/Exit still parse alongside Deliverable/Verification.

**Exit**:
- legacy vocabulary intact

**Depends on**: Phase 1.
