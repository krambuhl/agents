import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Phase-7 deletion green-light.
//
// Before Phase 7 deletes the baked agents/evaluator-*, whiteboard-*, and
// generator-* files, every one of them must be ACCOUNTED FOR: either a
// generated agent with an equivalent tool set exists to replace it, or it
// is deliberately retained / inlined / project-local / explicitly
// deferred. This test is that ledger. It asserts:
//
//   1. tool-set equivalence for every baked agent that a generated agent
//      replaces (the literal "you may delete X when a generated agent
//      with a matching tool set exists" proof), AND
//   2. completeness — every baked agent falls into exactly one bucket, so
//      nothing is silently un-migrated.
//
// Names are NOT 1:1: the planner side and evaluator-react-api were renamed
// to the clean <prefix>-<domain> form (caller migration is a Phase-7
// task), whiteboard-testing-strategy split into two tier agents, and
// whiteboard-design-systems expanded into the recipe's four members. The
// mapping below is the source of truth for those renames.
//
// This test READS the baked files, which Phase 7 deletes — so it RETIRES
// in Phase 7 once deletion + the live-spawn smoke land. It is a gate for
// that step, not a permanent invariant.

const here = dirname(fileURLToPath(import.meta.url)); // plugins/guild
const bakedDir = join(here, 'agents');
const generatedDir = join(here, 'agents', 'generated');

function toolsOf(file: string): string[] {
  const content = readFileSync(file, 'utf8');
  const m = content.match(/^tools:\s*(.+)$/m);
  if (!m) throw new Error(`no tools: line in ${file}`);
  return m[1]
    .split(',')
    .map((t) => t.trim())
    .sort();
}

// baked agent -> the generated agent(s) that replace it, with an
// equivalent tool set. 1->many for the testing-strategy split and the
// design-systems recipe expansion.
const REPLACED: Record<string, string[]> = {
  // reviewers (skeptic x reviewer); evaluator-react-api -> evaluator-react
  'evaluator-a11y': ['evaluator-a11y'],
  'evaluator-css-architecture': ['evaluator-css-architecture'],
  'evaluator-naming': ['evaluator-naming'],
  'evaluator-nextjs': ['evaluator-nextjs'],
  'evaluator-react-api': ['evaluator-react'],
  'evaluator-test-integration': ['evaluator-test-integration'],
  'evaluator-test-unit': ['evaluator-test-unit'],
  'evaluator-tokens': ['evaluator-tokens'],
  // planners; the descriptive-suffixed names collapse to <prefix>-<domain>
  'whiteboard-a11y': ['whiteboard-a11y'],
  'whiteboard-performance': ['whiteboard-performance'],
  'whiteboard-skeptic': ['whiteboard-skeptic'],
  'whiteboard-react-architect': ['whiteboard-react'],
  'whiteboard-substrate-engineer': ['whiteboard-substrate'],
  'whiteboard-testing-strategy': ['whiteboard-test-unit', 'whiteboard-test-integration'],
  'whiteboard-design-systems': [
    'whiteboard-composition',
    'whiteboard-abstraction',
    'whiteboard-tokens',
    'whiteboard-naming',
  ],
};

// Retained hand-authored — the one principled exception (panel-composition
// baseline reviewer), never generated.
const RETAINED = ['evaluator-contract-fit'];

// Base contracts — inlined into every generated agent as their opening
// section; not standalone spawnable agents. Phase 7 deletes them; their
// content lives on inside the generated bodies.
const BASE_CONTRACTS = ['evaluator-base', 'whiteboard-base', 'generator-base'];

// Project-local — replaced by an agent the consumer generates via the
// --project-dir escape hatch, NOT by a core generated agent.
const PROJECT_LOCAL = ['whiteboard-sketch-ideation'];

// UNADDRESSED by the current manifest — Phase-7 prerequisite. The
// generator (implementer-phase) agents have no [[combinations]] row, so
// `guild generate` emits no replacement. Phase 7 must resolve them
// (author an implementer combination, retain, or drop) BEFORE deleting
// generator-*. Recorded here so the gap can't be deleted past silently.
const DEFERRED_GENERATORS = ['generator-css-codemod'];

describe('generated panel tool-set equivalence (Phase-7 deletion green-light)', () => {
  for (const [baked, replacements] of Object.entries(REPLACED)) {
    it(`${baked} -> ${replacements.join(' + ')} carry an equivalent tool set`, () => {
      const expected = toolsOf(join(bakedDir, `${baked}.md`));
      for (const gen of replacements) {
        expect(toolsOf(join(generatedDir, `${gen}.md`))).toEqual(expected);
      }
    });
  }
});

describe('deletion-readiness completeness', () => {
  it('every baked agent is accounted for in exactly one bucket', () => {
    const bakedAgents = readdirSync(bakedDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.replace(/\.md$/, ''));

    const classified = new Set<string>([
      ...Object.keys(REPLACED),
      ...RETAINED,
      ...BASE_CONTRACTS,
      ...PROJECT_LOCAL,
      ...DEFERRED_GENERATORS,
    ]);

    const unclassified = bakedAgents.filter((a) => !classified.has(a));
    // A new baked agent with no bucket means Phase 7 would delete (or
    // keep) something nobody decided about — fail loud here.
    expect(unclassified).toEqual([]);

    // and nothing is double-counted across buckets
    const all = [
      ...Object.keys(REPLACED),
      ...RETAINED,
      ...BASE_CONTRACTS,
      ...PROJECT_LOCAL,
      ...DEFERRED_GENERATORS,
    ];
    expect(all.length).toBe(new Set(all).size);
  });

  it('the deferred generator gap is still open (no generated replacement yet)', () => {
    // Phase-7 prerequisite, asserted so it flips red when CLOSED: the
    // generator (implementer-phase) agents have no [[combinations]] row,
    // so `guild generate` emits no generator-*. The moment someone
    // authors an implementer combination, a generated generator-* file
    // appears and this fails — the signal to resolve the baked
    // generator-* and retire DEFERRED_GENERATORS / this gate.
    const generatedGenerators = readdirSync(generatedDir).filter((f) =>
      f.startsWith('generator-'),
    );
    expect(generatedGenerators).toEqual([]);
    expect(DEFERRED_GENERATORS).toContain('generator-css-codemod');
  });
});
