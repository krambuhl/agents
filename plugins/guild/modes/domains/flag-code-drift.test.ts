import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Real-artifact regression guard for the 3-axis harvest.
//
// Several domain modes are ADAPTED from the still-live baked
// `evaluator-*` agents (the originals are deleted in Phase 7, not now).
// While both coexist, the baked agent is the canonical antipattern
// catalog and the domain mode is the harvested copy. The risk: someone
// fixes or extends a baked evaluator's catalog and the domain mode
// drifts stale, so Phase 5 codegen bakes the old knowledge.
//
// This test asserts every flag code in a baked evaluator survives into
// its harvested domain mode. Flag codes are stable identifiers, so
// their presence is the load-bearing invariant to pin (the prose is
// legitimately reshaped, so a full string diff would be wrong).
//
// Extend PAIRS as later units adapt more domains:
//   U4 -> test-unit, test-integration (added below)
//   U5 -> performance (whiteboard-performance), substrate (whiteboard-substrate-engineer)
// The whiteboard-sourced domains in U5 carry no flag codes, so they
// will need a different invariant (concern-heading presence) rather
// than this flag-code check.

// `exclude` lists flag codes that intentionally do NOT harvest into the
// domain mode because they are not phase-neutral domain knowledge.
// css-arch-out-of-scope-files flags "this change touched files outside
// its contract scope" — a scope-discipline concern owned by
// contract-fit / the reviewer phase, not the structural-CSS domain. The
// resolved-value-diff codes, by contrast, generalize as CSS
// visual-change discipline and are kept.
const PAIRS = [
  { mode: 'react.md', baked: 'evaluator-react-api.md', prefix: 'react-', exclude: [] as string[] },
  { mode: 'tokens.md', baked: 'evaluator-tokens.md', prefix: 'tokens-', exclude: [] as string[] },
  {
    mode: 'css-architecture.md',
    baked: 'evaluator-css-architecture.md',
    prefix: 'css-arch-',
    exclude: ['css-arch-out-of-scope-files'],
  },
  { mode: 'nextjs.md', baked: 'evaluator-nextjs.md', prefix: 'nextjs-', exclude: [] as string[] },
  {
    mode: 'test-unit.md',
    baked: 'evaluator-test-unit.md',
    prefix: 'test-unit-',
    exclude: [] as string[],
  },
  {
    mode: 'test-integration.md',
    baked: 'evaluator-test-integration.md',
    prefix: 'test-integration-',
    exclude: [] as string[],
  },
];

const here = dirname(fileURLToPath(import.meta.url));
const agentsDir = join(here, '..', '..', 'agents');

// Flag codes are always backtick-wrapped in both the baked agents and
// the domain modes, so anchoring on backticks avoids catching the same
// prefix in prose (e.g. "the react-api lens").
function flagCodes(text: string, prefix: string): string[] {
  const re = new RegExp('`(' + prefix + '[a-z0-9-]+)`', 'g');
  const found = new Set<string>();
  let m: RegExpExecArray | null = re.exec(text);
  while (m !== null) {
    found.add(m[1]);
    m = re.exec(text);
  }
  return [...found];
}

describe('domain-mode flag-code drift', () => {
  for (const pair of PAIRS) {
    it(`${pair.mode} carries every flag code from ${pair.baked}`, () => {
      const baked = readFileSync(join(agentsDir, pair.baked), 'utf8');
      const mode = readFileSync(join(here, pair.mode), 'utf8');
      const exclude = new Set(pair.exclude);
      const codes = flagCodes(baked, pair.prefix).filter(
        (code) => !exclude.has(code),
      );

      // Guard the guard: if extraction finds nothing, the regex or the
      // baked source changed shape — fail loud rather than pass vacuously.
      expect(codes.length).toBeGreaterThan(0);

      const missing = codes.filter((code) => !mode.includes(code));
      expect(missing).toEqual([]);
    });
  }
});

// The tier-agnostic testing principles live in BOTH test-unit and
// test-integration as a verbatim-shared section, because Phase 5 inlines
// mode content and cannot cross-reference one mode from another. This
// test pins that the shared block does not drift between the two. (The
// "duplication-plus-test" the Phase 4 whiteboard chose over a cross-file
// reference.)
function sharedSection(text: string): string {
  const lines = text.split('\n');
  const start = lines.findIndex(
    (line) => line.trim() === '## Shared testing concerns',
  );
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('## ')) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

describe('shared testing concerns block', () => {
  it('is byte-identical across test-unit and test-integration', () => {
    const unit = sharedSection(readFileSync(join(here, 'test-unit.md'), 'utf8'));
    const integration = sharedSection(
      readFileSync(join(here, 'test-integration.md'), 'utf8'),
    );

    // Fail loud if the section heading was renamed or dropped, rather
    // than pass vacuously on two empty strings.
    expect(unit.length).toBeGreaterThan(0);
    expect(unit).toEqual(integration);
  });
});
