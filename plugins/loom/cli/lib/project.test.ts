// Unit tests for the lib/project.ts pure helpers. `kebabCase` is
// factored out of `createSlug` (rule-of-three with `loom adr`'s
// title-to-slug); the byte-identity tests below pin its output
// against the pattern `createSlug` used to inline at lines 126-129,
// so a behaviour drift in `kebabCase` would trip a test here AND a
// `createSlug` test elsewhere.

import { test, expect } from 'vitest';
import { kebabCase } from './project.ts';

test('kebabCase: typical topic', () => {
  expect(kebabCase('Hello World')).toBe('hello-world');
});

test('kebabCase: special characters collapse to a single hyphen', () => {
  expect(kebabCase('foo!bar baz')).toBe('foo-bar-baz');
});

test('kebabCase: leading and trailing punctuation trimmed', () => {
  expect(kebabCase('---hi---')).toBe('hi');
});

test('kebabCase: empty input returns empty string (total, never throws)', () => {
  expect(kebabCase('')).toBe('');
});

test('kebabCase: all-special-char input returns empty string', () => {
  expect(kebabCase('!!!')).toBe('');
});

test('kebabCase: byte-identity with the previously-inlined chain', () => {
  // Pin the helper against the exact chain it replaces in createSlug
  // (project.ts:126-129 pre-factor). If kebabCase ever drifts, this
  // test fires first.
  const inlined = (s: string): string =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  const samples = [
    'Hello World',
    'foo!bar baz',
    '---hi---',
    '',
    '!!!',
    'CamelCase With Spaces',
    'underscore_and-hyphen mixed',
    '   leading spaces',
    'trailing spaces   ',
    '2026-05-28 — Architectural Decision',
  ];
  for (const s of samples) {
    expect(kebabCase(s)).toBe(inlined(s));
  }
});
