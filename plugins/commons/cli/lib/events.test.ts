import { test, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readEvents, appendEvent } from './events.ts';
import type { Event } from './types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '..', 'fixtures', 'events-all-types.jsonl');

test('readEvents parses every line', () => {
  const events = readEvents(FIXTURE);
  expect(events).toHaveLength(14);
  expect(events[0].event).toBe('project-initialized');
  expect(events[events.length - 1].event).toBe('note');
});

test('readEvents filters by event name', () => {
  const events = readEvents(FIXTURE, { event: 'retro-written' });
  expect(events).toHaveLength(2);
  for (const e of events) {
    expect(e.event).toBe('retro-written');
  }
});

test('readEvents filters by since timestamp', () => {
  const events = readEvents(FIXTURE, { since: '2026-05-15T12:00:00Z' });
  expect(events.length).toBeGreaterThan(0);
  for (const e of events) {
    expect(e.at >= '2026-05-15T12:00:00Z').toBe(true);
  }
});

test('readEvents applies limit', () => {
  const events = readEvents(FIXTURE, { limit: 3 });
  expect(events).toHaveLength(3);
});

test('readEvents throws events-not-found on missing file', () => {
  expect(() => readEvents('/nonexistent/events.jsonl')).toThrow(/events-not-found/);
});

test('appendEvent creates the file if missing and writes one line', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'loom-events-append-'));
  const target = join(tmp, 'events.jsonl');
  appendEvent(target, {
    at: '2026-05-15T10:20:00Z',
    event: 'note',
    detail: { text: 'first' },
  });
  const events = readEvents(target);
  expect(events).toHaveLength(1);
  expect(events[0].event).toBe('note');
  rmSync(tmp, { recursive: true, force: true });
});

test('appendEvent preserves prior lines (append-only)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'loom-events-append-'));
  const target = join(tmp, 'events.jsonl');
  appendEvent(target, {
    at: '2026-05-15T10:20:00Z',
    event: 'note',
    detail: { text: 'first' },
  });
  appendEvent(target, {
    at: '2026-05-15T10:21:00Z',
    event: 'note',
    detail: { text: 'second' },
  });
  const events = readEvents(target);
  expect(events).toHaveLength(2);
  expect((events[0].detail as { text: string }).text).toBe('first');
  expect((events[1].detail as { text: string }).text).toBe('second');
  rmSync(tmp, { recursive: true, force: true });
});

test('appendEvent round-trips the three Phase 3 evaluator events', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'loom-events-evaluator-'));
  const target = join(tmp, 'events.jsonl');

  // Annotated as Event[] so the three names + detail shapes are checked
  // against the union at compile time — the load-bearing guard that
  // EventName widened. `npm test` is vitest-only (esbuild strips types,
  // no tsc gate), so this is enforced in-editor / by any future
  // typecheck step, not at vitest runtime; the round-trip below is the
  // runtime guard that each event is a well-formed line.
  const events: Event[] = [
    {
      at: '2026-05-30T10:00:00Z',
      event: 'evaluator-spawned',
      detail: {
        slug: '2026-05-29-substrate-tempering',
        phase: 3,
        unit: 'D1',
        evaluator: 'evaluator-contract-fit',
      },
    },
    {
      at: '2026-05-30T10:01:00Z',
      event: 'evaluator-finding-emitted',
      detail: {
        slug: '2026-05-29-substrate-tempering',
        phase: 3,
        unit: 'D1',
        evaluator: 'evaluator-naming',
        code: 'visual-literal-name',
        severity: 'advisory',
      },
    },
    {
      at: '2026-05-30T10:02:00Z',
      event: 'evaluator-recused',
      detail: {
        slug: '2026-05-29-substrate-tempering',
        phase: 3,
        unit: 'D1',
        evaluator: 'evaluator-a11y',
        reason: 'no jsx artifacts in unit',
      },
    },
  ];
  for (const e of events) appendEvent(target, e);

  const readBack = readEvents(target);
  expect(readBack.map((e) => e.event)).toEqual([
    'evaluator-spawned',
    'evaluator-finding-emitted',
    'evaluator-recused',
  ]);
  expect(
    (readBack[0].detail as { evaluator: string }).evaluator,
  ).toBe('evaluator-contract-fit');
  expect((readBack[1].detail as { severity: string }).severity).toBe('advisory');
  expect((readBack[2].detail as { reason: string }).reason).toBe(
    'no jsx artifacts in unit',
  );
  rmSync(tmp, { recursive: true, force: true });
});
