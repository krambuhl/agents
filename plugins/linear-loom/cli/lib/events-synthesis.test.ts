import { test, expect } from 'vitest';
import {
  parseCheckinHeaderFromComment,
  synthesizeFromLinear,
  type SynthesisInput,
} from './events-synthesis.ts';

function baseInput(): SynthesisInput {
  return {
    slug: 'my-thing',
    project: { createdAt: '2026-05-22T19:00:00.000Z' },
    milestones: [],
    issues: [],
  };
}

const U2_RENDERED_BODY = `# U2 — checkin write

**Phase**: 6 — Manual write-back verbs
**Branch**: \`ev-agent.linear-loom.checkin-write\`
**Checkin number**: 01
**Created**: 2026-05-23T17:20:00.000Z
**Verdict**: approved

## Goal

Ship the checkin-write verb.
`;

test('synthesizeFromLinear: emits a single project-initialized event when only project metadata is present', () => {
  const result = synthesizeFromLinear(baseInput());
  expect(result).toEqual([
    {
      at: '2026-05-22T19:00:00.000Z',
      event: 'project-initialized',
      detail: {},
    },
  ]);
});

test('synthesizeFromLinear: emits one phase-started per milestone whose name parses', () => {
  const input = baseInput();
  input.milestones = [
    {
      id: 'm-1',
      name: 'my-thing · Phase 1 — Design',
      createdAt: '2026-05-22T19:05:00.000Z',
    },
    {
      id: 'm-2',
      name: 'my-thing · Phase 2 — Build',
      createdAt: '2026-05-22T19:06:00.000Z',
    },
  ];
  const result = synthesizeFromLinear(input);
  expect(result).toHaveLength(3);
  expect(result[1]).toEqual({
    at: '2026-05-22T19:05:00.000Z',
    event: 'phase-started',
    detail: { phase: 1, name: 'Design' },
  });
  expect(result[2]).toEqual({
    at: '2026-05-22T19:06:00.000Z',
    event: 'phase-started',
    detail: { phase: 2, name: 'Build' },
  });
});

test('synthesizeFromLinear: skips milestones whose names do not parse (e.g. unrelated milestones in the same project)', () => {
  const input = baseInput();
  input.milestones = [
    {
      id: 'm-x',
      name: 'Some unrelated milestone',
      createdAt: '2026-05-22T19:05:00.000Z',
    },
    {
      id: 'm-1',
      name: 'my-thing · Phase 1 — Design',
      createdAt: '2026-05-22T19:06:00.000Z',
    },
  ];
  const result = synthesizeFromLinear(input);
  expect(result.filter((e) => e.event === 'phase-started')).toHaveLength(1);
});

test('synthesizeFromLinear: emits one checkin-created per Sub-Issue comment whose body parses as a U2-rendered checkin', () => {
  const input = baseInput();
  input.issues = [
    {
      id: 'i-1',
      comments: [
        {
          id: 'c-1',
          createdAt: '2026-05-23T17:25:00.000Z',
          body: U2_RENDERED_BODY,
        },
      ],
    },
  ];
  const result = synthesizeFromLinear(input);
  expect(result.filter((e) => e.event === 'checkin-created')).toEqual([
    {
      at: '2026-05-23T17:25:00.000Z',
      event: 'checkin-created',
      detail: {
        number: '01',
        branch: 'ev-agent.linear-loom.checkin-write',
      },
    },
  ]);
});

test('synthesizeFromLinear: skips comments that lack the U2 checkin header pair (free-form comments stay out of the audit trail)', () => {
  const input = baseInput();
  input.issues = [
    {
      id: 'i-1',
      comments: [
        {
          id: 'c-1',
          createdAt: '2026-05-23T17:25:00.000Z',
          body: 'Just a free-form comment from the operator — not a checkin.',
        },
      ],
    },
  ];
  const result = synthesizeFromLinear(input);
  expect(result.filter((e) => e.event === 'checkin-created')).toHaveLength(0);
});

test('synthesizeFromLinear: sorts events by `at` ascending across project / milestone / comment sources', () => {
  const input = baseInput();
  input.project.createdAt = '2026-05-22T19:00:00.000Z';
  input.milestones = [
    {
      id: 'm-2',
      name: 'my-thing · Phase 2 — Build',
      createdAt: '2026-05-22T20:00:00.000Z',
    },
    {
      id: 'm-1',
      name: 'my-thing · Phase 1 — Design',
      createdAt: '2026-05-22T19:30:00.000Z',
    },
  ];
  input.issues = [
    {
      id: 'i-1',
      comments: [
        {
          id: 'c-1',
          createdAt: '2026-05-22T19:45:00.000Z',
          body: U2_RENDERED_BODY,
        },
      ],
    },
  ];
  const result = synthesizeFromLinear(input);
  const timestamps = result.map((e) => e.at);
  expect(timestamps).toEqual([
    '2026-05-22T19:00:00.000Z', // project-initialized
    '2026-05-22T19:30:00.000Z', // phase-started Phase 1
    '2026-05-22T19:45:00.000Z', // checkin-created
    '2026-05-22T20:00:00.000Z', // phase-started Phase 2
  ]);
});

test('parseCheckinHeaderFromComment: extracts {number, branch} from a U2-rendered body', () => {
  expect(parseCheckinHeaderFromComment(U2_RENDERED_BODY)).toEqual({
    number: '01',
    branch: 'ev-agent.linear-loom.checkin-write',
  });
});

test('parseCheckinHeaderFromComment: returns null when either header line is missing', () => {
  const onlyNumber = '**Checkin number**: 01\n\nNo branch line here.';
  const onlyBranch = '**Branch**: `feature-x`\n\nNo checkin number line.';
  expect(parseCheckinHeaderFromComment(onlyNumber)).toBeNull();
  expect(parseCheckinHeaderFromComment(onlyBranch)).toBeNull();
});

test('parseCheckinHeaderFromComment: returns null for a completely unrelated body', () => {
  expect(parseCheckinHeaderFromComment('Hello world.')).toBeNull();
  expect(parseCheckinHeaderFromComment('')).toBeNull();
});
