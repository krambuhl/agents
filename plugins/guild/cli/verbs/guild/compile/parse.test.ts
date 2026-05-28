import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { TomlParseError } from '../../../lib/toml.ts';
import { parse } from './parse.ts';
import { AxesParseError } from './types.ts';

const pluginRoot = dirname(dirname(dirname(dirname(dirname(fileURLToPath(import.meta.url))))));
const AXES_PATH = join(pluginRoot, 'axes.toml');

describe('parse: seed axes.toml', () => {
  const seed = readFileSync(AXES_PATH, 'utf8');

  it('parses the committed seed into a typed AxesData', () => {
    const data = parse(seed);
    expect(data.schema_version).toBe(1);
    expect(Object.keys(data.domains).length).toBeGreaterThan(0);
    expect(Object.keys(data.personalities).length).toBeGreaterThan(0);
    expect(Object.keys(data.phases).length).toBeGreaterThan(0);
    expect(data.recipes.length).toBeGreaterThan(0);
    expect(data.singletons.length).toBeGreaterThan(0);
    expect(data.retained.length).toBeGreaterThan(0);
  });

  it('preserves heading data on the typed shape', () => {
    const data = parse(seed);
    const skeptic = data.personalities.skeptic;
    expect(skeptic).toBeDefined();
    expect(skeptic!.name).toBe('skeptic');
    expect(skeptic!.disposition.length).toBeGreaterThan(0);
  });

  it('captures recipe domain arrays as string[]', () => {
    const data = parse(seed);
    const reviewer = data.recipes.find((r) => r.name === 'reviewer-default');
    expect(reviewer).toBeDefined();
    expect(reviewer!.domains.length).toBeGreaterThan(0);
    expect(typeof reviewer!.domains[0]).toBe('string');
  });
});

describe('parse: error cases', () => {
  it('rejects malformed TOML with TomlParseError', () => {
    expect(() => parse('this is not valid toml [[[')).toThrow(TomlParseError);
  });

  it('rejects missing schema_version with AxesParseError', () => {
    expect(() => parse('[axis.domain.foo]\nphases = []\ntool_grants = []')).toThrow(
      AxesParseError,
    );
  });

  it('rejects schema_version != 1 with AxesParseError', () => {
    expect(() => parse('schema_version = 2\n')).toThrow(AxesParseError);
  });

  it('rejects missing axis section with AxesParseError', () => {
    expect(() => parse('schema_version = 1\n')).toThrow(AxesParseError);
  });

  it('rejects missing axis.domain table with AxesParseError', () => {
    expect(() =>
      parse(
        'schema_version = 1\n[axis.personality.skeptic]\nphases = []\ndisposition = "x"\n',
      ),
    ).toThrow(AxesParseError);
  });

  it('rejects a domain entry missing phases with AxesParseError', () => {
    expect(() =>
      parse(
        'schema_version = 1\n[axis.domain.foo]\ntool_grants = []\n[axis.personality.x]\nphases = []\ndisposition = "x"\n[axis.phase.y]\nbase_tools = ["Read"]\nwrites = false\ndefault_personality = "x"\n',
      ),
    ).toThrow(AxesParseError);
  });

  it('rejects a non-string in a tool_grants array with AxesParseError', () => {
    expect(() =>
      parse(
        'schema_version = 1\n[axis.domain.foo]\nphases = []\ntool_grants = ["Bash", 42]\n[axis.personality.x]\nphases = []\ndisposition = "x"\n[axis.phase.y]\nbase_tools = ["Read"]\nwrites = false\ndefault_personality = "x"\n',
      ),
    ).toThrow(AxesParseError);
  });
});
