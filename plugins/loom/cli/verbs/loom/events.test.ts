import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eventsRead, eventsLatest, eventsAppend } from './events.ts';
import { manifestPath, readManifestFile, writeManifest } from '../../lib/manifest-toml.ts';
import type { Event } from '../../lib/types.ts';

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
