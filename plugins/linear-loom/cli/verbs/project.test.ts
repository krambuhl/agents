import { test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectCreate, projectRead, projectStatus } from './project.ts';
import { LinearClient } from '../lib/linear-client.ts';
import type { LinearMarker } from '../lib/marker.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(
  __dirname,
  '..',
  '..',
  'contracts',
  'project-read.schema.json',
);

const FAKE_NOW = '2026-05-22T19:00:00.000Z';

function stubAuth() {
  return () => ({ apiKey: 'lin_api_test', source: 'env' as const });
}

interface FakeResponseShape {
  data?: unknown;
  errors?: Array<{ message: string }>;
}

function clientWithResponses(responses: FakeResponseShape[]) {
  const fetchFn = vi.fn();
  for (const r of responses) {
    fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve(r),
    });
  }
  return new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn,
    sleepFn: () => Promise.resolve(),
  });
}

function noopMarkerIO() {
  const writes: Array<[string, string]> = [];
  return {
    io: {
      readFile: (_path: string) => {
        throw new Error('ENOENT');
      },
      writeFile: (path: string, content: string) => writes.push([path, content]),
      exists: () => false,
      mkdir: () => {},
    },
    writes,
  };
}

test('projectCreate: errors on missing slug', async () => {
  const result = await projectCreate([], {
    client: clientWithResponses([]),
    resolveAuthFn: stubAuth(),
  });
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('missing-slug');
  expect(parsed.verb).toBe('create');
});

test('projectCreate: errors on missing --linear-project flag', async () => {
  const result = await projectCreate(['my-thing'], {
    client: clientWithResponses([]),
    resolveAuthFn: stubAuth(),
  });
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('missing-linear-project');
});

test('projectCreate: errors when marker already exists', async () => {
  const { io } = noopMarkerIO();
  const result = await projectCreate(
    ['my-thing', '--linear-project=p-1'],
    {
      client: clientWithResponses([]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: { ...io, exists: () => true },
    },
  );
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('project-already-exists');
});

test('projectCreate: errors when Linear Project not found', async () => {
  const { io } = noopMarkerIO();
  const result = await projectCreate(
    ['my-thing', '--linear-project=ghost-id'],
    {
      client: clientWithResponses([{ data: { project: null } }]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: io,
    },
  );
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('linear-project-not-found');
});

test('projectCreate: creates label when none exists; writes marker', async () => {
  const { io, writes } = noopMarkerIO();
  const result = await projectCreate(
    ['my-thing', '--linear-project=p-1'],
    {
      client: clientWithResponses([
        { data: { project: { id: 'p-1', name: 'Sandbox' } } },
        { data: { issueLabels: { nodes: [] } } },
        {
          data: {
            issueLabelCreate: {
              success: true,
              issueLabel: { id: 'lbl-1', name: 'loom-project:my-thing' },
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: io,
      now: () => FAKE_NOW,
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.marker_path).toBe('/tmp/projects/my-thing/linear.json');
  expect(parsed.marker).toEqual({
    schema_version: 1,
    slug: 'my-thing',
    linear_project_id: 'p-1',
    linear_project_name: 'Sandbox',
    label: 'loom-project:my-thing',
    created: FAKE_NOW,
  });
  expect(parsed.label).toEqual({
    id: 'lbl-1',
    name: 'loom-project:my-thing',
    created: true,
  });
  expect(writes).toHaveLength(1);
  expect(writes[0]![0]).toBe('/tmp/projects/my-thing/linear.json');
});

test('projectCreate: reuses existing label without re-creating', async () => {
  const { io } = noopMarkerIO();
  const result = await projectCreate(
    ['my-thing', '--linear-project=p-1'],
    {
      client: clientWithResponses([
        { data: { project: { id: 'p-1', name: 'Sandbox' } } },
        {
          data: {
            issueLabels: {
              nodes: [{ id: 'existing-id', name: 'loom-project:my-thing' }],
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: io,
      now: () => FAKE_NOW,
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.label).toEqual({
    id: 'existing-id',
    name: 'loom-project:my-thing',
    created: false,
  });
});

test('projectCreate: errors when issueLabelCreate reports success=false', async () => {
  const { io } = noopMarkerIO();
  const result = await projectCreate(
    ['my-thing', '--linear-project=p-1'],
    {
      client: clientWithResponses([
        { data: { project: { id: 'p-1', name: 'Sandbox' } } },
        { data: { issueLabels: { nodes: [] } } },
        {
          data: {
            issueLabelCreate: { success: false, issueLabel: null },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: io,
    },
  );
  expect(result.exitCode).toBe(1);
  const parsed = JSON.parse(result.stderr ?? '');
  expect(parsed.error).toBe('label-create-failed');
});

// ─── projectRead ─────────────────────────────────────────────────────────

const SAMPLE_MARKER: LinearMarker = {
  schema_version: 1,
  slug: 'my-thing',
  linear_project_id: 'lin-proj-1',
  linear_project_name: 'My Sandbox',
  label: 'loom-project:my-thing',
  created: '2026-05-22T19:00:00.000Z',
};

function markerIOReturning(marker: LinearMarker | null) {
  return {
    readFile: () => {
      if (marker === null) throw new Error('ENOENT');
      return JSON.stringify(marker);
    },
    writeFile: () => {},
    exists: () => marker !== null,
    mkdir: () => {},
  };
}

test('projectRead: errors on missing slug', async () => {
  const result = await projectRead([], {
    client: clientWithResponses([]),
    resolveAuthFn: stubAuth(),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-slug');
});

test('projectRead: surfaces marker-unreadable when marker missing', async () => {
  const result = await projectRead(['my-thing'], {
    client: clientWithResponses([]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(null),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('marker-unreadable');
});

test('projectRead: linear-project-not-found when Linear returns null', async () => {
  const result = await projectRead(['my-thing'], {
    client: clientWithResponses([{ data: { project: null } }]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('linear-project-not-found');
});

test('projectRead: emits loom-compatible shape with parsed phases', async () => {
  const result = await projectRead(['my-thing'], {
    client: clientWithResponses([
      {
        data: {
          project: {
            id: 'lin-proj-1',
            name: 'My Sandbox',
            url: 'https://linear.app/.../proj/lin-proj-1',
            projectMilestones: {
              nodes: [
                {
                  id: 'm-1',
                  name: 'my-thing · Phase 1 — DESIGN.md',
                  sortOrder: 1,
                  state: 'completed',
                  targetDate: null,
                },
                {
                  id: 'm-2',
                  name: 'my-thing · Phase 2 — Plugin scaffolding',
                  sortOrder: 2,
                  state: 'started',
                  targetDate: '2026-06-01',
                },
                {
                  id: 'm-3',
                  name: 'other-loom-project · Phase 1 — unrelated',
                  sortOrder: 3,
                  state: 'backlog',
                  targetDate: null,
                },
              ],
            },
          },
        },
      },
    ]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.schema_version).toBe(1);
  expect(parsed.slug).toBe('my-thing');
  expect(parsed.title).toBe('My Sandbox');
  expect(parsed.started).toBe(SAMPLE_MARKER.created);
  expect(parsed.status).toBe('active');
  expect(parsed.linear).toEqual({
    project_id: 'lin-proj-1',
    project_name: 'My Sandbox',
    project_url: 'https://linear.app/.../proj/lin-proj-1',
  });
  expect(parsed.phases).toHaveLength(2);
  expect(parsed.phases[0]).toEqual({
    number: 1,
    name: 'DESIGN.md',
    status: 'completed',
    linear_milestone_id: 'm-1',
  });
  expect(parsed.phases[1]).toEqual({
    number: 2,
    name: 'Plugin scaffolding',
    status: 'in-progress',
    linear_milestone_id: 'm-2',
    target_date: '2026-06-01',
  });
});

test('projectRead: maps Linear milestone states correctly', async () => {
  const result = await projectRead(['my-thing'], {
    client: clientWithResponses([
      {
        data: {
          project: {
            id: 'lin-proj-1',
            name: 'My Sandbox',
            url: 'https://linear.app/',
            projectMilestones: {
              nodes: [
                { id: 'a', name: 'my-thing · Phase 1 — A', sortOrder: 1, state: 'backlog', targetDate: null },
                { id: 'b', name: 'my-thing · Phase 2 — B', sortOrder: 2, state: 'unstarted', targetDate: null },
                { id: 'c', name: 'my-thing · Phase 3 — C', sortOrder: 3, state: 'started', targetDate: null },
                { id: 'd', name: 'my-thing · Phase 4 — D', sortOrder: 4, state: 'completed', targetDate: null },
                { id: 'e', name: 'my-thing · Phase 5 — E', sortOrder: 5, state: 'canceled', targetDate: null },
                { id: 'f', name: 'my-thing · Phase 6 — F', sortOrder: 6, state: 'mystery', targetDate: null },
                { id: 'g', name: 'my-thing · Phase 7 — G', sortOrder: 7, state: null, targetDate: null },
              ],
            },
          },
        },
      },
    ]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.phases.map((p: { status: string }) => p.status)).toEqual([
    'not-started',
    'not-started',
    'in-progress',
    'completed',
    'canceled',
    'unknown',
    'unknown',
  ]);
});

test('projectRead: skips milestones that do not match the slug prefix or Phase N pattern', async () => {
  const result = await projectRead(['my-thing'], {
    client: clientWithResponses([
      {
        data: {
          project: {
            id: 'lin-proj-1',
            name: 'My Sandbox',
            url: 'https://linear.app/',
            projectMilestones: {
              nodes: [
                { id: 'good', name: 'my-thing · Phase 1 — Real', sortOrder: 1, state: 'started', targetDate: null },
                { id: 'noprefix', name: 'Phase 1 — Missing slug prefix', sortOrder: 2, state: 'started', targetDate: null },
                { id: 'wrong', name: 'my-thing · Sprint 4', sortOrder: 3, state: 'started', targetDate: null },
                { id: 'other-slug', name: 'other · Phase 1 — Different project', sortOrder: 4, state: 'started', targetDate: null },
              ],
            },
          },
        },
      },
    ]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.phases).toHaveLength(1);
  expect(parsed.phases[0].linear_milestone_id).toBe('good');
});

test('projectRead: phases sorted by number even when Linear returns out of order', async () => {
  const result = await projectRead(['my-thing'], {
    client: clientWithResponses([
      {
        data: {
          project: {
            id: 'lin-proj-1',
            name: 'My Sandbox',
            url: 'https://linear.app/',
            projectMilestones: {
              nodes: [
                { id: 'p3', name: 'my-thing · Phase 3 — C', sortOrder: 3, state: 'started', targetDate: null },
                { id: 'p1', name: 'my-thing · Phase 1 — A', sortOrder: 1, state: 'completed', targetDate: null },
                { id: 'p2', name: 'my-thing · Phase 2 — B', sortOrder: 2, state: 'started', targetDate: null },
              ],
            },
          },
        },
      },
    ]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.phases.map((p: { number: number }) => p.number)).toEqual([1, 2, 3]);
});

test('projectRead: --pretty pretty-prints', async () => {
  const result = await projectRead(['my-thing', '--pretty'], {
    client: clientWithResponses([
      {
        data: {
          project: {
            id: 'lin-proj-1',
            name: 'My Sandbox',
            url: 'https://linear.app/',
            projectMilestones: { nodes: [] },
          },
        },
      },
    ]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('\n  ');
});

// ─── projectStatus ───────────────────────────────────────────────────────

function statusResponse(opts: {
  projectName?: string;
  milestones?: Array<{
    id: string;
    name: string;
    sortOrder: number;
    state: string | null;
  }>;
  issues?: Array<{
    id: string;
    identifier: string;
    title: string;
    url: string;
    updatedAt: string;
    state: { name: string; type: string };
  }>;
}) {
  return {
    data: {
      project:
        opts.projectName === null
          ? null
          : {
              id: 'lin-proj-1',
              name: opts.projectName ?? 'My Sandbox',
              url: 'https://linear.app/proj-1',
              projectMilestones: {
                nodes: opts.milestones ?? [],
              },
            },
      issues: {
        nodes: opts.issues ?? [],
      },
    },
  };
}

test('projectStatus: errors on missing slug', async () => {
  const result = await projectStatus([], {
    client: clientWithResponses([]),
    resolveAuthFn: stubAuth(),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-slug');
});

test('projectStatus: surfaces marker-unreadable when marker missing', async () => {
  const result = await projectStatus(['my-thing'], {
    client: clientWithResponses([]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(null),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('marker-unreadable');
});

test('projectStatus: emits summary with in-progress phase + active tasks', async () => {
  const result = await projectStatus(['my-thing'], {
    client: clientWithResponses([
      statusResponse({
        milestones: [
          { id: 'm-1', name: 'my-thing · Phase 1 — Setup', sortOrder: 1, state: 'completed' },
          { id: 'm-2', name: 'my-thing · Phase 2 — Build', sortOrder: 2, state: 'started' },
          { id: 'm-3', name: 'my-thing · Phase 3 — Ship', sortOrder: 3, state: 'backlog' },
        ],
        issues: [
          { id: 'i-1', identifier: 'ENG-101', title: 'Task A', url: 'https://l/1', updatedAt: '2026-05-22T12:00:00.000Z', state: { name: 'In Progress', type: 'started' } },
          { id: 'i-2', identifier: 'ENG-102', title: 'Task B', url: 'https://l/2', updatedAt: '2026-05-22T11:00:00.000Z', state: { name: 'Todo', type: 'unstarted' } },
        ],
      }),
    ]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.slug).toBe('my-thing');
  expect(parsed.title).toBe('My Sandbox');
  expect(parsed.linear_url).toBe('https://linear.app/proj-1');
  expect(parsed.current_phase).toEqual({
    number: 2,
    name: 'Build',
    status: 'in-progress',
    linear_milestone_id: 'm-2',
  });
  expect(parsed.active_tasks).toHaveLength(2);
  expect(parsed.active_tasks[0]).toEqual({
    identifier: 'ENG-101',
    title: 'Task A',
    state: 'In Progress',
    url: 'https://l/1',
    updated_at: '2026-05-22T12:00:00.000Z',
  });
  expect(parsed.active_task_count).toBe(2);
  expect(parsed.summary).toBe('Phase 2 — Build (in-progress). 2 active tasks.');
});

test('projectStatus: falls back to earliest not-started when no in-progress phase', async () => {
  const result = await projectStatus(['my-thing'], {
    client: clientWithResponses([
      statusResponse({
        milestones: [
          { id: 'm-1', name: 'my-thing · Phase 1 — Setup', sortOrder: 1, state: 'completed' },
          { id: 'm-2', name: 'my-thing · Phase 2 — Build', sortOrder: 2, state: 'backlog' },
        ],
        issues: [],
      }),
    ]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.current_phase.number).toBe(2);
  expect(parsed.current_phase.status).toBe('not-started');
  expect(parsed.summary).toBe('Phase 2 — Build (not-started). 0 active tasks.');
});

test('projectStatus: current_phase null + no-phase summary when all phases done', async () => {
  const result = await projectStatus(['my-thing'], {
    client: clientWithResponses([
      statusResponse({
        milestones: [
          { id: 'm-1', name: 'my-thing · Phase 1 — Done', sortOrder: 1, state: 'completed' },
        ],
        issues: [],
      }),
    ]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.current_phase).toBeNull();
  expect(parsed.summary).toBe('No active or upcoming phase. 0 active tasks.');
});

test('projectStatus: filters out completed and canceled tasks from active_tasks', async () => {
  const result = await projectStatus(['my-thing'], {
    client: clientWithResponses([
      statusResponse({
        milestones: [
          { id: 'm', name: 'my-thing · Phase 1 — X', sortOrder: 1, state: 'started' },
        ],
        issues: [
          { id: '1', identifier: 'ENG-1', title: 'Active', url: 'u', updatedAt: 't', state: { name: 'In Progress', type: 'started' } },
          { id: '2', identifier: 'ENG-2', title: 'Done', url: 'u', updatedAt: 't', state: { name: 'Done', type: 'completed' } },
          { id: '3', identifier: 'ENG-3', title: 'Killed', url: 'u', updatedAt: 't', state: { name: 'Canceled', type: 'canceled' } },
          { id: '4', identifier: 'ENG-4', title: 'Backlog', url: 'u', updatedAt: 't', state: { name: 'Backlog', type: 'backlog' } },
        ],
      }),
    ]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.active_tasks.map((t: { identifier: string }) => t.identifier)).toEqual([
    'ENG-1',
    'ENG-4',
  ]);
});

test('projectStatus: caps active_tasks at ACTIVE_TASK_LIMIT (20)', async () => {
  const issues = Array.from({ length: 30 }, (_, i) => ({
    id: `i-${i}`,
    identifier: `ENG-${i}`,
    title: `Task ${i}`,
    url: `https://l/${i}`,
    updatedAt: `2026-05-22T${String(i % 24).padStart(2, '0')}:00:00.000Z`,
    state: { name: 'In Progress', type: 'started' },
  }));
  const result = await projectStatus(['my-thing'], {
    client: clientWithResponses([
      statusResponse({
        milestones: [
          { id: 'm', name: 'my-thing · Phase 1 — X', sortOrder: 1, state: 'started' },
        ],
        issues,
      }),
    ]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.active_tasks).toHaveLength(20);
  expect(parsed.active_task_count).toBe(20);
});

test('projectStatus: --pretty pretty-prints', async () => {
  const result = await projectStatus(['my-thing', '--pretty'], {
    client: clientWithResponses([
      statusResponse({
        milestones: [],
        issues: [],
      }),
    ]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(SAMPLE_MARKER),
  });
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('\n  ');
});

test('contracts/project-read.schema.json: parses and gates the output shape', () => {
  const raw = readFileSync(SCHEMA_PATH, 'utf8');
  const schema = JSON.parse(raw);
  expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#');
  expect(schema.required).toEqual(
    expect.arrayContaining([
      'schema_version',
      'slug',
      'title',
      'started',
      'status',
      'linear',
      'phases',
    ]),
  );
  expect(schema.properties.schema_version.const).toBe(1);
  expect(schema.properties.status.enum).toEqual(['active', 'archived']);
  expect(schema.properties.phases.items.properties.status.enum).toEqual([
    'not-started',
    'in-progress',
    'completed',
    'canceled',
    'unknown',
  ]);
});

test('projectCreate: --pretty pretty-prints success JSON', async () => {
  const { io } = noopMarkerIO();
  const result = await projectCreate(
    ['my-thing', '--linear-project=p-1', '--pretty'],
    {
      client: clientWithResponses([
        { data: { project: { id: 'p-1', name: 'Sandbox' } } },
        { data: { issueLabels: { nodes: [] } } },
        {
          data: {
            issueLabelCreate: {
              success: true,
              issueLabel: { id: 'lbl-1', name: 'loom-project:my-thing' },
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: io,
      now: () => FAKE_NOW,
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('\n  ');
});
