// guild verb registry — flat verb namespace.
// Each verb is a standalone operation in the antagonist-panel
// substrate (findings JSONL, panel derivation, verdict
// parse-and-aggregate, plan composition). Matches bin/griot's
// flat-verb shape.

import { compileVerb } from './compile-cli.ts';
import { derivePanelVerb } from './derive-panel.ts';
import { findingsVerb } from './findings.ts';
import { parseAndAggregateVerb } from './parse-and-aggregate.ts';
import { recipeVerb } from './recipe.ts';
import { planVerb } from './plan.ts';

export type GuildCliContext = {
  // The repo cwd. Used to resolve project-relative paths
  // (e.g., projects/<slug>/.guild-findings.jsonl) and the
  // PANEL-COMPOSITION.md spec file. Defaults to process.cwd()
  // in the CLI entry; tests inject a tmpdir.
  cwd: string;
  // Stdin contents, read once at dispatcher entry when the process
  // is not running in a TTY. Verbs that consume stdin (parse-and-
  // aggregate, plan append) read it via this field; verbs
  // that don't (findings count, derive-panel) ignore it. Defaults
  // to empty string.
  stdin?: string;
};

export type DispatchResult = {
  stdout?: string;
  stderr?: string;
  exitCode: number;
};

export type GuildVerbHandler = (
  rest: string[],
  ctx: GuildCliContext,
) => DispatchResult;

export const GUILD_VERBS: Record<string, GuildVerbHandler> = {
  compile: compileVerb,
  'derive-panel': derivePanelVerb,
  findings: findingsVerb,
  'parse-and-aggregate': parseAndAggregateVerb,
  recipe: recipeVerb,
  plan: planVerb,
};
