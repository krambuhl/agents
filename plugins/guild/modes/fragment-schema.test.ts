import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Fragment-schema test for Phase 1.0 of guild-matrix-precompile.
//
// The three fragment axes (domain / phase / personality) each carry
// a canonical heading set documented in `docs/AGENT-CODEGEN.md`
// § Fragment heading sets. This test asserts every fragment file
// conforms to its axis: required headings present in canonical
// order, optional headings (when allowed) at their canonical
// position, no extras. Fails loud on drift. Pairs with the U1
// spec — if the canonical sets ever change, both this file and the
// spec change together.
//
// `personality-base.md` is exempt per the U1 spec (documentation
// root for the personality class, not a personality fragment per se;
// its content is inlined into every generated agent body via the
// Phase 2.1 fusion prompt).

// This test now lives in modes/, so climb one level to the plugin root.
const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const DOMAIN_REQUIRED = [
  '## Scope',
  '## Concerns',
  '## Antipattern catalog',
  '## Good patterns',
  '## Vocabulary',
  '## Cross-domain notes',
];
// Optional domain headings, when present, must sit between
// `## Antipattern catalog` and `## Good patterns`. Order between
// Detection and Carve-outs is not enforced — only one fragment ever
// carries both today, and the canonical position is what matters.
const DOMAIN_OPTIONAL = ['## Detection', '## Carve-outs'];
const DOMAIN_OPTIONAL_BETWEEN: [string, string] = [
  '## Antipattern catalog',
  '## Good patterns',
];

const PHASE_REQUIRED = [
  '## Lifecycle position',
  '## Stance',
  '## Mandate',
  '## Tool posture',
  '## Output contract',
];

const PERSONALITY_REQUIRED = [
  '## Disposition',
  '## Voice cues',
  '## Phase modulation',
];
const PERSONALITY_EXEMPT = new Set(['personality-base.md']);

function parseHeadings(content: string): string[] {
  return content
    .split('\n')
    .filter((line) => /^## /.test(line))
    .map((line) => line.trimEnd());
}

function assertConforms(opts: {
  file: string;
  headings: string[];
  required: string[];
  optional?: string[];
  optionalBetween?: [string, string];
}): void {
  const { file, headings, required, optional = [], optionalBetween } = opts;
  const allowed = new Set([...required, ...optional]);

  for (const h of headings) {
    expect(
      allowed.has(h),
      `${file}: unexpected ## heading "${h}" (allowed: ${Array.from(allowed).join(', ')})`,
    ).toBe(true);
  }

  const presentRequired = headings.filter((h) => required.includes(h));
  expect(
    presentRequired,
    `${file}: required headings out of order or missing; expected ${JSON.stringify(required)}, got ${JSON.stringify(presentRequired)}`,
  ).toEqual(required);

  if (optionalBetween) {
    const [before, after] = optionalBetween;
    const beforeIdx = headings.indexOf(before);
    const afterIdx = headings.indexOf(after);
    expect(
      beforeIdx,
      `${file}: missing required anchor heading "${before}" for optional-position check`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      afterIdx,
      `${file}: optional-position anchor "${after}" must follow "${before}"`,
    ).toBeGreaterThan(beforeIdx);
    for (const h of headings) {
      if (!optional.includes(h)) continue;
      const idx = headings.indexOf(h);
      expect(
        idx > beforeIdx && idx < afterIdx,
        `${file}: optional heading "${h}" must appear between "${before}" and "${after}"; got position ${idx} (${before} at ${beforeIdx}, ${after} at ${afterIdx})`,
      ).toBe(true);
    }
  }
}

describe('fragment-schema: domain fragments conform to canonical heading set', () => {
  const dir = join(pluginRoot, 'modes', 'domains');
  const files = readdirSync(dir).filter((f: string) => f.endsWith('.md')).sort();
  for (const file of files) {
    it(`${file}`, () => {
      const content = readFileSync(join(dir, file), 'utf8');
      const headings = parseHeadings(content);
      assertConforms({
        file,
        headings,
        required: DOMAIN_REQUIRED,
        optional: DOMAIN_OPTIONAL,
        optionalBetween: DOMAIN_OPTIONAL_BETWEEN,
      });
    });
  }
});

describe('fragment-schema: phase fragments conform to canonical heading set', () => {
  const dir = join(pluginRoot, 'modes', 'phases');
  const files = readdirSync(dir).filter((f: string) => f.endsWith('.md')).sort();
  for (const file of files) {
    it(`${file}`, () => {
      const content = readFileSync(join(dir, file), 'utf8');
      const headings = parseHeadings(content);
      assertConforms({
        file,
        headings,
        required: PHASE_REQUIRED,
      });
    });
  }
});

describe('fragment-schema: personality fragments conform to canonical heading set', () => {
  const dir = join(pluginRoot, 'modes', 'personalities');
  const files = readdirSync(dir)
    .filter((f: string) => f.endsWith('.md'))
    .filter((f: string) => !PERSONALITY_EXEMPT.has(f))
    .sort();
  for (const file of files) {
    it(`${file}`, () => {
      const content = readFileSync(join(dir, file), 'utf8');
      const headings = parseHeadings(content);
      assertConforms({
        file,
        headings,
        required: PERSONALITY_REQUIRED,
      });
    });
  }
});

// Sanity: personality-base.md exists (the exemption is real, not a
// stale reference to a deleted file).
describe('fragment-schema: personality-base.md exemption is documented and real', () => {
  it('personality-base.md exists', () => {
    const dir = join(pluginRoot, 'modes', 'personalities');
    const files = readdirSync(dir);
    expect(files).toContain('personality-base.md');
  });
});
