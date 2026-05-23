import { test, expect } from 'vitest';
import { applyLinearUrlsToPlan } from './plan-writeback.ts';

const PLAN = `# A Plan

## Context

Some prose.

## Phases

### Phase 1 [design-1] — Design

Phase prose.

#### Batch 1 [skeleton-1] — Skeleton

- [decisions-1] Decisions
- [sketch-1] Sketch

### Phase 2 [scaffold-1] — Scaffold

#### Batch 1 [bootstrap-1] — Bootstrap

- [plugin-json-1] plugin.json

## Risks

Trailing prose not parsed.
`;

test('applyLinearUrlsToPlan: empty url map is a no-op', () => {
  const result = applyLinearUrlsToPlan(PLAN, new Map());
  expect(result.text).toBe(PLAN);
  expect(result.updated_lines).toBe(0);
});

test('applyLinearUrlsToPlan: appends annotation to fresh Phase/Batch/Task lines', () => {
  const urls = new Map<string, string>([
    ['design-1', 'https://linear.app/x/issue/L-1'],
    ['design-1.skeleton-1', 'https://linear.app/x/issue/L-2'],
    ['design-1.skeleton-1.decisions-1', 'https://linear.app/x/issue/L-3'],
  ]);
  const result = applyLinearUrlsToPlan(PLAN, urls);

  expect(result.updated_lines).toBe(3);
  expect(result.text).toContain(
    '### Phase 1 [design-1] — Design ([linear](https://linear.app/x/issue/L-1))',
  );
  expect(result.text).toContain(
    '#### Batch 1 [skeleton-1] — Skeleton ([linear](https://linear.app/x/issue/L-2))',
  );
  expect(result.text).toContain(
    '- [decisions-1] Decisions ([linear](https://linear.app/x/issue/L-3))',
  );
});

test('applyLinearUrlsToPlan: re-applying the same map is idempotent', () => {
  const urls = new Map<string, string>([
    ['design-1', 'https://linear.app/x/issue/L-1'],
    ['design-1.skeleton-1.decisions-1', 'https://linear.app/x/issue/L-3'],
  ]);
  const once = applyLinearUrlsToPlan(PLAN, urls);
  const twice = applyLinearUrlsToPlan(once.text, urls);
  expect(twice.text).toBe(once.text);
  expect(twice.updated_lines).toBe(0);
});

test('applyLinearUrlsToPlan: replaces an existing URL in-place when the map carries a new one', () => {
  const initial = new Map<string, string>([
    ['design-1', 'https://linear.app/x/issue/OLD-1'],
  ]);
  const first = applyLinearUrlsToPlan(PLAN, initial);
  expect(first.text).toContain(
    '### Phase 1 [design-1] — Design ([linear](https://linear.app/x/issue/OLD-1))',
  );

  const updated = new Map<string, string>([
    ['design-1', 'https://linear.app/x/issue/NEW-1'],
  ]);
  const second = applyLinearUrlsToPlan(first.text, updated);
  expect(second.updated_lines).toBe(1);
  expect(second.text).toContain(
    '### Phase 1 [design-1] — Design ([linear](https://linear.app/x/issue/NEW-1))',
  );
  expect(second.text).not.toContain('OLD-1');
});

test('applyLinearUrlsToPlan: only annotates lines whose composed_key is in the map', () => {
  const urls = new Map<string, string>([
    ['design-1', 'https://linear.app/x/issue/L-1'],
    // No entry for sketch-1; should stay un-annotated.
  ]);
  const result = applyLinearUrlsToPlan(PLAN, urls);

  expect(result.updated_lines).toBe(1);
  // Annotated:
  expect(result.text).toContain(
    '### Phase 1 [design-1] — Design ([linear]',
  );
  // Not annotated:
  expect(result.text).toContain('- [sketch-1] Sketch\n');
  expect(result.text).not.toMatch(/\[sketch-1\][^\n]*\[linear\]/);
});

test('applyLinearUrlsToPlan: preserves content outside the ## Phases block', () => {
  const urls = new Map<string, string>([
    ['design-1', 'https://linear.app/x/issue/L-1'],
  ]);
  const result = applyLinearUrlsToPlan(PLAN, urls);
  expect(result.text).toContain('## Context\n\nSome prose.');
  expect(result.text).toContain('## Risks\n\nTrailing prose not parsed.');
});

test('applyLinearUrlsToPlan: leaves lines unchanged when the map is fully unrelated', () => {
  const urls = new Map<string, string>([
    ['no-such-key', 'https://linear.app/x/issue/Z'],
  ]);
  const result = applyLinearUrlsToPlan(PLAN, urls);
  expect(result.text).toBe(PLAN);
  expect(result.updated_lines).toBe(0);
});

test('applyLinearUrlsToPlan: rejects empty-string url in the map (skipped, not annotated as broken link)', () => {
  const urls = new Map<string, string>([['design-1', '']]);
  const result = applyLinearUrlsToPlan(PLAN, urls);
  expect(result.text).toBe(PLAN);
  expect(result.updated_lines).toBe(0);
});
