import { test, expect, vi } from 'vitest';
import { eventsRead } from './events.ts';
import { LinearClient } from '../lib/linear-client.ts';
import type { LinearMarker } from '../lib/marker.ts';

const SAMPLE_MARKER: LinearMarker = {
  schema_version: 1,
  slug: 'my-thing',
  linear_project_id: 'lin-proj-1',
  linear_project_name: 'My Sandbox',
  label: 'loom-project:my-thing',
  created: '2026-05-22T19:00:00.000Z',
};

const stubAuth = () => () => ({
  apiKey: 'lin_api_test',
  source: 'env' as const,
});

const markerIOReturning = (marker: LinearMarker | null) => ({
  readFile: () => {
    if (marker === null) throw new Error('ENOENT');
    return JSON.stringify(marker);
  },
  writeFile: () => {},
  exists: () => marker !== null,
  mkdir: () => {},
});

const U2_RENDERED_BODY = `# U2 — checkin write

**Phase**: 6 — Manual write-back verbs
**Branch**: \`ev-agent.linear-loom.checkin-write\`
**Checkin number**: 01
**Created**: 2026-05-23T17:20:00.000Z
**Verdict**: approved
`;

function fullProjectResponse() {
  return {
    data: {
      project: {
        id: 'lin-proj-1',
        createdAt: '2026-05-22T19:00:00.000Z',
        projectMilestones: {
          nodes: [
            {
              id: 'm-1',
              name: 'my-thing · Phase 1 — Design',
              createdAt: '2026-05-22T19:30:00.000Z',
            },
            {
              id: 'm-2',
              name: 'my-thing · Phase 2 — Build',
              createdAt: '2026-05-22T20:00:00.000Z',
            },
          ],
        },
      },
      issues: {
        nodes: [
          {
            id: 'i-1',
            comments: {
              nodes: [
                {
                  id: 'c-1',
                  createdAt: '2026-05-23T17:25:00.000Z',
                  body: U2_RENDERED_BODY,
                },
                {
                  id: 'c-2',
                  createdAt: '2026-05-23T17:30:00.000Z',
                  body: 'Just a free-form comment — should be skipped.',
                },
              ],
            },
          },
        ],
      },
    },
  };
}

function projectNotFoundResponse() {
  return { data: { project: null, issues: { nodes: [] } } };
}

function clientReturning(response: unknown) {
  return new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn: vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve(response),
      }),
    ),
    sleepFn: () => Promise.resolve(),
  });
}

test('eventsRead: errors with missing-slug when no positional', async () => {
  const result = await eventsRead([], {
    resolveAuthFn: stubAuth(),
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-slug');
});

test('eventsRead: errors with invalid-limit when --limit is not a non-negative integer', async () => {
  const result = await eventsRead(
    ['my-thing', '--limit=xyz'],
    {
      resolveAuthFn: stubAuth(),
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('invalid-limit');
});

test('eventsRead: errors with invalid-since when --since is not a parseable date', async () => {
  const result = await eventsRead(
    ['my-thing', '--since=not-a-date'],
    {
      resolveAuthFn: stubAuth(),
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('invalid-since');
});

test('eventsRead: errors with linear-project-not-found when the project query returns null', async () => {
  const result = await eventsRead(
    ['my-thing'],
    {
      client: clientReturning(projectNotFoundResponse()),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('linear-project-not-found');
});

test('eventsRead: emits {schema_version, slug, events} JSON with sorted, full-trio coverage', async () => {
  const result = await eventsRead(
    ['my-thing'],
    {
      client: clientReturning(fullProjectResponse()),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.schema_version).toBe(1);
  expect(parsed.slug).toBe('my-thing');
  expect(parsed.events).toHaveLength(4);
  expect(parsed.events.map((e: { event: string }) => e.event)).toEqual([
    'project-initialized',
    'phase-started',
    'phase-started',
    'checkin-created',
  ]);
});

test('eventsRead: --event filters to a single event type', async () => {
  const result = await eventsRead(
    ['my-thing', '--event=phase-started'],
    {
      client: clientReturning(fullProjectResponse()),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.events).toHaveLength(2);
  expect(
    parsed.events.every((e: { event: string }) => e.event === 'phase-started'),
  ).toBe(true);
});

test('eventsRead: --since filters to events at or after the given timestamp', async () => {
  const result = await eventsRead(
    ['my-thing', '--since=2026-05-23T00:00:00.000Z'],
    {
      client: clientReturning(fullProjectResponse()),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  // Only the checkin-created event (2026-05-23T17:25:00) is on/after
  // the cutoff. The three earlier events are filtered out.
  expect(parsed.events).toHaveLength(1);
  expect(parsed.events[0].event).toBe('checkin-created');
});

test('eventsRead: --limit caps the result count', async () => {
  const result = await eventsRead(
    ['my-thing', '--limit=2'],
    {
      client: clientReturning(fullProjectResponse()),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.events).toHaveLength(2);
});

test('eventsRead: --pretty pretty-prints the JSON output', async () => {
  const result = await eventsRead(
    ['my-thing', '--pretty'],
    {
      client: clientReturning(fullProjectResponse()),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('\n  ');
});
