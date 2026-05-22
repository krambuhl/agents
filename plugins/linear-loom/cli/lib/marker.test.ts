import { test, expect, vi } from 'vitest';
import {
  labelForSlug,
  markerExists,
  markerPath,
  readMarker,
  writeMarker,
  type LinearMarker,
} from './marker.ts';

const SAMPLE_MARKER: LinearMarker = {
  schema_version: 1,
  slug: 'my-thing',
  linear_project_id: 'lin-proj-abc',
  linear_project_name: 'My Sandbox',
  label: 'loom-project:my-thing',
  created: '2026-05-22T19:00:00.000Z',
};

test('markerPath: composes projects/<slug>/linear.json', () => {
  expect(markerPath('my-thing', '/tmp/projects')).toBe(
    '/tmp/projects/my-thing/linear.json',
  );
});

test('labelForSlug: prefixes with loom-project:', () => {
  expect(labelForSlug('my-thing')).toBe('loom-project:my-thing');
});

test('readMarker: returns parsed marker on happy path', () => {
  const reader = () => JSON.stringify(SAMPLE_MARKER);
  const result = readMarker('/p/linear.json', { readFile: reader });
  expect(result).toEqual(SAMPLE_MARKER);
});

test('readMarker: marker-unreadable when file is missing', () => {
  const reader = () => {
    throw new Error('ENOENT');
  };
  expect(() => readMarker('/p/linear.json', { readFile: reader })).toThrow(
    /marker-unreadable/,
  );
});

test('readMarker: marker-unparseable on invalid JSON', () => {
  expect(() =>
    readMarker('/p/linear.json', { readFile: () => 'not json' }),
  ).toThrow(/marker-unparseable/);
});

test('readMarker: marker-schema-version on wrong schema version', () => {
  expect(() =>
    readMarker('/p/linear.json', {
      readFile: () => JSON.stringify({ ...SAMPLE_MARKER, schema_version: 2 }),
    }),
  ).toThrow(/marker-schema-version/);
});

test('readMarker: marker-malformed on missing required field', () => {
  const incomplete = { ...SAMPLE_MARKER } as Partial<LinearMarker>;
  delete incomplete.linear_project_id;
  expect(() =>
    readMarker('/p/linear.json', {
      readFile: () => JSON.stringify(incomplete),
    }),
  ).toThrow(/marker-malformed/);
});

test('readMarker: marker-malformed on empty-string field', () => {
  expect(() =>
    readMarker('/p/linear.json', {
      readFile: () =>
        JSON.stringify({ ...SAMPLE_MARKER, linear_project_id: '   ' }),
    }),
  ).toThrow(/marker-malformed/);
});

test('writeMarker: serializes JSON with trailing newline and ensures parent dir', () => {
  const writes: Array<[string, string]> = [];
  const mkdirs: Array<[string, { recursive: true }]> = [];
  writeMarker('/p/sub/linear.json', SAMPLE_MARKER, {
    writeFile: (path, content) => writes.push([path, content]),
    mkdir: (path, opts) => mkdirs.push([path, opts]),
  });
  expect(mkdirs).toEqual([['/p/sub', { recursive: true }]]);
  expect(writes).toHaveLength(1);
  expect(writes[0]![0]).toBe('/p/sub/linear.json');
  expect(writes[0]![1]).toMatch(/\n$/);
  const parsed = JSON.parse(writes[0]![1]);
  expect(parsed).toEqual(SAMPLE_MARKER);
});

test('markerExists: delegates to injected exists fn', () => {
  const exists = vi.fn(() => true);
  expect(markerExists('/p/linear.json', { exists })).toBe(true);
  expect(exists).toHaveBeenCalledWith('/p/linear.json');
});
