import { test, expect } from 'vitest';
import { recipeVerb } from './recipe.ts';
import type { GuildCliContext } from './index.ts';

// The verb resolves against the real core panel.manifest.toml (module-
// relative, the same file codegen folds), so these are real-artifact checks
// of the wrapper: arg handling, JSON shape, and the fail-loud error mapping.
const ctx: GuildCliContext = { cwd: process.cwd() };

test('recipe: resolves a known recipe to its members as JSON', () => {
  const result = recipeVerb(['design-systems'], ctx);
  expect(result.exitCode).toBe(0);
  const out = JSON.parse(result.stdout as string);
  expect(out.name).toBe('design-systems');
  expect(out.members).toEqual([
    'whiteboard-composition',
    'whiteboard-abstraction',
    'whiteboard-tokens',
    'whiteboard-naming',
  ]);
});

test('recipe: --pretty emits indented JSON', () => {
  const result = recipeVerb(['design-systems', '--pretty'], ctx);
  expect(result.exitCode).toBe(0);
  expect(result.stdout).toContain('\n  "members"');
});

test('recipe: an unknown recipe fails loud (exit 1, recipe-not-found)', () => {
  const result = recipeVerb(['no-such-recipe'], ctx);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('recipe-not-found');
  expect(result.stdout).toBeUndefined();
});

test('recipe: a missing name argument is an error', () => {
  const result = recipeVerb([], ctx);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('guild-recipe-error');
});
