import { test, expect } from 'vitest';
import { appendRevisionLogEntry } from './revision-log.ts';

test('appendRevisionLogEntry: appends a fresh ## Revision log section when none exists', () => {
  const content = '# PLAN\n\nSome body.\n';
  const result = appendRevisionLogEntry(content, '2026-05-24', 'First revision.');
  expect(result).toContain('## Revision log');
  expect(result).toContain('- 2026-05-24 — First revision.');
  // The new section sits at the end of the document.
  expect(result.endsWith('- 2026-05-24 — First revision.\n')).toBe(true);
});

test('appendRevisionLogEntry: inserts newest entry directly under existing heading (newest-first)', () => {
  const content = `# PLAN

Some body.

## Revision log

- 2026-05-22 — Earlier revision.
`;
  const result = appendRevisionLogEntry(content, '2026-05-24', 'Newer revision.');
  // The newer entry appears above the earlier one.
  const newerIdx = result.indexOf('Newer revision.');
  const earlierIdx = result.indexOf('Earlier revision.');
  expect(newerIdx).toBeGreaterThan(-1);
  expect(earlierIdx).toBeGreaterThan(-1);
  expect(newerIdx).toBeLessThan(earlierIdx);
});

test('appendRevisionLogEntry: tolerates multi-blank gap between heading and existing entries (existing whitespace preserved as-is per loom shape)', () => {
  // Matches loom's helper shape: the greedy `\s*` in the heading regex
  // consumes trailing whitespace after the heading, so `before`
  // already carries the heading-trailing newlines and the inserted
  // entry sits below them. This is loom-side observed behavior, not a
  // separate normalization contract — kept here so the linear-loom
  // helper stays drift-aligned with loom.
  const content = `# PLAN

## Revision log


- 2026-05-22 — Old.
`;
  const result = appendRevisionLogEntry(content, '2026-05-24', 'New.');
  // The new entry lands below the heading and above the old entry.
  const newerIdx = result.indexOf('- 2026-05-24 — New.');
  const olderIdx = result.indexOf('- 2026-05-22 — Old.');
  const headingIdx = result.indexOf('## Revision log');
  expect(headingIdx).toBeGreaterThan(-1);
  expect(newerIdx).toBeGreaterThan(headingIdx);
  expect(newerIdx).toBeLessThan(olderIdx);
});

test('appendRevisionLogEntry: handles content that does not end in a newline', () => {
  const content = '# PLAN\n\nBody without trailing newline.';
  const result = appendRevisionLogEntry(content, '2026-05-24', 'Edge case.');
  expect(result).toContain('## Revision log');
  expect(result).toContain('- 2026-05-24 — Edge case.');
});
