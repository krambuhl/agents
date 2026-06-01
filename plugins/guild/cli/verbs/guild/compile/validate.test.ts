import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parse } from './parse.ts';
import type { Finding } from './types.ts';
import { validate } from './validate.ts';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(here, 'fixtures', 'validate');
const pluginRoot = dirname(dirname(dirname(dirname(here))));
const AXES_PATH = join(pluginRoot, 'modes', 'axes.toml');

function loadAndValidate(fixtureName: string) {
  const content = readFileSync(join(FIXTURE_DIR, fixtureName), 'utf8');
  return validate(parse(content));
}

function findingCodes(result: { ok: false; errors: Finding[] } | { ok: true }): string[] {
  if (result.ok) return [];
  return result.errors.map((e: Finding) => e.code);
}

describe('validate: success', () => {
  it('the committed seed axes.toml validates clean', () => {
    const result = validate(parse(readFileSync(AXES_PATH, 'utf8')));
    expect(result.ok, result.ok ? '' : JSON.stringify(result.errors, null, 2)).toBe(
      true,
    );
  });

  it('the _base.toml fixture validates clean', () => {
    const result = loadAndValidate('_base.toml');
    expect(result.ok, result.ok ? '' : JSON.stringify(result.errors, null, 2)).toBe(
      true,
    );
  });
});

describe('validate: lints', () => {
  it('flags domain-phase-unknown when domain.phases references a missing phase', () => {
    const result = loadAndValidate('domain-phase-unknown.toml');
    expect(result.ok).toBe(false);
    expect(findingCodes(result)).toContain('domain-phase-unknown');
    if (!result.ok) {
      const f = result.errors.find((e: Finding) => e.code === 'domain-phase-unknown')!;
      expect(f.message).toContain('domain "foo"');
      expect(f.message).toContain('nonexistent');
      expect(f.location).toContain('axis.domain.foo.phases');
    }
  });

  it('flags personality-phase-unknown when personality.phases references a missing phase', () => {
    const result = loadAndValidate('personality-phase-unknown.toml');
    expect(result.ok).toBe(false);
    expect(findingCodes(result)).toContain('personality-phase-unknown');
    if (!result.ok) {
      const f = result.errors.find((e: Finding) => e.code === 'personality-phase-unknown')!;
      expect(f.message).toContain('personality "skeptic"');
      expect(f.location).toContain('axis.personality.skeptic.phases');
    }
  });

  it('flags recipe-phase-unknown when recipe.phase is missing', () => {
    const result = loadAndValidate('recipe-phase-unknown.toml');
    expect(result.ok).toBe(false);
    expect(findingCodes(result)).toContain('recipe-phase-unknown');
    if (!result.ok) {
      const f = result.errors.find((e: Finding) => e.code === 'recipe-phase-unknown')!;
      expect(f.message).toContain('recipe "broken"');
      expect(f.location).toContain('recipes[0].broken.phase');
    }
  });

  it('flags recipe-personality-unknown when recipe.personality is missing', () => {
    const result = loadAndValidate('recipe-personality-unknown.toml');
    expect(result.ok).toBe(false);
    expect(findingCodes(result)).toContain('recipe-personality-unknown');
    if (!result.ok) {
      const f = result.errors.find((e: Finding) => e.code === 'recipe-personality-unknown')!;
      expect(f.message).toContain('recipe "broken"');
      expect(f.message).toContain('ghost');
    }
  });

  it('flags recipe-domain-unknown when recipe.domains[i] is missing', () => {
    const result = loadAndValidate('recipe-domain-unknown.toml');
    expect(result.ok).toBe(false);
    expect(findingCodes(result)).toContain('recipe-domain-unknown');
    if (!result.ok) {
      const f = result.errors.find((e: Finding) => e.code === 'recipe-domain-unknown')!;
      expect(f.message).toContain('domain "bar"');
      expect(f.location).toContain('recipes[0].broken.domains[0]');
    }
  });

  it('flags recipe-cell-underivable when recipe.phase is not in a domain.phases', () => {
    const result = loadAndValidate('recipe-cell-underivable.toml');
    expect(result.ok).toBe(false);
    expect(findingCodes(result)).toContain('recipe-cell-underivable');
    if (!result.ok) {
      const f = result.errors.find((e: Finding) => e.code === 'recipe-cell-underivable')!;
      expect(f.message).toContain('recipe "broken"');
      expect(f.message).toContain('domain "foo"');
      expect(f.message).toContain('reviewer');
    }
  });

  it('flags singleton-phase-unknown when singleton.phase is missing', () => {
    const result = loadAndValidate('singleton-phase-unknown.toml');
    expect(result.ok).toBe(false);
    expect(findingCodes(result)).toContain('singleton-phase-unknown');
    if (!result.ok) {
      const f = result.errors.find((e: Finding) => e.code === 'singleton-phase-unknown')!;
      expect(f.message).toContain('singleton "plan-skeptic"');
      expect(f.message).toContain('nonexistent');
    }
  });

  it('flags singleton-personality-unknown when singleton.personality is missing', () => {
    const result = loadAndValidate('singleton-personality-unknown.toml');
    expect(result.ok).toBe(false);
    expect(findingCodes(result)).toContain('singleton-personality-unknown');
    if (!result.ok) {
      const f = result.errors.find((e: Finding) => e.code === 'singleton-personality-unknown')!;
      expect(f.message).toContain('singleton "ghost"');
    }
  });

  it('flags singleton-cell-underivable when singleton.phase is not in personality.phases', () => {
    const result = loadAndValidate('singleton-cell-underivable.toml');
    expect(result.ok).toBe(false);
    expect(findingCodes(result)).toContain('singleton-cell-underivable');
    if (!result.ok) {
      const f = result.errors.find((e: Finding) => e.code === 'singleton-cell-underivable')!;
      expect(f.message).toContain('singleton "plan-skeptic"');
      expect(f.message).toContain('plan');
    }
  });

  it('flags retained-collides-with-derived-cell when retained name matches a domain', () => {
    const result = loadAndValidate('retained-collides-with-derived-cell.toml');
    expect(result.ok).toBe(false);
    expect(findingCodes(result)).toContain('retained-collides-with-derived-cell');
    if (!result.ok) {
      const f = result.errors.find(
        (e: Finding) => e.code === 'retained-collides-with-derived-cell',
      )!;
      expect(f.message).toContain('retained "foo"');
      expect(f.message).toContain('evaluator-foo');
    }
  });

  it('flags phase-default-personality-unknown when default_personality is missing', () => {
    const result = loadAndValidate('phase-default-personality-unknown.toml');
    expect(result.ok).toBe(false);
    expect(findingCodes(result)).toContain('phase-default-personality-unknown');
    if (!result.ok) {
      const f = result.errors.find(
        (e: Finding) => e.code === 'phase-default-personality-unknown',
      )!;
      expect(f.message).toContain('default_personality "ghost"');
      expect(f.location).toContain('axis.phase.reviewer.default_personality');
    }
  });

  it('flags writes-domain-missing-reviewer when a write domain has no reviewer', () => {
    const result = loadAndValidate('writes-domain-missing-reviewer.toml');
    expect(result.ok).toBe(false);
    const codes = findingCodes(result);
    expect(codes).toContain('writes-domain-missing-reviewer');
    // The grant is present, so the verify-grant lint must NOT also fire.
    expect(codes).not.toContain('writes-domain-missing-verify-grant');
    if (!result.ok) {
      const f = result.errors.find(
        (e: Finding) => e.code === 'writes-domain-missing-reviewer',
      )!;
      expect(f.message).toContain('domain "foo"');
      expect(f.location).toContain('axis.domain.foo.phases');
    }
  });

  it('flags writes-domain-missing-verify-grant when a write domain has empty tool_grants', () => {
    const result = loadAndValidate('writes-domain-missing-verify-grant.toml');
    expect(result.ok).toBe(false);
    const codes = findingCodes(result);
    expect(codes).toContain('writes-domain-missing-verify-grant');
    // The reviewer phase is present, so the missing-reviewer lint must NOT fire.
    expect(codes).not.toContain('writes-domain-missing-reviewer');
    if (!result.ok) {
      const f = result.errors.find(
        (e: Finding) => e.code === 'writes-domain-missing-verify-grant',
      )!;
      expect(f.message).toContain('domain "foo"');
      expect(f.location).toContain('axis.domain.foo.tool_grants');
    }
  });
});
