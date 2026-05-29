import { describe, expect, test } from 'vitest';
import {
  CONVENTIONS,
  extractCheckTargets,
  extractDescription,
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

  test('appliesTo does NOT match personality-base, whiteboard-*, or non-evaluator files', () => {
    expect(
      convention.appliesTo(
        'plugins/guild/modes/personalities/personality-base.md',
      ),
    ).toBe(false);
    expect(
      convention.appliesTo(
        'plugins/guild/agents/whiteboard-a11y.md',
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
});
