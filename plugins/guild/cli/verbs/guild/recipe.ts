// guild recipe <name> — read-only runtime resolution of a named panel
// recipe to its member agent names.
//
// axes.toml's [[recipes]] declare named panels (e.g. design-systems =
// composition + abstraction + tokens + naming under the plan phase).
// The /guild-compile pipeline folds them into per-cell agent files;
// this verb is the invocation-time counterpart, so a caller (the
// ev-loop plan dispatch) can learn WHO to spawn for a recipe
// by name. The same recipe declaration drives both codegen and
// runtime resolution, so the roster this emits and the files
// /guild-compile writes cannot drift.
//
// Fails LOUD (recipe-not-found, exit 1) on an unknown name — never an
// empty roster, which would let a mis-cited recipe become a silent thin
// panel. This is a CRUD-shaped read: it resolves names, it does not
// spawn agents or write any file (that stays the loop's / guild
// plan's job).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseToml, TomlParseError, isTomlTable, type TomlTable } from '../../lib/toml.ts';
import type { DispatchResult, GuildCliContext, GuildVerbHandler } from './index.ts';
import { PHASE_PREFIX } from './phase-prefix.ts';

export class RecipeNotFoundError extends Error {}
export class RecipeReadError extends Error {}

export interface Recipe {
  name: string;
  phase: string;
  personality: string;
  domains: string[];
}

function nameFor(phase: string, domain: string): string {
  const prefix = PHASE_PREFIX[phase];
  if (prefix === undefined) {
    throw new RecipeReadError(
      `no agent-name prefix for phase '${phase}' — add an entry to PHASE_PREFIX`,
    );
  }
  return `${prefix}-${domain}`;
}

function readRecipes(axes: TomlTable): Recipe[] {
  const raw = axes.recipes;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new RecipeReadError('axes.toml: recipes is not an array');
  }
  return raw.map((entry, i) => {
    if (!isTomlTable(entry)) {
      throw new RecipeReadError(`recipes[${i}] is not a table`);
    }
    const { name, phase, personality, domains } = entry;
    if (typeof name !== 'string') {
      throw new RecipeReadError(`recipes[${i}] has no string 'name'`);
    }
    if (typeof phase !== 'string') {
      throw new RecipeReadError(`recipes[${i}] has no string 'phase'`);
    }
    if (typeof personality !== 'string') {
      throw new RecipeReadError(`recipes[${i}] has no string 'personality'`);
    }
    if (!Array.isArray(domains) || !domains.every((d) => typeof d === 'string')) {
      throw new RecipeReadError(`recipes[${i}] has no string[] 'domains'`);
    }
    return { name, phase, personality, domains: domains as string[] };
  });
}

// Resolve a recipe by name to its member agent names. Maps each of
// the recipe's domains through the SAME `nameFor(phase, domain)`
// mapping the compile pipeline uses, so the resolved roster and the
// generated files cannot name different agents. Fails LOUD on an
// unknown name (RecipeNotFoundError) — never an empty roster, which
// would let a mis-cited recipe degrade to a silently thin panel.
export function resolveRecipe(axes: TomlTable, name: string): string[] {
  const recipes = readRecipes(axes);
  const recipe = recipes.find((r) => r.name === name);
  if (recipe === undefined) {
    const known = recipes.map((r) => r.name).join(', ');
    throw new RecipeNotFoundError(
      `recipe-not-found: no recipe named '${name}'${known ? ` (known: ${known})` : ''}`,
    );
  }
  return recipe.domains.map((domain) => nameFor(recipe.phase, domain));
}

// axes.toml sits under the plugin root's modes/ dir, a fixed offset
// from this verb (plugins/guild/cli/verbs/guild/recipe.ts ->
// plugins/guild/modes). Resolve module-relative, not from cwd, so it
// works from an installed copy too.
export function defaultAxesPath(): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'modes',
    'axes.toml',
  );
}

export const recipeVerb: GuildVerbHandler = (
  rest: string[],
  _ctx: GuildCliContext,
): DispatchResult => {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      pretty: { type: 'boolean' },
      manifest: { type: 'string' },
    },
    allowPositionals: true,
    strict: false,
  });
  const name = positionals[0];
  if (name === undefined) {
    return { stderr: 'guild-recipe-error: recipe requires a <name>', exitCode: 1 };
  }
  // `--manifest` is kept as the flag name for back-compat (the verb's
  // CLI surface stayed stable through the codegen rewrite — only the
  // default file changed from panel.manifest.toml to axes.toml). A
  // caller can still override with --manifest=<path> to point at any
  // axes-shaped TOML file.
  const axesPath = values.manifest ?? defaultAxesPath();
  let axes: TomlTable;
  try {
    axes = parseToml(readFileSync(axesPath, 'utf8'));
  } catch (err) {
    const reason =
      err instanceof TomlParseError
        ? `axes.toml unparseable: ${err.message}`
        : `cannot read ${axesPath}: ${(err as Error).message}`;
    return { stderr: `guild-recipe-error: ${reason}`, exitCode: 1 };
  }

  try {
    const members = resolveRecipe(axes, name);
    const payload = { name, members };
    return {
      stdout: values.pretty === true
        ? JSON.stringify(payload, null, 2)
        : JSON.stringify(payload),
      exitCode: 0,
    };
  } catch (err) {
    if (err instanceof RecipeNotFoundError) {
      return { stderr: `guild-recipe-error: ${err.message}`, exitCode: 1 };
    }
    if (err instanceof RecipeReadError) {
      return { stderr: `guild-recipe-error: ${err.message}`, exitCode: 1 };
    }
    throw err;
  }
};
