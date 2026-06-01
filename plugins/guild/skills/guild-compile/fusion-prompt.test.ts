import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// fusion-prompt completeness test (guild-hirefest Phase 1, Unit 3).
//
// The fusion prompt drives composition for every phase that has agents.
// A phase posture with no cross-axis guidance block compiles to a body
// the LLM has to improvise — exactly the gap that left `fixer` unfused.
// This asserts the template carries a guidance block AND a role-mapping
// entry for every phase posture, so the gap cannot recur silently when a
// new phase is staffed.

const pluginRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const fusionPrompt = readFileSync(
  join(pluginRoot, 'skills', 'guild-compile', 'fusion-prompt.md'),
  'utf8',
);
const axesToml = readFileSync(join(pluginRoot, 'modes', 'axes.toml'), 'utf8');

// The five phase postures and the `role:` value each composes to (the
// phase-prefix mapping: reviewer→evaluator, plan→plan, the rest
// map to themselves).
const PHASE_ROLES: ReadonlyArray<[string, string]> = [
  ['reviewer', 'evaluator'],
  ['implementer', 'implementer'],
  ['fixer', 'fixer'],
  ['plan', 'plan'],
  ['research', 'research'],
];

describe('fusion-prompt: every phase posture has cross-axis guidance', () => {
  for (const [phase] of PHASE_ROLES) {
    it(`has a "When the phase is \`${phase}\`" guidance block`, () => {
      expect(fusionPrompt).toContain(`When the phase is \`${phase}\``);
    });
  }
});

describe('fusion-prompt: role mapping covers every phase posture', () => {
  for (const [phase, role] of PHASE_ROLES) {
    it(`maps ${phase} → ${role}`, () => {
      // Both backticks required (the mapping wraps every role in them);
      // \s* tolerates the soft-wrap between the arrow and the role.
      const re = new RegExp(`\\b${phase}\\s*→\\s*\`${role}\``);
      expect(fusionPrompt).toMatch(re);
    });
  }

  it('lists every composed role inside the frontmatter role: enum', () => {
    // Extract the enum body so membership is asserted against the enum
    // itself, not incidental occurrences of the word elsewhere in the doc.
    const enumMatch = fusionPrompt.match(/role:\s*<([^>]*)>/);
    expect(enumMatch, 'no `role: <...>` frontmatter enum found').not.toBeNull();
    const members = (enumMatch as RegExpMatchArray)[1]
      .split('|')
      .map((s) => s.trim());
    for (const role of new Set(PHASE_ROLES.map(([, r]) => r))) {
      expect(members, `role enum missing "${role}"`).toContain(role);
    }
  });
});

describe('fusion-prompt: PHASE_ROLES stays in lockstep with axes.toml', () => {
  it('covers every phase declared in axes.toml (no phase escapes a guidance block)', () => {
    const declared = [
      ...axesToml.matchAll(/^\[axis\.phase\.([a-z-]+)\]/gm),
    ].map((m) => m[1]);
    expect(
      declared.length,
      'no [axis.phase.*] sections found in axes.toml',
    ).toBeGreaterThan(0);
    const covered = new Set(PHASE_ROLES.map(([p]) => p));
    for (const phase of declared) {
      expect(
        covered.has(phase),
        `axes.toml declares phase "${phase}" but this test's PHASE_ROLES does not cover it — add it here and a "When the phase is \`${phase}\`" block to fusion-prompt.md`,
      ).toBe(true);
    }
  });
});
