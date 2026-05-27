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

describe('parseToml — real source artifacts', () => {
  const manifest = parseToml(
    readFileSync(join(pluginRoot, 'panel.manifest.toml'), 'utf8'),
  );
  const toolsMap = parseToml(
    readFileSync(join(pluginRoot, 'tools-map.toml'), 'utf8'),
  );

  it('reads the manifest combinations as an array of tables', () => {
    expect(Array.isArray(manifest.combinations)).toBe(true);
    const combos = manifest.combinations as Array<Record<string, unknown>>;
    expect(combos.length).toBeGreaterThan(0);
    const reviewer = combos.find((c) => c.phase === 'reviewer');
    expect(reviewer?.personality).toBe('skeptic');
    expect(reviewer?.domains).toContain('a11y');
  });

  it('reads tools-map phase base + domain grants', () => {
    const phase = toolsMap.phase as Record<string, Record<string, unknown>>;
    expect(phase.reviewer.base).toEqual(['Read', 'Glob', 'Grep']);
    expect(phase.reviewer.writes).toBe(false);
    const domain = toolsMap.domain as Record<string, Record<string, unknown>>;
    expect(domain.a11y.grants).toContain('Bash(npm run test:a11y:*)');
  });
});
