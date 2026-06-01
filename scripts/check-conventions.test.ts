import { describe, expect, test } from 'vitest';
import {
  CONVENTIONS,
  deriveAgentRoster,
  extractCheckTargets,
  extractDescription,
  makeSiblingReferenceConvention,
  runConventions,
  splitFrontmatter,
  type Convention,
  type Finding,
} from './check-conventions.ts';

describe('Convention framework', () => {
  test('runConventions returns empty findings when no convention applies', () => {
    const neverApplies: Convention = {
      name: 'never',
      appliesTo: () => false,
      check: () => [
        {
          file: 'x',
          convention: 'never',
          severity: 'advisory',
          message: 'should not fire',
        },
      ],
    };
    const findings = runConventions(
      [{ path: 'foo.md', content: 'whatever' }],
      [neverApplies],
    );
    expect(findings).toEqual([]);
  });

  test('runConventions walks files × conventions and collects in input order', () => {
    const always: Convention = {
      name: 'always',
      appliesTo: () => true,
      check: (path) => [
        {
          file: path,
          convention: 'always',
          severity: 'advisory',
          message: `flagged ${path}`,
        },
      ],
    };
    const findings = runConventions(
      [
        { path: 'a.md', content: 'a' },
        { path: 'b.md', content: 'b' },
      ],
      [always],
    );
    expect(findings).toHaveLength(2);
    expect(findings[0].file).toBe('a.md');
    expect(findings[1].file).toBe('b.md');
  });

  test('CONVENTIONS registry exports the rubric-body-coherence convention', () => {
    const names = CONVENTIONS.map((c) => c.name);
    expect(names).toContain('rubric-body-coherence');
  });

  test('CONVENTIONS registry exports the bullet-pair-coherence convention', () => {
    const names = CONVENTIONS.map((c) => c.name);
    expect(names).toContain('bullet-pair-coherence');
  });
});

describe('frontmatter helpers', () => {
  test('splitFrontmatter handles a typical agent frontmatter block', () => {
    const content = `---
name: evaluator-foo
role: evaluator
description: >-
  multi-line
  scalar value
---

# Body header

body content
`;
    const { frontmatter, body } = splitFrontmatter(content);
    expect(frontmatter).toContain('name: evaluator-foo');
    expect(frontmatter).toContain('description: >-');
    expect(body).toContain('# Body header');
    expect(body).toContain('body content');
  });

  test('splitFrontmatter returns empty frontmatter when none is present', () => {
    const { frontmatter, body } = splitFrontmatter('# Just a body\n\ntext');
    expect(frontmatter).toBe('');
    expect(body).toContain('# Just a body');
  });

  test('extractDescription joins folded-scalar continuation lines', () => {
    const fm = `name: x
description: >-
  first line of description
  second line
  third line
role: evaluator`;
    const out = extractDescription(fm);
    expect(out).toBe('first line of description second line third line');
  });

  test('extractDescription handles inline single-line description', () => {
    const fm = `name: x
description: single-line description here
role: evaluator`;
    const out = extractDescription(fm);
    expect(out).toBe('single-line description here');
  });
});

describe('extractCheckTargets', () => {
  test('extracts targets after check verbs and splits comma-and lists', () => {
    const desc =
      'Skeptical evaluator that verifies acceptance criteria, disqualifiers, and rule adherence.';
    const targets = extractCheckTargets(desc);
    expect(targets).toContain('acceptance criteria');
    expect(targets).toContain('disqualifiers');
    expect(targets).toContain('rule adherence');
  });

  test('extracts multiple check verbs in one description', () => {
    const desc = 'Checks foo. Verifies bar and baz.';
    const targets = extractCheckTargets(desc);
    expect(targets).toContain('foo');
    expect(targets).toContain('bar');
    expect(targets).toContain('baz');
  });

  test('skips "whether …" predicate clauses, keeps concrete sibling targets', () => {
    const desc =
      'Checks whether a unit of work meets its agreed contract. Verifies acceptance criteria and disqualifiers.';
    const targets = extractCheckTargets(desc);
    // The abstract "whether …" clause is not extracted as a target.
    expect(targets.some((t) => t.includes('whether'))).toBe(false);
    // Concrete targets from the sibling sentence still extract.
    expect(targets).toContain('acceptance criteria');
    expect(targets).toContain('disqualifiers');
  });

  test('returns empty when no check verbs appear', () => {
    const desc = 'A passive description with no verbs at all.';
    const targets = extractCheckTargets(desc);
    expect(targets).toEqual([]);
  });
});

describe('rubric-body-coherence convention', () => {
  const convention = CONVENTIONS.find((c) => c.name === 'rubric-body-coherence')!;

  const cleanEvaluator = `---
name: evaluator-example
role: evaluator
description: >-
  Skeptical evaluator that verifies acceptance criteria and disqualifiers.
  Flags scope drift.
tools: Read
---

# Evaluator: example

## Process

1. Walk acceptance criteria one by one.
2. Walk disqualifiers and flag any that fire.
3. Watch for scope drift.
`;

  const driftedEvaluator = `---
name: evaluator-example
role: evaluator
description: >-
  Skeptical evaluator that verifies acceptance criteria and disqualifiers.
  Flags scope drift.
tools: Read
---

# Evaluator: example

## Process

1. Walk acceptance criteria one by one.
2. Watch for scope drift.
`;

  test('appliesTo matches evaluator-* under plugins/.../agents/(retained|generated)', () => {
    expect(
      convention.appliesTo(
        'plugins/guild/agents/evaluator-contract-fit.md',
      ),
    ).toBe(true);
    expect(
      convention.appliesTo(
        'plugins/guild/agents/evaluator-tokens.md',
      ),
    ).toBe(true);
  });

  test('appliesTo does NOT match personality-base, plan-*, or non-evaluator files', () => {
    expect(
      convention.appliesTo(
        'plugins/guild/modes/personalities/personality-base.md',
      ),
    ).toBe(false);
    expect(
      convention.appliesTo(
        'plugins/guild/agents/plan-a11y.md',
      ),
    ).toBe(false);
    expect(convention.appliesTo('scripts/check-conventions.ts')).toBe(false);
  });

  test('positive case: clean evaluator with coherent rubric and body yields zero findings', () => {
    const findings = convention.check(
      'plugins/guild/agents/evaluator-example.md',
      cleanEvaluator,
    );
    expect(findings).toEqual([]);
  });

  test('negative case: drifted evaluator with missing body reference yields one finding', () => {
    const findings = convention.check(
      'plugins/guild/agents/evaluator-example.md',
      driftedEvaluator,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject<Partial<Finding>>({
      convention: 'rubric-body-coherence',
      severity: 'advisory',
    });
    expect(findings[0].message).toContain('disqualifiers');
  });

  test('a reworded "checks whether …" description does not over-flag', () => {
    const whetherEvaluator = `---
name: evaluator-example
role: evaluator
description: >-
  Skeptical evaluator that checks whether a unit of work meets its
  agreed contract. Verifies acceptance criteria and disqualifiers.
tools: Read
---

# Evaluator: example

## Process

1. Re-read the contract and restate the agreed acceptance criteria.
2. Walk disqualifiers and flag any that fire.
`;
    const findings = convention.check(
      'plugins/guild/agents/evaluator-example.md',
      whetherEvaluator,
    );
    expect(findings).toEqual([]);
  });
});

describe('bullet-pair-coherence convention', () => {
  const convention = CONVENTIONS.find(
    (c) => c.name === 'bullet-pair-coherence',
  )!;

  // Lean-toward content bounded inline by an "X over Y" stance bullet.
  const boundedPlan = `---
name: plan-example
role: plan
description: example plan
tools: Read
---

# Plan: example

## Stance

- **Sharp over exhaustive.** Surface the few sharpest points.
- **Document the path.** Show your work.

## What to surface

The systematic walk.
`;

  // Lean-toward content with no boundary anywhere (no "X over Y",
  // no "Anti-patterns to avoid" section, no "Not a …" / "don't").
  const unboundedPlan = `---
name: plan-example
role: plan
description: example plan
tools: Read
---

# Plan: example

## Stance

- **Be thorough.** Cover every entry.
- **Lean into structure.** Prefer systematic walks.

## What to surface

The systematic walk.
`;

  // No lean-toward section at all — nothing to bound.
  const noLeanPlan = `---
name: plan-example
role: plan
description: example plan
tools: Read
---

# Plan: example

## What to surface

The systematic walk.
`;

  test('appliesTo matches plan-* under plugins/.../agents, not evaluator-*', () => {
    expect(
      convention.appliesTo('plugins/guild/agents/plan-substrate.md'),
    ).toBe(true);
    expect(
      convention.appliesTo('plugins/guild/agents/evaluator-contract-fit.md'),
    ).toBe(false);
    expect(convention.appliesTo('scripts/check-conventions.ts')).toBe(false);
  });

  test('positive case: lean-toward bounded by an "X over Y" stance yields zero findings', () => {
    const findings = convention.check(
      'plugins/guild/agents/plan-example.md',
      boundedPlan,
    );
    expect(findings).toEqual([]);
  });

  test('negative case: lean-toward with no boundary signal yields one finding', () => {
    const findings = convention.check(
      'plugins/guild/agents/plan-example.md',
      unboundedPlan,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject<Partial<Finding>>({
      convention: 'bullet-pair-coherence',
      severity: 'advisory',
    });
    expect(findings[0].message).toContain('boundary');
  });

  test('no lean-toward section: nothing to bound, zero findings', () => {
    const findings = convention.check(
      'plugins/guild/agents/plan-example.md',
      noLeanPlan,
    );
    expect(findings).toEqual([]);
  });
});

describe('deriveAgentRoster', () => {
  test('extracts plan-* / evaluator-* domains, ignores non-agent paths', () => {
    const roster = deriveAgentRoster([
      'plugins/guild/agents/plan-substrate.md',
      'plugins/guild/agents/evaluator-contract-fit.md',
      'plugins/guild/agents/evaluator-css-architecture.md',
      'plugins/guild/modes/personalities/personality-base.md',
      'scripts/check-conventions.ts',
    ]);
    expect(roster.has('substrate')).toBe(true);
    expect(roster.has('contract-fit')).toBe(true);
    expect(roster.has('css-architecture')).toBe(true); // hyphenated domain stays intact
    expect(roster.has('personality-base')).toBe(false); // under modes/, not an agent
    expect(roster.size).toBe(3);
  });
});

describe('sibling-reference-resolution convention', () => {
  const roster = new Set([
    'performance',
    'contract-fit',
    'nextjs',
    'composition',
  ]);
  const convention = makeSiblingReferenceConvention(roster);

  const resolvingPlan = `---
name: plan-example
role: plan
---

# Plan: example

## Cross-domain notes

- **performance overlap.** Render-cost concerns live there.
- **contract-fit overlap.** Correctness after the fact is its lane.
`;

  const danglingPlan = `---
name: plan-example
role: plan
---

# Plan: example

## Cross-domain notes

- **ghostdomain overlap.** References a domain that no longer exists.
`;

  const qualifierPlan = `---
name: plan-example
role: plan
---

# Plan: example

## Cross-domain notes

- **nextjs reviewer overlap.** Framework concerns are nextjs's lane.
`;

  test('name + appliesTo: sibling-reference-resolution on plan-*, not evaluator-*', () => {
    expect(convention.name).toBe('sibling-reference-resolution');
    expect(
      convention.appliesTo('plugins/guild/agents/plan-react.md'),
    ).toBe(true);
    expect(
      convention.appliesTo('plugins/guild/agents/evaluator-react.md'),
    ).toBe(false);
  });

  test('positive case: references that resolve to the roster yield zero findings', () => {
    const findings = convention.check(
      'plugins/guild/agents/plan-example.md',
      resolvingPlan,
    );
    expect(findings).toEqual([]);
  });

  test('negative case: a dangling sibling reference yields one advisory finding', () => {
    const findings = convention.check(
      'plugins/guild/agents/plan-example.md',
      danglingPlan,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject<Partial<Finding>>({
      convention: 'sibling-reference-resolution',
      severity: 'advisory',
    });
    expect(findings[0].message).toContain('ghostdomain');
  });

  test('qualifier case: "nextjs reviewer overlap" resolves via the "nextjs" token', () => {
    const findings = convention.check(
      'plugins/guild/agents/plan-example.md',
      qualifierPlan,
    );
    expect(findings).toEqual([]);
  });
});
