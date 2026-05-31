import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eventsRead, eventsLatest, eventsAppend, eventsAggregate } from './events.ts';
import { manifestPath, readManifestFile, writeManifest } from '../../lib/manifest-toml.ts';
import { writeFileSync } from 'node:fs';
import type { Event } from '../../lib/types.ts';

// Build an isolated multi-project root for aggregate tests: each project is a
// SLUG_RE-shaped dir carrying a manifest.toml (the LOOM_MARKER listProjects
// gates on). `archived` projects live under archive/.
function seedAggregateRoot(
  specs: { slug: string; events: Event[]; archived?: boolean }[],
): string {
  const root = mkdtempSync(join(tmpdir(), 'loom-aggregate-'));
  const base = readManifestFile(join(FIXTURES, 'manifest-basic.toml')).manifest;
  for (const spec of specs) {
    const dir = spec.archived === true
      ? join(root, 'archive', spec.slug)
      : join(root, spec.slug);
    mkdirSync(dir, { recursive: true });
    // slug is derived from the directory name by listProjects, not stored in
    // the manifest — only the events vary per project here.
    writeManifest(manifestPath(dir), { ...base, events: spec.events });
  }
  return root;
}

function ev(at: string, event: string, detail: Record<string, unknown> = {}): Event {
  return { at, event, detail } as Event;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '..', 'fixtures');

let projectsRoot: string;

beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), 'loom-verbs-events-'));
  const projectPath = join(projectsRoot, '2026-05-15-test-loom');
  mkdirSync(projectPath);
  // Seed manifest.toml = the basic meta/phases + the all-types event corpus
  // folded into [[events]] (the .jsonl fixture stays the source of truth).
  const base = readManifestFile(join(FIXTURES, 'manifest-basic.toml')).manifest;
  const events = readFileSync(join(FIXTURES, 'events-all-types.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Event);
  writeManifest(manifestPath(projectPath), { ...base, events });
});

afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true });
});

test('eventsRead: returns all events as JSON array', () => {
  const result = eventsRead(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  const events = JSON.parse(result.stdout as string);
  expect(events).toHaveLength(14);
});

test('eventsRead: --event filter', () => {
  const result = eventsRead(['test-loom', '--event=retro-written'], {
    projectsRoot,
  });
  expect(result.exitCode).toBe(0);
  const events = JSON.parse(result.stdout as string);
  expect(events).toHaveLength(2);
});

test('eventsRead: --limit caps result', () => {
  const result = eventsRead(['test-loom', '--limit=3'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  const events = JSON.parse(result.stdout as string);
  expect(events).toHaveLength(3);
});

test('eventsRead: --since filter', () => {
  const result = eventsRead(['test-loom', '--since=2026-05-15T12:00:00Z'], {
    projectsRoot,
  });
  expect(result.exitCode).toBe(0);
  const events = JSON.parse(result.stdout as string);
  expect(events.length).toBeGreaterThan(0);
  for (const e of events) {
    expect(e.at >= '2026-05-15T12:00:00Z').toBe(true);
  }
});

test('eventsRead: missing slug returns missing-slug', () => {
  const result = eventsRead([], { projectsRoot });
  expect(result.exitCode).toBe(1);
  const payload = JSON.parse(result.stderr as string);
  expect(payload.error).toBe('missing-slug');
});

test('eventsLatest: returns the most recent event', () => {
  const result = eventsLatest(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  const e = JSON.parse(result.stdout as string);
  expect(e.event).toBe('note');
});

test('eventsLatest: --event filter narrows the search', () => {
  const result = eventsLatest(['test-loom', '--event=phase-started'], {
    projectsRoot,
  });
  expect(result.exitCode).toBe(0);
  const e = JSON.parse(result.stdout as string);
  expect(e.event).toBe('phase-started');
});

test('eventsLatest: no events matching filter returns no-events', () => {
  const result = eventsLatest(['test-loom', '--event=pr-closed' as string], {
    projectsRoot,
  });
  expect(result.exitCode).toBe(1);
  const payload = JSON.parse(result.stderr as string);
  expect(payload.error).toBe('no-events');
});

test('eventsAppend: well-formed event lands in the manifest log', () => {
  const result = eventsAppend(
    [
      'test-loom',
      '--event=evaluator-spawned',
      '--detail={"slug":"test-loom","phase":3,"unit":"D2a","evaluator":"evaluator-contract-fit"}',
    ],
    { projectsRoot },
  );
  expect(result.exitCode).toBe(0);
  const appended = JSON.parse(result.stdout as string);
  expect(appended.event).toBe('evaluator-spawned');
  expect(appended.detail.evaluator).toBe('evaluator-contract-fit');
  expect(typeof appended.at).toBe('string');

  // It is visible to eventsRead (the same manifest [[events]] log): 14 -> 15.
  const all = JSON.parse(eventsRead(['test-loom'], { projectsRoot }).stdout as string);
  expect(all).toHaveLength(15);
  const found = JSON.parse(
    eventsRead(['test-loom', '--event=evaluator-spawned'], { projectsRoot })
      .stdout as string,
  );
  expect(found).toHaveLength(1);
  expect(found[0].detail.unit).toBe('D2a');
});

test('eventsAppend: the three Phase 3 evaluator events each round-trip', () => {
  eventsAppend(
    ['test-loom', '--event=evaluator-spawned', '--detail={"evaluator":"a"}'],
    { projectsRoot },
  );
  eventsAppend(
    [
      'test-loom',
      '--event=evaluator-finding-emitted',
      '--detail={"evaluator":"a","code":"x","severity":"advisory"}',
    ],
    { projectsRoot },
  );
  eventsAppend(
    ['test-loom', '--event=evaluator-recused', '--detail={"evaluator":"b","reason":"n/a"}'],
    { projectsRoot },
  );
  for (const name of [
    'evaluator-spawned',
    'evaluator-finding-emitted',
    'evaluator-recused',
  ]) {
    const hits = JSON.parse(
      eventsRead(['test-loom', `--event=${name}`], { projectsRoot }).stdout as string,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].event).toBe(name);
  }
});

test('eventsAppend: --detail is optional and defaults to {}', () => {
  const result = eventsAppend(['test-loom', '--event=note'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  const appended = JSON.parse(result.stdout as string);
  expect(appended.detail).toEqual({});
});

test('eventsAppend: identical re-append is a no-op (dedupe)', () => {
  const args = ['test-loom', '--event=note', '--detail={"text":"dup"}'];
  eventsAppend(args, { projectsRoot });
  eventsAppend(args, { projectsRoot });
  const all = JSON.parse(eventsRead(['test-loom'], { projectsRoot }).stdout as string);
  // 14 seed + 1 (second is deduped on name + deepEqual detail)
  expect(all).toHaveLength(15);
});

test('eventsAppend: non-kebab event name returns invalid-event-name', () => {
  const result = eventsAppend(['test-loom', '--event=Evaluator_Spawned'], {
    projectsRoot,
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('invalid-event-name');
});

test('eventsAppend: array --detail returns invalid-detail', () => {
  const result = eventsAppend(['test-loom', '--event=note', '--detail=[1,2]'], {
    projectsRoot,
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('invalid-detail');
});

test('eventsAppend: malformed JSON --detail returns invalid-detail', () => {
  const result = eventsAppend(['test-loom', '--event=note', '--detail={oops}'], {
    projectsRoot,
  });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('invalid-detail');
});

test('eventsAppend: missing slug and missing event each error', () => {
  expect(JSON.parse(eventsAppend([], { projectsRoot }).stderr as string).error).toBe(
    'missing-slug',
  );
  expect(
    JSON.parse(eventsAppend(['test-loom'], { projectsRoot }).stderr as string).error,
  ).toBe('missing-args');
});

test('eventsAggregate: folds events across active + archived projects by (project, event)', () => {
  const root = seedAggregateRoot([
    {
      slug: '2026-01-01-alpha',
      events: [
        ev('2026-01-01T01:00:00Z', 'phase-started', { phase: 1, name: 'p' }),
        ev('2026-01-01T02:00:00Z', 'phase-started', { phase: 2, name: 'q' }),
        ev('2026-01-01T03:00:00Z', 'evaluator-spawned', {
          slug: '2026-01-01-alpha', phase: 1, unit: '01', evaluator: 'x',
        }),
      ],
    },
    {
      slug: '2026-02-02-beta',
      archived: true,
      events: [
        ev('2026-02-02T05:00:00Z', 'evaluator-spawned', {
          slug: '2026-02-02-beta', phase: 1, unit: '01', evaluator: 'y',
        }),
      ],
    },
  ]);
  const res = eventsAggregate(['--since=2026-01-01T00:00:00Z'], { projectsRoot: root });
  expect(res.exitCode).toBe(0);
  const rows = JSON.parse(res.stdout as string);
  // alpha: phase-started + evaluator-spawned (2 rows); beta (archived): evaluator-spawned (1 row)
  expect(rows).toHaveLength(3);

  const alphaPhase = rows.find(
    (r: { project: string; event: string }) =>
      r.project === '2026-01-01-alpha' && r.event === 'phase-started',
  );
  expect(alphaPhase.count).toBe(2);
  expect(alphaPhase.first_at).toBe('2026-01-01T01:00:00Z');
  expect(alphaPhase.last_at).toBe('2026-01-01T02:00:00Z');

  // The Phase 3 evaluator-* fold spans both the active and archived project.
  const evalRows = rows.filter(
    (r: { event: string }) => r.event === 'evaluator-spawned',
  );
  expect(evalRows).toHaveLength(2);
  expect(new Set(evalRows.map((r: { project: string }) => r.project))).toEqual(
    new Set(['2026-01-01-alpha', '2026-02-02-beta']),
  );
  rmSync(root, { recursive: true, force: true });
});

test('eventsAggregate: --event narrows to one event type across projects', () => {
  const root = seedAggregateRoot([
    {
      slug: '2026-01-01-alpha',
      events: [
        ev('2026-01-01T01:00:00Z', 'phase-started', { phase: 1, name: 'p' }),
        ev('2026-01-01T02:00:00Z', 'evaluator-recused', {
          slug: '2026-01-01-alpha', phase: 1, unit: '01', evaluator: 'x', reason: 'n/a',
        }),
      ],
    },
  ]);
  const rows = JSON.parse(
    eventsAggregate(['--event=evaluator-recused'], { projectsRoot: root }).stdout as string,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].event).toBe('evaluator-recused');
  expect(rows[0].count).toBe(1);
  rmSync(root, { recursive: true, force: true });
});

test('eventsAggregate: --since excludes older events (ISO compare, mirrors read)', () => {
  const root = seedAggregateRoot([
    {
      slug: '2026-01-01-alpha',
      events: [
        ev('2026-01-01T00:00:00Z', 'note', { text: 'old' }),
        ev('2026-06-01T00:00:00Z', 'note', { text: 'new' }),
      ],
    },
  ]);
  const rows = JSON.parse(
    eventsAggregate(['--since=2026-03-01T00:00:00Z'], { projectsRoot: root }).stdout as string,
  );
  expect(rows).toHaveLength(1);
  expect(rows[0].count).toBe(1); // only the June event survives the since filter
  expect(rows[0].first_at).toBe('2026-06-01T00:00:00Z');
  rmSync(root, { recursive: true, force: true });
});

test('eventsAggregate: skips a project whose manifest is unreadable (no crash)', () => {
  const root = seedAggregateRoot([
    {
      slug: '2026-01-01-alpha',
      events: [ev('2026-01-01T01:00:00Z', 'phase-started', { phase: 1, name: 'p' })],
    },
  ]);
  // A second project that passes listProjects (has a manifest.toml) but whose
  // manifest is malformed TOML — exercises the in-fold try/catch skip.
  const broken = join(root, '2026-09-09-broken');
  mkdirSync(broken, { recursive: true });
  writeFileSync(manifestPath(broken), 'this is = not valid [toml', 'utf8');

  const res = eventsAggregate([], { projectsRoot: root });
  expect(res.exitCode).toBe(0); // did not crash
  const rows = JSON.parse(res.stdout as string);
  expect(rows.every((r: { project: string }) => r.project === '2026-01-01-alpha')).toBe(true);
  rmSync(root, { recursive: true, force: true });
});

test('eventsAggregate: --limit caps the row count', () => {
  const root = seedAggregateRoot([
    {
      slug: '2026-01-01-alpha',
      events: [
        ev('2026-01-01T01:00:00Z', 'phase-started', { phase: 1, name: 'p' }),
        ev('2026-01-01T02:00:00Z', 'phase-completed', { phase: 1 }),
        ev('2026-01-01T03:00:00Z', 'note', { text: 'n' }),
      ],
    },
  ]);
  const rows = JSON.parse(
    eventsAggregate(['--limit=2'], { projectsRoot: root }).stdout as string,
  );
  expect(rows).toHaveLength(2);
  rmSync(root, { recursive: true, force: true });
});
