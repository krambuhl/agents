import { test, expect, vi } from 'vitest';
import { tasksGenerate } from './tasks.ts';
import { LinearClient } from '../lib/linear-client.ts';
import type { LinearMarker } from '../lib/marker.ts';
import type { GitRunner } from '../lib/git.ts';

const SAMPLE_MARKER: LinearMarker = {
  schema_version: 1,
  slug: 'my-thing',
  linear_project_id: 'lin-proj-1',
  linear_project_name: 'My Sandbox',
  label: 'loom-project:my-thing',
  created: '2026-05-22T19:00:00.000Z',
};

const FAKE_GIT: GitRunner = {
  currentBranch: () => 'main',
  githubRemote: () => ({ org: 'krambuhl', repo: 'agents' }),
  isCommitted: () => false,
  addAndCommit: () => {},
};

const SAMPLE_PLAN = `## Phases

### Phase 1 [design-1] — Design

#### Batch 1 [skeleton-1] — Skeleton

- [decisions-1] Decisions
`;

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

// Builds a LinearClient that returns each response in sequence.
function clientWithResponses(responses: unknown[]) {
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

// Two-response fixture: TASKS_STATE_QUERY response (project +
// projectMilestones + issues) and LABEL_LOOKUP_QUERY response. Both
// land in parallel; the LinearClient queues them in the order they
// were issued.
function bootstrapResponses(opts?: { existingLabelId?: string }) {
  return [
    {
      data: {
        project: {
          id: 'lin-proj-1',
          projectMilestones: { nodes: [] },
        },
        issues: { nodes: [] },
      },
    },
    {
      data: {
        issueLabels: {
          nodes: [
            {
              id: opts?.existingLabelId ?? 'lbl-1',
              name: 'loom-project:my-thing',
            },
          ],
        },
      },
    },
  ];
}

test('tasksGenerate: missing slug', async () => {
  const result = await tasksGenerate([], { resolveAuthFn: stubAuth() });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-slug');
});

test('tasksGenerate: missing --team-id', async () => {
  const result = await tasksGenerate(['my-thing'], {
    resolveAuthFn: stubAuth(),
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('missing-team-id');
});

test('tasksGenerate: surfaces marker-unreadable when marker missing', async () => {
  const result = await tasksGenerate(['my-thing', '--team-id=team-1'], {
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(null),
    gitRunner: FAKE_GIT,
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('marker-unreadable');
});

test('tasksGenerate: surfaces plan-file-unreadable', async () => {
  const result = await tasksGenerate(['my-thing', '--team-id=team-1'], {
    client: clientWithResponses([]),
    resolveAuthFn: stubAuth(),
    projectsRoot: '/tmp/projects',
    markerIO: markerIOReturning(SAMPLE_MARKER),
    gitRunner: FAKE_GIT,
    readFileFn: () => {
      throw new Error('ENOENT');
    },
    repoRoot: '/repo',
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('plan-file-unreadable');
});

test('tasksGenerate: dry-run by default emits ops list + summary, no apply', async () => {
  const result = await tasksGenerate(
    ['my-thing', '--team-id=team-1'],
    {
      client: clientWithResponses(bootstrapResponses()),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => SAMPLE_PLAN,
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.mode).toBe('dry-run');
  expect(parsed.summary.create).toBe(3);
  expect(parsed.summary.update).toBe(0);
  expect(parsed.summary.archive).toBe(0);
  expect(parsed.ops).toHaveLength(3);
  expect(parsed.hint).toMatch(/--apply/);
});

test('tasksGenerate: label-not-found when Linear has no matching label', async () => {
  const result = await tasksGenerate(
    ['my-thing', '--team-id=team-1'],
    {
      client: clientWithResponses([
        bootstrapResponses()[0],
        { data: { issueLabels: { nodes: [] } } },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => SAMPLE_PLAN,
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr ?? '').error).toBe('label-not-found');
});

test('tasksGenerate: --apply applies create ops in tree order', async () => {
  // 2 bootstrap responses + 3 issueCreate/milestoneCreate responses.
  const result = await tasksGenerate(
    ['my-thing', '--team-id=team-1', '--apply'],
    {
      client: clientWithResponses([
        ...bootstrapResponses(),
        {
          data: {
            projectMilestoneCreate: {
              success: true,
              projectMilestone: { id: 'm-1', name: '' },
            },
          },
        },
        {
          data: {
            issueCreate: {
              success: true,
              issue: { id: 'i-1', identifier: 'X-1', url: 'u', title: '' },
            },
          },
        },
        {
          data: {
            issueCreate: {
              success: true,
              issue: { id: 'i-2', identifier: 'X-2', url: 'u', title: '' },
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => SAMPLE_PLAN,
      writeFileFn: () => {},
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.mode).toBe('apply');
  expect(parsed.applied).toHaveLength(3);
  expect(parsed.applied[0]!.node_kind).toBe('phase');
  expect(parsed.applied[1]!.node_kind).toBe('batch');
  expect(parsed.applied[2]!.node_kind).toBe('task');
});

test('tasksGenerate: --apply without --prune skips archive ops; lists deferred', async () => {
  // Two-step plan: PLAN.md has only the design-1 phase + task; Linear
  // has an extra orphan task in addition to those. With --apply but no
  // --prune, the orphan stays.
  const result = await tasksGenerate(
    ['my-thing', '--team-id=team-1', '--apply'],
    {
      client: clientWithResponses([
        {
          data: {
            project: {
              id: 'lin-proj-1',
              projectMilestones: {
                nodes: [
                  {
                    id: 'm-1',
                    name: 'my-thing · Phase 1 — Design',
                    description: '**Composed key**: design-1\n**Source**: -\n**Last synced**: -\n\n---\n\nDesign',
                  },
                ],
              },
            },
            issues: {
              nodes: [
                {
                  id: 'i-batch',
                  title: 'my-thing · Batch design-1.skeleton-1 — Skeleton',
                  description:
                    '**Composed key**: design-1.skeleton-1\n**Source**: -\n**Last synced**: -\n\n---\n\nSkeleton',
                  parent: null,
                  projectMilestone: { id: 'm-1' },
                  state: { type: 'started' },
                },
                {
                  id: 'i-task-keep',
                  title: 'Decisions',
                  description:
                    '**Composed key**: design-1.skeleton-1.decisions-1\n**Source**: -\n**Last synced**: -\n\n---\n\nDecisions',
                  parent: { id: 'i-batch' },
                  projectMilestone: null,
                  state: { type: 'unstarted' },
                },
                {
                  id: 'i-orphan',
                  title: 'Orphan',
                  description:
                    '**Composed key**: design-1.skeleton-1.orphan-1\n**Source**: -\n**Last synced**: -\n\n---\n\nOrphan',
                  parent: { id: 'i-batch' },
                  projectMilestone: null,
                  state: { type: 'backlog' },
                },
              ],
            },
          },
        },
        {
          data: {
            issueLabels: {
              nodes: [{ id: 'lbl-1', name: 'loom-project:my-thing' }],
            },
          },
        },
        // Update mutations expected for the title differences. The
        // plan has different title formats than the Linear records;
        // computeDiff emits 3 updates (phase, batch, task). Body
        // also differs since "---" in the marker descriptions is
        // truncated.
        {
          data: {
            projectMilestoneUpdate: {
              success: true,
              projectMilestone: { id: 'm-1', name: '' },
            },
          },
        },
        {
          data: {
            issueUpdate: {
              success: true,
              issue: { id: 'i-batch', identifier: 'X-1', url: 'u', title: '' },
            },
          },
        },
        {
          data: {
            issueUpdate: {
              success: true,
              issue: { id: 'i-task-keep', identifier: 'X-2', url: 'u', title: '' },
            },
          },
        },
        // The orphan archive would happen here if --prune were set;
        // since it's not, we don't expect this response to be consumed.
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => SAMPLE_PLAN,
      writeFileFn: () => {},
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.summary.archive).toBe(1);
  expect(parsed.deferred_archives.safe_to_archive).toBe(1);
  expect(parsed.applied.every((a: { op_kind: string }) => a.op_kind !== 'archive')).toBe(true);
});

test('tasksGenerate: dry-run does NOT write to PLAN.md', async () => {
  const writeFileSpy = vi.fn();
  const result = await tasksGenerate(
    ['my-thing', '--team-id=team-1'],
    {
      client: clientWithResponses(bootstrapResponses()),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => SAMPLE_PLAN,
      writeFileFn: writeFileSpy,
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(0);
  expect(writeFileSpy).not.toHaveBeenCalled();
});

test('tasksGenerate: --apply writes PLAN.md with inline `([linear](URL))` annotations on created issue lines', async () => {
  const writeFileSpy = vi.fn();
  const result = await tasksGenerate(
    ['my-thing', '--team-id=team-1', '--apply'],
    {
      client: clientWithResponses([
        ...bootstrapResponses(),
        {
          data: {
            projectMilestoneCreate: {
              success: true,
              projectMilestone: { id: 'm-1', name: '' },
            },
          },
        },
        {
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: 'i-1',
                identifier: 'X-1',
                url: 'https://linear.app/x/issue/X-1',
                title: '',
              },
            },
          },
        },
        {
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: 'i-2',
                identifier: 'X-2',
                url: 'https://linear.app/x/issue/X-2',
                title: '',
              },
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => SAMPLE_PLAN,
      writeFileFn: writeFileSpy,
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  // Phase has no URL (milestones don't expose one), so only Batch +
  // Task get annotated. Two lines should change.
  expect(parsed.plan_writeback.updated_lines).toBe(2);
  expect(writeFileSpy).toHaveBeenCalledTimes(1);

  const [writtenPath, writtenContents] = writeFileSpy.mock.calls[0]!;
  expect(writtenPath).toBe('/tmp/projects/my-thing/PLAN.md');
  expect(writtenContents).toContain(
    '#### Batch 1 [skeleton-1] — Skeleton ([linear](https://linear.app/x/issue/X-1))',
  );
  expect(writtenContents).toContain(
    '- [decisions-1] Decisions ([linear](https://linear.app/x/issue/X-2))',
  );
});

test('tasksGenerate: --apply skips PLAN.md write when no creates / updates produce a URL', async () => {
  const writeFileSpy = vi.fn();
  // bootstrapResponses() emits empty Linear state. With SAMPLE_PLAN
  // having 3 nodes, normally --apply would create them. But here
  // we'll feed an empty plan (no `## Phases` block past parser
  // tolerance) ... or simpler: pass a plan whose nodes already
  // exist in Linear, so no creates fire. Easiest path is the
  // "everything-in-Linear-already" stance from the earlier
  // archive-deferral test; reuse a minimal version here.
  const result = await tasksGenerate(
    ['my-thing', '--team-id=team-1', '--apply'],
    {
      client: clientWithResponses([
        {
          data: {
            project: {
              id: 'lin-proj-1',
              projectMilestones: {
                nodes: [
                  {
                    id: 'm-1',
                    name: 'my-thing · Phase 1 — Design',
                    description:
                      '**Composed key**: design-1\n**Source**: github.com/krambuhl/agents/tree/main/projects/my-thing/PLAN.md#L3\n**Last synced**: 2026-05-22T20:00:00.000Z\n\n---\n\nDesign',
                  },
                ],
              },
            },
            issues: {
              nodes: [
                {
                  id: 'i-batch',
                  title: 'my-thing · Batch design-1.skeleton-1 — Skeleton',
                  description:
                    '**Composed key**: design-1.skeleton-1\n**Source**: github.com/krambuhl/agents/tree/main/projects/my-thing/PLAN.md#L5\n**Last synced**: 2026-05-22T20:00:00.000Z\n\n---\n\nSkeleton',
                  parent: null,
                  projectMilestone: { id: 'm-1' },
                  state: { type: 'started' },
                },
                {
                  id: 'i-task',
                  title: 'Decisions',
                  description:
                    '**Composed key**: design-1.skeleton-1.decisions-1\n**Source**: github.com/krambuhl/agents/tree/main/projects/my-thing/PLAN.md#L7\n**Last synced**: 2026-05-22T20:00:00.000Z\n\n---\n\nDecisions',
                  parent: { id: 'i-batch' },
                  projectMilestone: null,
                  state: { type: 'unstarted' },
                },
              ],
            },
          },
        },
        {
          data: {
            issueLabels: {
              nodes: [{ id: 'lbl-1', name: 'loom-project:my-thing' }],
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => SAMPLE_PLAN,
      writeFileFn: writeFileSpy,
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );

  expect(result.exitCode).toBe(0);
  const parsed = JSON.parse(result.stdout ?? '');
  expect(parsed.plan_writeback.updated_lines).toBe(0);
  expect(writeFileSpy).not.toHaveBeenCalled();
});

test('tasksGenerate: issueCreate request body carries the line-anchored source URL', async () => {
  // Construct a LinearClient inline so we can inspect outgoing
  // request bodies. The Phase line in SAMPLE_PLAN sits on line 3
  // (line 1 is "## Phases", line 2 is blank, line 3 is the Phase
  // heading). The Batch line is line 5; the Task bullet line 7.
  const fetchFn = vi.fn();
  for (const r of [
    ...bootstrapResponses(),
    {
      data: {
        projectMilestoneCreate: {
          success: true,
          projectMilestone: { id: 'm-1', name: '' },
        },
      },
    },
    {
      data: {
        issueCreate: {
          success: true,
          issue: {
            id: 'i-1',
            identifier: 'X-1',
            url: 'https://linear.app/x/issue/X-1',
            title: '',
          },
        },
      },
    },
    {
      data: {
        issueCreate: {
          success: true,
          issue: {
            id: 'i-2',
            identifier: 'X-2',
            url: 'https://linear.app/x/issue/X-2',
            title: '',
          },
        },
      },
    },
  ]) {
    fetchFn.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: () => Promise.resolve(''),
      json: () => Promise.resolve(r),
    });
  }

  const result = await tasksGenerate(
    ['my-thing', '--team-id=team-1', '--apply'],
    {
      client: new LinearClient({
        apiKey: 'lin_api_test',
        fetchFn,
        sleepFn: () => Promise.resolve(),
      }),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => SAMPLE_PLAN,
      writeFileFn: () => {},
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(0);

  // Five calls fired: TASKS_STATE_QUERY, LABEL_LOOKUP_QUERY,
  // projectMilestoneCreate (Phase), issueCreate (Batch),
  // issueCreate (Task). The last three carry node descriptions.
  const callBodies = fetchFn.mock.calls.map(
    (c) => JSON.parse(c[1].body) as { variables: { input: { description?: string; name?: string } } },
  );
  // Phase: projectMilestoneCreate carries `description` on the input.
  expect(callBodies[2]!.variables.input.description).toContain(
    '**Source**: github.com/krambuhl/agents/tree/main/projects/my-thing/PLAN.md#L3',
  );
  // Batch (line 5).
  expect(callBodies[3]!.variables.input.description).toContain(
    '**Source**: github.com/krambuhl/agents/tree/main/projects/my-thing/PLAN.md#L5',
  );
  // Task (line 7).
  expect(callBodies[4]!.variables.input.description).toContain(
    '**Source**: github.com/krambuhl/agents/tree/main/projects/my-thing/PLAN.md#L7',
  );
});

test('tasksGenerate: --apply surfaces plan-writeback-failed when writeFileFn throws', async () => {
  const result = await tasksGenerate(
    ['my-thing', '--team-id=team-1', '--apply'],
    {
      client: clientWithResponses([
        ...bootstrapResponses(),
        {
          data: {
            projectMilestoneCreate: {
              success: true,
              projectMilestone: { id: 'm-1', name: '' },
            },
          },
        },
        {
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: 'i-1',
                identifier: 'X-1',
                url: 'https://linear.app/x/issue/X-1',
                title: '',
              },
            },
          },
        },
        {
          data: {
            issueCreate: {
              success: true,
              issue: {
                id: 'i-2',
                identifier: 'X-2',
                url: 'https://linear.app/x/issue/X-2',
                title: '',
              },
            },
          },
        },
      ]),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => SAMPLE_PLAN,
      writeFileFn: () => {
        throw new Error('EACCES: read-only file system');
      },
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );

  expect(result.exitCode).toBe(1);
  const err = JSON.parse(result.stderr ?? '');
  expect(err.error).toBe('plan-writeback-failed');
  expect(err.message).toContain('EACCES');
});

test('tasksGenerate: --pretty pretty-prints', async () => {
  const result = await tasksGenerate(
    ['my-thing', '--team-id=team-1', '--pretty'],
    {
      client: clientWithResponses(bootstrapResponses()),
      resolveAuthFn: stubAuth(),
      projectsRoot: '/tmp/projects',
      markerIO: markerIOReturning(SAMPLE_MARKER),
      gitRunner: FAKE_GIT,
      readFileFn: () => SAMPLE_PLAN,
      repoRoot: '/repo',
      now: () => '2026-05-22T20:00:00.000Z',
    },
  );
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('\n  ');
});
