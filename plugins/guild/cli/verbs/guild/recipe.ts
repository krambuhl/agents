// guild recipe <name> — read-only runtime resolution of a named panel
// recipe to its member agent names.
//
// panel.manifest.toml's [[recipes]] declare named planner-phase panels
// (e.g. design-systems = composition + abstraction + tokens + naming).
// Codegen folds them into per-domain agent files; this verb is the
// invocation-time counterpart, so a caller (the ev-loop whiteboard
// dispatch) can learn WHO to spawn for a recipe by name. Resolution and
// codegen share `resolveRecipe`/`nameFor`, so the roster this emits and
// the files codegen writes cannot drift.
//
// Fails LOUD (recipe-not-found, exit 1) on an unknown name — never an
// empty roster, which would let a mis-cited recipe become a silent thin
// panel. This is a CRUD-shaped read: it resolves names, it does not spawn
// agents or write any file (that stays the loop's / guild whiteboard's job).

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseToml, TomlParseError } from '../../lib/toml.ts';
import { resolveRecipe, RecipeNotFoundError } from './generate.ts';
import type { DispatchResult, GuildVerbHandler } from './index.ts';

// The core panel manifest sits at the plugin root, a fixed offset from this
// verb (plugins/guild/cli/verbs/guild/recipe.ts -> plugins/guild). Resolve
// module-relative, not from cwd, so it works from an installed copy too.
function defaultManifestPath(): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'panel.manifest.toml',
  );
}

export const recipeVerb: GuildVerbHandler = (rest: string[]): DispatchResult => {
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
  const manifestPath = values.manifest ?? defaultManifestPath();
  let manifest;
  try {
    manifest = parseToml(readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    const reason =
      err instanceof TomlParseError
        ? `panel.manifest.toml unparseable: ${err.message}`
        : `cannot read ${manifestPath}: ${(err as Error).message}`;
    return { stderr: `guild-recipe-error: ${reason}`, exitCode: 1 };
  }

  try {
    const members = resolveRecipe(manifest, name);
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
    throw err;
  }
};
