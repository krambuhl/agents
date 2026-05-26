import { describe, test, expect } from 'vitest';
import {
  stringifyManifest,
  parseManifest,
  type JellyManifest,
} from './manifest.ts';

function sampleManifest(overrides: Partial<JellyManifest> = {}): JellyManifest {
  return {
    schema_version: 1,
    title: 'Jelly',
    slug: '2026-05-25-jelly',
    started: '2026-05-25',
    status: 'active',
    plan_file: 'PLAN.md',
    research_file: 'RESEARCH.md',
    adr_log: '../adr-log',
    config: { base_branch: 'main', substrate: 'jelly' },
    phases: [
      { number: '1.1', milestone: 'M1', name: 'Verify empirical assumptions', depends_on: [] },
      { number: '1.2', milestone: 'M1', name: 'jelly-guild substrate', depends_on: ['1.1'] },
    ],
    ...overrides,
  };
}

describe('stringifyManifest', () => {
  test('emits canonical-order identity keys, [config], and [[phases]]', () => {
    const toml = stringifyManifest(sampleManifest());
    expect(toml).toContain('schema_version = 1');
    expect(toml).toContain('title = "Jelly"');
    expect(toml).toContain('slug = "2026-05-25-jelly"');
    expect(toml).toContain('[config]');
    expect(toml).toContain('base_branch = "main"');
    expect(toml).toContain('substrate = "jelly"');
    // Two [[phases]] blocks.
    expect(toml.match(/\[\[phases\]\]/g)).toHaveLength(2);
    expect(toml).toContain('number = "1.1"');
    expect(toml).toContain('depends_on = []');
    expect(toml).toContain('depends_on = ["1.1"]');
  });

  test('ends with a trailing newline', () => {
    expect(stringifyManifest(sampleManifest()).endsWith('\n')).toBe(true);
  });

  test('throws on a non-integer schema_version (writer guard)', () => {
    expect(() => stringifyManifest(sampleManifest({ schema_version: 1.5 }))).toThrow(
      /manifest-invalid-toml/,
    );
  });
});

describe('round-trip: parse(stringify(m)) deep-equals m', () => {
  test('the sample manifest', () => {
    const m = sampleManifest();
    expect(parseManifest(stringifyManifest(m))).toEqual(m);
  });

  test('a manifest with zero phases', () => {
    const m = sampleManifest({ phases: [] });
    expect(parseManifest(stringifyManifest(m))).toEqual(m);
  });

  test('a manifest with a single phase and empty depends_on', () => {
    const m = sampleManifest({
      phases: [{ number: '1.1', milestone: 'M1', name: 'Only phase', depends_on: [] }],
    });
    expect(parseManifest(stringifyManifest(m))).toEqual(m);
  });

  test('strings containing quotes and backslashes survive the round-trip', () => {
    const m = sampleManifest({
      title: 'A "quoted" \\ backslash title',
      phases: [
        { number: '1.1', milestone: 'M1', name: 'name with "quotes"', depends_on: ['x"y'] },
      ],
    });
    expect(parseManifest(stringifyManifest(m))).toEqual(m);
  });

  test('multi-element depends_on arrays survive the round-trip', () => {
    const m = sampleManifest({
      phases: [
        { number: '2.1', milestone: 'M2', name: 'Phase', depends_on: ['1.1', '1.2', '1.3'] },
      ],
    });
    expect(parseManifest(stringifyManifest(m))).toEqual(m);
  });
});

describe('parseManifest: value types', () => {
  const base = [
    'schema_version = 1',
    'title = "T"',
    'slug = "s"',
    'started = "2026-01-01"',
    'status = "active"',
    'plan_file = "PLAN.md"',
    'research_file = "RESEARCH.md"',
    'adr_log = "../adr-log"',
    '[config]',
    'base_branch = "main"',
    'substrate = "jelly"',
  ].join('\n');

  test('integer, string, and string-array values parse to the right JS types', () => {
    const m = parseManifest(
      base + '\n[[phases]]\nnumber = "1.1"\nmilestone = "M1"\nname = "N"\ndepends_on = ["a", "b"]\n',
    );
    expect(m.schema_version).toBe(1);
    expect(typeof m.schema_version).toBe('number');
    expect(m.title).toBe('T');
    expect(m.phases[0].depends_on).toEqual(['a', 'b']);
  });

  test('a boolean value parses (exercised via an unknown-but-tolerated path)', () => {
    // The manifest schema has no boolean field, but the value parser
    // supports booleans; assert via a config round-trip isn't possible
    // without a boolean field, so we assert the parser tolerates one in
    // a [[phases]] block as an extra key (ignored by validation, which
    // only reads the known keys). This documents boolean support.
    const m = parseManifest(
      base + '\n[[phases]]\nnumber = "1.1"\nmilestone = "M1"\nname = "N"\ndepends_on = []\nflagged = true\n',
    );
    expect(m.phases[0].number).toBe('1.1');
  });
});

describe('parseManifest: comments and blank lines', () => {
  test('tolerates full-line comments, trailing comments, and blank lines', () => {
    const toml = [
      '# this is the jelly manifest',
      'schema_version = 1',
      '',
      'title = "T"  # the project title',
      'slug = "s"',
      'started = "2026-01-01"',
      'status = "active"',
      'plan_file = "PLAN.md"',
      'research_file = "RESEARCH.md"',
      'adr_log = "../adr-log"',
      '',
      '[config]   # write-once config',
      'base_branch = "main"',
      'substrate = "jelly"',
      '',
      '[[phases]]',
      'number = "1.1"',
      'milestone = "M1"',
      'name = "N"',
      'depends_on = []',
    ].join('\n');
    const m = parseManifest(toml);
    expect(m.title).toBe('T');
    expect(m.config.base_branch).toBe('main');
    expect(m.phases).toHaveLength(1);
  });

  test('a # inside a quoted string is NOT treated as a comment', () => {
    const m = parseManifest(
      [
        'schema_version = 1',
        'title = "title # with hash"',
        'slug = "s"',
        'started = "2026-01-01"',
        'status = "active"',
        'plan_file = "PLAN.md"',
        'research_file = "RESEARCH.md"',
        'adr_log = "../adr-log"',
        '[config]',
        'base_branch = "main"',
        'substrate = "jelly"',
      ].join('\n'),
    );
    expect(m.title).toBe('title # with hash');
  });
});

describe('parseManifest: schema validation errors', () => {
  const withoutLine = (omit: string): string =>
    [
      'schema_version = 1',
      'title = "T"',
      'slug = "s"',
      'started = "2026-01-01"',
      'status = "active"',
      'plan_file = "PLAN.md"',
      'research_file = "RESEARCH.md"',
      'adr_log = "../adr-log"',
      '[config]',
      'base_branch = "main"',
      'substrate = "jelly"',
    ]
      .filter((l) => !l.startsWith(omit))
      .join('\n');

  test('missing schema_version → manifest-schema-invalid', () => {
    expect(() => parseManifest(withoutLine('schema_version'))).toThrow(
      /manifest-schema-invalid/,
    );
  });

  test('missing a required identity key → manifest-schema-invalid', () => {
    expect(() => parseManifest(withoutLine('title'))).toThrow(/manifest-schema-invalid/);
    expect(() => parseManifest(withoutLine('adr_log'))).toThrow(/manifest-schema-invalid/);
  });

  test('missing [config] table → manifest-schema-invalid', () => {
    const toml = [
      'schema_version = 1',
      'title = "T"',
      'slug = "s"',
      'started = "2026-01-01"',
      'status = "active"',
      'plan_file = "PLAN.md"',
      'research_file = "RESEARCH.md"',
      'adr_log = "../adr-log"',
    ].join('\n');
    expect(() => parseManifest(toml)).toThrow(/manifest-schema-invalid/);
  });

  test('a [[phases]] block missing a required key → manifest-schema-invalid', () => {
    const toml = withoutLine('') + '\n[[phases]]\nnumber = "1.1"\nname = "N"\ndepends_on = []\n';
    // missing `milestone`
    expect(() => parseManifest(toml)).toThrow(/manifest-schema-invalid/);
  });

  test('unsupported schema_version → manifest-unsupported-version', () => {
    const toml = withoutLine('schema_version').replace(
      'title = "T"',
      'schema_version = 2\ntitle = "T"',
    );
    expect(() => parseManifest(toml)).toThrow(/manifest-unsupported-version/);
  });
});

describe('parseManifest: rejects unsupported TOML constructs (manifest-invalid-toml)', () => {
  const prefix = 'schema_version = 1\ntitle = "T"\nslug = "s"\nstarted = "2026-01-01"\nstatus = "active"\nplan_file = "P"\nresearch_file = "R"\nadr_log = "a"\n';

  test('multiline string', () => {
    expect(() => parseManifest(prefix + 'note = """multi\nline"""\n')).toThrow(
      /manifest-invalid-toml/,
    );
  });

  test('dotted key', () => {
    expect(() => parseManifest(prefix + 'config.base = "main"\n')).toThrow(
      /manifest-invalid-toml/,
    );
  });

  test('unsupported table header (nested table)', () => {
    expect(() => parseManifest(prefix + '[config.nested]\n')).toThrow(/manifest-invalid-toml/);
  });

  test('float value', () => {
    expect(() => parseManifest(prefix + 'ratio = 1.5\n')).toThrow(/manifest-invalid-toml/);
  });

  test('datetime value', () => {
    expect(() => parseManifest(prefix + 'when = 2026-01-01T00:00:00Z\n')).toThrow(
      /manifest-invalid-toml/,
    );
  });

  test('inline table value', () => {
    expect(() => parseManifest(prefix + 'meta = { a = 1 }\n')).toThrow(/manifest-invalid-toml/);
  });

  test('non-string array element', () => {
    const toml = prefix + '[config]\nbase_branch = "main"\nsubstrate = "jelly"\n[[phases]]\nnumber = "1.1"\nmilestone = "M1"\nname = "N"\ndepends_on = [1, 2]\n';
    expect(() => parseManifest(toml)).toThrow(/manifest-invalid-toml/);
  });

  test('unterminated string', () => {
    expect(() => parseManifest(prefix + 'oops = "no closing quote\n')).toThrow(
      /manifest-invalid-toml/,
    );
  });

  test('line without an equals sign', () => {
    expect(() => parseManifest(prefix + 'this is not valid\n')).toThrow(/manifest-invalid-toml/);
  });

  test('content after a closed string', () => {
    expect(() => parseManifest(prefix + 'k = "value" garbage\n')).toThrow(
      /manifest-invalid-toml/,
    );
  });
});
