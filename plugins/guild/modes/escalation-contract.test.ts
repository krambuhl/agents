import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Escalation-contract body-shape test (guild-hirefest Phase 1, Unit 1).
//
// Asserts the SOURCE of the escalation contract — the phase fragments
// and the fusion-prompt — not the compiled agent bodies. The compiled
// `agents/*.md` only carry the contract after the roster is recompiled
// (Phase 1, Unit 5); the compiled-level assertion lives with that
// recompile. Here we lock the inputs the recompile fuses from:
//
//   1. Every phase fragment carries Constraints + Escalation + a
//      structured Confidence signal in its output contract.
//   2. The implementer and fixer output contracts stay distinct —
//      different stopping conditions (spec-met vs findings-cleared),
//      both no-self-verdict.
//   3. The fusion-prompt mandates the contract verbatim in every
//      composed body, so the Phase-1-Unit-5 compiled-level test can
//      assert the headings by name.
//
// Pairs with `fragment-schema.test.ts`, which enforces the heading
// SET and order; this file enforces the section CONTENT.

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const phasesDir = join(pluginRoot, 'modes', 'phases');
const fusionPrompt = join(
  pluginRoot,
  'skills',
  'guild-compile',
  'fusion-prompt.md',
);

const PHASES = ['reviewer', 'implementer', 'fixer', 'plan', 'research'];

function read(file: string): string {
  return readFileSync(file, 'utf8');
}

// Slice the body of a `## <heading>` section: everything from the
// heading line to the next `## ` heading (or end of file).
function sectionBody(content: string, heading: string): string {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

describe('escalation-contract: every phase fragment carries the contract', () => {
  for (const phase of PHASES) {
    it(`${phase}.md has Constraints, Escalation, and a Confidence signal`, () => {
      const content = read(join(phasesDir, `${phase}.md`));

      expect(content, `${phase}.md missing ## Constraints`).toContain(
        '## Constraints',
      );
      expect(content, `${phase}.md missing ## Escalation`).toContain(
        '## Escalation',
      );

      // The structured confidence signal is a three-value enum in the
      // output contract — not a free-form score.
      const output = sectionBody(content, 'Output contract');
      expect(output, `${phase}.md output contract missing Confidence`).toMatch(
        /Confidence/,
      );
      for (const level of ['high', 'medium', 'low']) {
        // Word-boundary match: a bare `.toContain('low')` would pass on
        // incidental substrings (`below`, `slow`, `allow`); the enum is
        // only satisfied by the standalone level word.
        expect(
          output,
          `${phase}.md output contract missing confidence level "${level}"`,
        ).toMatch(new RegExp(`\\b${level}\\b`));
      }

      // The escalation signal is reachable from the output contract.
      expect(output, `${phase}.md output contract missing Escalation`).toMatch(
        /Escalation/,
      );
    });
  }

  it('reviewer.md signals escalation with the operator-judgment-required verdict', () => {
    const content = read(join(phasesDir, 'reviewer.md'));
    expect(content).toContain('VERDICT: operator-judgment-required');
  });
});

describe('escalation-contract: implementer and fixer output contracts are distinct', () => {
  const implementer = read(join(phasesDir, 'implementer.md'));
  const fixer = read(join(phasesDir, 'fixer.md'));
  const implOutput = sectionBody(implementer, 'Output contract');
  const fixerOutput = sectionBody(fixer, 'Output contract');

  it('both emit no verdict (the reviewer gates)', () => {
    expect(implOutput).toMatch(/No verdict/);
    expect(fixerOutput).toMatch(/No verdict/);
  });

  it('the two output contracts are not identical', () => {
    expect(implOutput).not.toEqual(fixerOutput);
  });

  it('implementer stops at the contract (builds from spec)', () => {
    // Spec-driven: scope and stopping condition are the contract.
    expect(implOutput).toMatch(/contract/i);
    expect(implOutput).toMatch(/artifact/i);
    // The implementer is not scoped to findings — that is the fixer.
    expect(implOutput).not.toMatch(/finding/i);
  });

  it('fixer stops at the findings (applies minimal correction)', () => {
    // Finding-driven: scope and stopping condition are the reviewer's
    // flagged findings, not the whole contract.
    expect(fixerOutput).toMatch(/finding/i);
    expect(fixerOutput).toMatch(/corrected/i);
  });
});

describe('escalation-contract: fusion-prompt mandates the contract verbatim', () => {
  const prompt = read(fusionPrompt);

  it('requires Constraints, Escalation, and Confidence in every composed body', () => {
    expect(prompt).toMatch(/required verbatim/i);
    expect(prompt).toContain('## Constraints');
    expect(prompt).toContain('## Escalation');
    expect(prompt).toContain('Confidence:');
  });

  it('names both escalation shapes (reviewer verdict + Escalation line)', () => {
    expect(prompt).toContain('operator-judgment-required');
    expect(prompt).toMatch(/Escalation:/);
  });
});
