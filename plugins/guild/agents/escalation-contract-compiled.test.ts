import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Compiled-level body-shape test (guild-hirefest Phase 1, Unit 5).
//
// The source-level guarantee lives in modes/escalation-contract.test.ts
// (fragments + fusion-prompt). This is its downstream half: every
// COMPILED agent body actually carries the escalation contract after the
// roster recompile. The two together close the PLAN's verification line
// ("a body-shape test asserts every compiled agent carries
// Constraints/Escalation") — source proves the inputs mandate it,
// compiled proves the output embodies it.
//
// `evaluator-contract-fit` is the retained, hand-authored baseline
// reviewer (axes.toml [[retained]]) — not codegen output, so the recompile
// does not regenerate it. It is folded into the contract by hand so the
// whole panel is uniformly constraint-aware, and so it is covered here
// rather than excluded: every agent in the panel must be able to escalate.

const agentsDir = join(dirname(fileURLToPath(import.meta.url)));

const compiledAgents = readdirSync(agentsDir)
  .filter((f: string) => f.endsWith('.md'))
  .sort();

function read(file: string): string {
  return readFileSync(join(agentsDir, file), 'utf8');
}

// The composed `role:` frontmatter value (evaluator | whiteboard |
// implementer | fixer | researcher).
function roleOf(body: string): string | null {
  const m = body.match(/^role:\s*(\S+)/m);
  return m ? m[1] : null;
}

describe('escalation-contract (compiled): every recompiled agent carries the contract', () => {
  it('found a non-trivial roster to check', () => {
    // Guard against a glob that silently matches nothing.
    expect(compiledAgents.length).toBeGreaterThan(10);
  });

  for (const file of compiledAgents) {
    it(`${file} carries Constraints, Escalation, and a Confidence signal`, () => {
      const body = read(file);
      expect(body, `${file} missing ## Constraints`).toContain('## Constraints');
      expect(body, `${file} missing ## Escalation`).toContain('## Escalation');
      expect(body, `${file} missing a Confidence signal`).toMatch(/Confidence/);
    });
  }

  for (const file of compiledAgents.filter(
    (f: string) => roleOf(read(f)) === 'evaluator',
  )) {
    it(`${file} (reviewer) carries the operator-judgment-required verdict shape`, () => {
      expect(read(file)).toContain('VERDICT: operator-judgment-required');
    });
  }
});
