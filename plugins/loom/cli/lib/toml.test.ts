// Unit tests for the hand-rolled TOML parser/serializer.
//
// Three tiers:
//   1. Round-trip — parseToml(stringifyToml(t)) deep-equals t, pinned on
//      the nasty cases the manifest subset must survive (literal #, quote,
//      and */ inside strings; empty arrays; inline tables holding string
//      arrays; arrays-of-tables with inline-table fields; deeply nested
//      inline tables mirroring a real Checkin).
//   2. Loud rejection — unsupported constructs throw a LoomError naming
//      the offending line, never silently mis-parse.
//   3. Strip-only smoke — the lib loads and runs under real Node's
//      type-stripping loader (vitest's transform would mask a parameter-
//      property or JSDoc-close footgun), shelled via spawnSync('node').

import { test, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseToml, stringifyToml } from './toml.ts';
import type { TomlTable } from './toml.ts';
import { LoomError } from './errors.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SMOKE = join(__dirname, 'toml.smoke.ts');

function roundTrips(value: TomlTable): void {
  expect(parseToml(stringifyToml(value))).toEqual(value);
}

// ---------- Round-trip ----------

test('round-trips flat scalars (string, integer, boolean)', () => {
  roundTrips({ title: 'hello', count: 42, negative: -7, active: true, off: false });
});

test('round-trips strings carrying #, quotes, and the */ sequence', () => {
  roundTrips({
    hash: 'a # not a comment',
    quoted: 'he said "hi"',
    block: 'closes a comment */ mid-string',
    mixed: '# "*/" all at once',
  });
});

test('round-trips whitespace escapes (newline, tab, carriage return)', () => {
  roundTrips({ nl: 'a\nb', tab: 'a\tb', cr: 'a\rb', backslash: 'a\\b' });
});

test('round-trips empty and populated scalar arrays', () => {
  roundTrips({ empty: [], strings: ['a', 'b', 'c'], ints: [1, 2, 3], bools: [true, false] });
});

test('round-trips a [table] header with an inline-table field', () => {
  roundTrips({
    meta: { schema_version: 1, slug: 'x' },
    config: { base_branch: 'main', worker_bindings: { default: 'ev-loop-interactive' } },
  });
});

test('round-trips an inline table holding a string array', () => {
  roundTrips({ contract: { goal: 'g', acceptance_criteria: ['one', 'two'] } });
});

test('round-trips [[array-of-table]] with inline-table fields per element', () => {
  roundTrips({
    checkins: [
      { number: '01', detail: { kind: 'pr-opened', pr: 68 } },
      { number: '02', detail: { kind: 'pr-merged', pr: 69 } },
    ],
  });
});

test('round-trips an array of inline tables as a value (not a header)', () => {
  roundTrips({ events: { batch: [{ a: 1 }, { b: 2 }, { c: 3 }] } });
});

test('round-trips deeply nested inline tables mirroring a real Checkin', () => {
  roundTrips({
    schema_version: 1,
    title: 'Substrate Consolidation',
    checkins: [
      {
        number: '05',
        created: '2026-05-27T02:40:00Z',
        contract: {
          goal: 'pure TOML parser + serializer',
          acceptance_criteria: ['parseToml + stringifyToml exported', 'round-trip holds'],
          disqualifiers: [],
          inputs: ['src/lib/manifest.ts', 'loom/cli/lib/types.ts'],
        },
        verdict: { result: 'approved', reasons: [] },
        notes: { detail: { phase: 2, signals: [] } },
      },
    ],
  });
});

test('round-trips an empty inline table', () => {
  roundTrips({ phases: [{ number: 1, pr: {} }] });
});

// ---------- Escaping property ----------

test('escaping property: arbitrary control/quote/backslash strings survive', () => {
  const fragments = ['', 'plain', '"', '\\', '\n', '\t', '\r', '#', '*/', '{}', '[],='];
  for (const a of fragments) {
    for (const b of fragments) {
      const value: TomlTable = { s: a + b, arr: [a, b], inline: { k: b + a } };
      expect(
        parseToml(stringifyToml(value)),
        `failed on a=${JSON.stringify(a)} b=${JSON.stringify(b)}`,
      ).toEqual(value);
    }
  }
});

// ---------- Loud rejection ----------

function expectReject(raw: string, lineFragment: string): void {
  let thrown: unknown;
  try {
    parseToml(raw);
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(LoomError);
  expect((thrown as LoomError).code).toBe('toml-invalid');
  expect((thrown as LoomError).message).toContain(lineFragment);
}

test('rejects multiline strings, naming the line', () => {
  expectReject('a = 1\nb = """multi"""', 'line 2');
});

test('rejects floats, naming the line', () => {
  expectReject('pi = 3.14', 'line 1');
});

test('rejects datetimes, naming the line', () => {
  expectReject('when = 2026-05-27', 'line 1');
});

test('rejects dotted keys, naming the line', () => {
  expectReject('a = 1\nfoo.bar = 2', 'line 2');
});

test('rejects dotted table headers, naming the line', () => {
  expectReject('[a.b]\nx = 1', 'line 1');
});

test('rejects an unterminated string, naming the line', () => {
  expectReject('s = "no close', 'line 1');
});

test('rejects an unterminated array, naming the line', () => {
  expectReject('a = [1, 2', 'line 1');
});

test('rejects an unterminated inline table, naming the line', () => {
  expectReject('t = { k = 1', 'line 1');
});

test('rejects trailing junk after a value, naming the line', () => {
  expectReject('a = 1 garbage', 'line 1');
});

test('rejects a duplicate key in the same section, naming the line', () => {
  expectReject('a = 1\na = 2', 'line 2');
});

test('rejects a duplicate [table] header, naming the line', () => {
  expectReject('[meta]\nx = 1\n[meta]\ny = 2', 'line 3');
});

test('parses comments and blank lines without choking', () => {
  const parsed = parseToml('# header comment\n\ntitle = "x" # trailing\n\n[meta]\nslug = "y"\n');
  expect(parsed).toEqual({ title: 'x', meta: { slug: 'y' } });
});

// ---------- Strip-only smoke via subprocess ----------

test('toml.ts loads and runs under the real node strip-only loader', () => {
  // The only tier that exercises Node's type-stripping loader; vitest's
  // transform would mask a parameter-property or JSDoc-close footgun.
  const result = spawnSync('node', [SMOKE], { encoding: 'utf8' });
  expect(result.status, `stderr: ${result.stderr}`).toBe(0);
  expect(result.stdout).toContain('toml.smoke ok');
});
