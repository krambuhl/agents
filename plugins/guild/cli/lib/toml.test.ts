import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { isTomlTable, parseToml, TomlParseError } from './toml.ts';

// plugins/guild (this file: plugins/guild/cli/lib/toml.test.ts)
const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('parseToml — grammar', () => {
  it('parses top-level scalars (string, int, bool)', () => {
    const doc = parseToml('schema_version = 1\nname = "guild"\nactive = true\n');
    expect(doc).toEqual({ schema_version: 1, name: 'guild', active: true });
  });

  it('parses a [table] header into a nested table', () => {
    const doc = parseToml('[meta]\ntitle = "x"\n');
    expect(doc.meta).toEqual({ title: 'x' });
  });

  it('parses a dotted [a.b] header into nested tables', () => {
    const doc = parseToml('[phase.reviewer]\nwrites = false\n');
    expect(isTomlTable(doc.phase)).toBe(true);
    expect((doc.phase as Record<string, unknown>).reviewer).toEqual({
      writes: false,
    });
  });

  it('parses [[array-of-tables]] into an array of tables', () => {
    const doc = parseToml(
      '[[combinations]]\nphase = "reviewer"\n\n[[combinations]]\nphase = "planner"\n',
    );
    expect(doc.combinations).toEqual([
      { phase: 'reviewer' },
      { phase: 'planner' },
    ]);
  });

  it('parses single-line string arrays', () => {
    const doc = parseToml('domains = ["a11y", "react", "naming"]\n');
    expect(doc.domains).toEqual(['a11y', 'react', 'naming']);
  });

  it('parses an empty array', () => {
    expect(parseToml('xs = []\n').xs).toEqual([]);
  });

  it('strips full-line and trailing comments outside strings', () => {
    const doc = parseToml(
      '# a comment\nname = "guild" # trailing\nempty = []\n',
    );
    expect(doc).toEqual({ name: 'guild', empty: [] });
  });

  it('does not treat a # inside a quoted string as a comment', () => {
    expect(parseToml('grant = "Bash(npm run a#b)"\n').grant).toBe(
      'Bash(npm run a#b)',
    );
  });

  it('keeps commas inside quoted array elements intact', () => {
    // tool grants like Bash(...) have no commas, but the splitter must
    // still respect quotes so a future grant-with-comma is not torn.
    const doc = parseToml('grants = ["Bash(a, b)", "Read"]\n');
    expect(doc.grants).toEqual(['Bash(a, b)', 'Read']);
  });

  it('throws on a multi-line / unterminated array rather than guessing', () => {
    expect(() => parseToml('xs = [\n"a",\n"b",\n]\n')).toThrow(TomlParseError);
  });

  it('throws on an unsupported scalar value', () => {
    expect(() => parseToml('x = 1.5\n')).toThrow(TomlParseError);
  });
});

describe('parseToml — real source artifact (axes.toml)', () => {
  const axes = parseToml(
    readFileSync(join(pluginRoot, 'axes.toml'), 'utf8'),
  );

  it('reads axes.toml [[recipes]] as an array of tables', () => {
    expect(Array.isArray(axes.recipes)).toBe(true);
    const recipes = axes.recipes as Array<Record<string, unknown>>;
    expect(recipes.length).toBeGreaterThan(0);
    const reviewerDefault = recipes.find((r) => r.name === 'reviewer-default');
    expect(reviewerDefault?.phase).toBe('reviewer');
    expect(reviewerDefault?.personality).toBe('skeptic');
    expect(reviewerDefault?.domains).toContain('a11y');
  });

  it('reads axes.toml [axis.phase.reviewer] base_tools', () => {
    // The minimal toml reader nests dotted-section paths as objects:
    // [axis.phase.reviewer] → axes.axis.phase.reviewer. The reviewer
    // phase declares the base tool fold (Read, Glob, Grep) every
    // reviewer cell inherits, plus writes=false.
    const axis = axes.axis as Record<string, unknown>;
    const phase = axis.phase as Record<string, Record<string, unknown>>;
    expect(phase.reviewer.base_tools).toEqual(['Read', 'Glob', 'Grep']);
    expect(phase.reviewer.writes).toBe(false);
  });
});
