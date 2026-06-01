import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// RPI-symmetry invariant (guild-hirefest Phase 3).
//
// Phase 3 staffed the read-only `research` posture across every domain that
// has a `plan` agent — "full RPI symmetry, since investigation precedes
// both planning and implementing." This locks that decision: a future
// domain that gains a `plan` phase without a `research` phase (or a
// research-default recipe that drifts from the plan-domain set) fails here
// rather than silently breaking the symmetry.

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const axes = readFileSync(join(pluginRoot, 'modes', 'axes.toml'), 'utf8');

// Parse `[axis.domain.<name>] ... phases = [...]` into a name -> phases map.
function domainPhases(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const re = /\[axis\.domain\.([a-z0-9-]+)\]\s*\nphases = \[([^\]]*)\]/g;
  for (const m of axes.matchAll(re)) {
    const phases = [...m[2].matchAll(/"([^"]+)"/g)].map((p) => p[1]);
    out.set(m[1], phases);
  }
  return out;
}

describe('rpi-symmetry: research mirrors plan across domains', () => {
  const domains = domainPhases();

  it('parsed a non-trivial set of domains from axes.toml', () => {
    expect(domains.size).toBeGreaterThan(8);
  });

  it('every domain with a plan phase also has a research phase', () => {
    const planDomains = [...domains].filter(([, ph]) => ph.includes('plan'));
    expect(planDomains.length).toBeGreaterThan(0);
    for (const [name, ph] of planDomains) {
      expect(
        ph.includes('research'),
        `domain "${name}" has plan but not research — RPI symmetry broken`,
      ).toBe(true);
    }
  });

  it('the research-default recipe covers exactly the plan-domain set', () => {
    const planDomains = [...domains]
      .filter(([, ph]) => ph.includes('plan'))
      .map(([name]) => name)
      .sort();
    const recipeMatch = axes.match(
      /name = "research-default"[\s\S]*?domains = \[([^\]]*)\]/,
    );
    expect(recipeMatch, 'research-default recipe not found').not.toBeNull();
    const recipeDomains = [
      ...(recipeMatch as RegExpMatchArray)[1].matchAll(/"([^"]+)"/g),
    ]
      .map((m) => m[1])
      .sort();
    expect(recipeDomains).toEqual(planDomains);
  });
});
