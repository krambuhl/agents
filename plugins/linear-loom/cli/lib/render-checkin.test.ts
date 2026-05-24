import { test, expect } from 'vitest';
import {
  parseCheckinFile,
  renderCheckinToMarkdown,
  type Checkin,
} from './render-checkin.ts';
import { LinearLoomError } from './errors.ts';

function baseCheckin(): Checkin {
  return {
    schema_version: 1,
    number: '01',
    created: '2026-05-23T20:00:00.000Z',
    phase: { number: 6, name: 'Manual write-back verbs' },
    branch: 'ev-agent.linear-loom.checkin-write',
    unit: 'U2 — linear-loom checkin write',
    contract: {
      goal: 'Ship the checkin-write verb.',
      acceptance_criteria: ['First criterion.', 'Second criterion.'],
      rules_applied: ['DESIGN.md § 7.'],
      disqualifiers: ['No edits of existing comments.'],
      inputs: ['plugins/linear-loom/docs/DESIGN.md § 7'],
    },
    execution: {
      actions: ['Wrote the lib.', 'Wrote the verb.'],
      files_touched: ['cli/lib/render-checkin.ts', 'cli/verbs/checkin.ts'],
      corrections: [],
    },
    scope: [],
    changes_since_previous: 'Second unit of Phase 6.',
    verdict: { result: 'approved', reasons: [] },
    notes_for_pr: ['Notable observation about idempotency.'],
  };
}

test('renderCheckinToMarkdown: renders header + metadata + goal + numbered ACs', () => {
  const md = renderCheckinToMarkdown(baseCheckin());
  expect(md).toContain('# U2 — linear-loom checkin write');
  expect(md).toContain('**Phase**: 6 — Manual write-back verbs');
  expect(md).toContain('**Branch**: `ev-agent.linear-loom.checkin-write`');
  expect(md).toContain('**Checkin number**: 01');
  expect(md).toContain('**Verdict**: approved');
  expect(md).toContain('## Goal\n\nShip the checkin-write verb.');
  expect(md).toContain('1. First criterion.\n2. Second criterion.');
});

test('renderCheckinToMarkdown: elides sections whose arrays are empty', () => {
  const c = baseCheckin();
  c.contract.rules_applied = [];
  c.contract.disqualifiers = [];
  c.contract.inputs = [];
  c.execution.corrections = [];
  c.scope = [];
  c.notes_for_pr = [];
  const md = renderCheckinToMarkdown(c);
  expect(md).not.toContain('## Rules applied');
  expect(md).not.toContain('## Disqualifiers');
  expect(md).not.toContain('## Inputs');
  expect(md).not.toContain('## Corrections');
  expect(md).not.toContain('## Scope');
  expect(md).not.toContain('## Notes for the PR');
  // Goal / Acceptance criteria / Actions / Files touched / Changes
  // since previous all still present.
  expect(md).toContain('## Goal');
  expect(md).toContain('## Acceptance criteria');
  expect(md).toContain('## Actions');
});

test('renderCheckinToMarkdown: flagged verdict appends Verdict reasons section', () => {
  const c = baseCheckin();
  c.verdict = {
    result: 'flagged',
    reasons: ['Naming inconsistency on FooBar.', 'Missing test coverage.'],
  };
  const md = renderCheckinToMarkdown(c);
  expect(md).toContain('**Verdict**: flagged');
  expect(md).toContain(
    '## Verdict reasons\n\n- Naming inconsistency on FooBar.\n- Missing test coverage.',
  );
});

test('renderCheckinToMarkdown: scope section renders when scope is non-empty', () => {
  const c = baseCheckin();
  c.scope = ['plugins/linear-loom/cli/lib/render-checkin.ts'];
  const md = renderCheckinToMarkdown(c);
  expect(md).toContain(
    '## Scope\n\n- plugins/linear-loom/cli/lib/render-checkin.ts',
  );
});

test('renderCheckinToMarkdown: elides Changes since previous when string is empty / whitespace-only', () => {
  const c = baseCheckin();
  c.changes_since_previous = '   ';
  const md = renderCheckinToMarkdown(c);
  expect(md).not.toContain('## Changes since previous');
});

test('parseCheckinFile: accepts a valid Checkin record', () => {
  const raw = JSON.stringify(baseCheckin());
  const parsed = parseCheckinFile(raw);
  expect(parsed.unit).toBe('U2 — linear-loom checkin write');
  expect(parsed.contract.acceptance_criteria).toHaveLength(2);
});

test('parseCheckinFile: throws checkin-invalid-json on syntax error', () => {
  expect.assertions(2);
  try {
    parseCheckinFile('{not json');
  } catch (err) {
    expect(err).toBeInstanceOf(LinearLoomError);
    expect((err as LinearLoomError).code).toBe('checkin-invalid-json');
  }
});

test('parseCheckinFile: throws checkin-schema-invalid on missing top-level field', () => {
  const c = baseCheckin() as Partial<Checkin>;
  delete c.verdict;
  expect.assertions(2);
  try {
    parseCheckinFile(JSON.stringify(c));
  } catch (err) {
    expect(err).toBeInstanceOf(LinearLoomError);
    expect((err as LinearLoomError).code).toBe('checkin-schema-invalid');
  }
});

test('parseCheckinFile: throws checkin-schema-invalid on missing nested field', () => {
  const c = baseCheckin();
  delete (c.contract as Partial<Checkin['contract']>).disqualifiers;
  expect.assertions(2);
  try {
    parseCheckinFile(JSON.stringify(c));
  } catch (err) {
    expect(err).toBeInstanceOf(LinearLoomError);
    expect((err as LinearLoomError).code).toBe('checkin-schema-invalid');
  }
});

test('parseCheckinFile: throws checkin-schema-invalid on unsupported schema_version', () => {
  const c = baseCheckin();
  (c as { schema_version: number }).schema_version = 2;
  expect.assertions(2);
  try {
    parseCheckinFile(JSON.stringify(c));
  } catch (err) {
    expect(err).toBeInstanceOf(LinearLoomError);
    expect((err as LinearLoomError).code).toBe('checkin-schema-invalid');
  }
});
