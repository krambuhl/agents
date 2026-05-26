#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { CliContext, DispatchResult } from './lib/types.ts';
import { RESEARCH_VERBS } from './verbs/research.ts';
import { PLAN_VERBS } from './verbs/plan.ts';
import { REVISE_VERBS } from './verbs/revise.ts';

// Shared CLI types live in lib/types.ts (so the entry + verbs import
// them without a cycle). Re-exported here for callers/tests that
// import them from the entrypoint.
export type { CliContext, DispatchResult } from './lib/types.ts';

type VerbHandler = (rest: string[], ctx: CliContext) => DispatchResult;

// ---------- Namespace registry ----------
//
// All four jelly namespaces are VERBLESS single-handler namespaces:
// `jelly research <slug-or-topic>`, `jelly plan <slug-or-topic> ...`,
// `jelly revise <slug> --target=plan|research`, `jelly adr <title> ...`.
// The first positional after the namespace is the handler's first arg,
// not a sub-verb.

export const NAMESPACES: Record<string, string> = {
  research: 'Create a research dossier (writes RESEARCH.md + RESEARCH-NOTES.md)',
  plan: 'Create a plan (writes PLAN.md + INTERVIEW.md + manifest.toml; manages the project CLAUDE.md @-import)',
  revise: 'Replace PLAN.md or RESEARCH.md with a revision and append to its revision log (--target=plan|research)',
  adr: 'Append a workspace-level Architectural Decision Record (projects/adr-log/NNNN-<slug>.md)',
};

const VERBLESS_NAMESPACES: ReadonlySet<string> = new Set([
  'research',
  'plan',
  'revise',
  'adr',
]);

// Namespaces with wired-up verb handlers. research (U3) + plan (U4) +
// revise (U5) are wired; adr (U6) remains unwired and returns the
// `not-implemented` placeholder until its verb lands.
const VERBS_BY_NAMESPACE: Record<string, Record<string, VerbHandler>> = {
  research: RESEARCH_VERBS,
  plan: PLAN_VERBS,
  revise: REVISE_VERBS,
};

// ---------- Pure helpers (exported for direct unit tests) ----------

export type Invocation =
  | { kind: 'help' }
  | { kind: 'unknown'; verb: string }
  | { kind: 'verb'; namespace: string; rest: string[] };

export function parseInvocation(argv: string[]): Invocation {
  if (argv.length === 0) return { kind: 'help' };
  if (argv.includes('--help') || argv.includes('-h')) return { kind: 'help' };

  const [first, ...rest] = argv;
  if (typeof first !== 'string' || first.startsWith('-')) {
    return { kind: 'unknown', verb: first ?? '' };
  }
  if (Object.hasOwn(NAMESPACES, first)) {
    return { kind: 'verb', namespace: first, rest };
  }
  return { kind: 'unknown', verb: first };
}

export function formatHelp(): string {
  const namespaceLines = Object.entries(NAMESPACES).map(
    ([name, purpose]) => `  ${name.padEnd(8)}  ${purpose}`,
  );
  return [
    'jelly — record-keeping + plan-lifecycle CLI (jelly substrate)',
    '',
    'Usage:',
    '  jelly <namespace> [args] [options]',
    '',
    'Namespaces:',
    ...namespaceLines,
    '',
    'Output is JSON by default. Pass --pretty on read paths for human view.',
    'Errors emit a structured JSON object on stderr and exit non-zero.',
    'The project manifest is TOML (manifest.toml); jelly keeps no events.jsonl.',
  ].join('\n');
}

export function formatUnknownVerbError(verb: string): string {
  const payload = {
    error: 'unknown-verb',
    message: verb ? `unknown verb: ${verb}` : 'no verb specified',
    candidates: Object.keys(NAMESPACES),
  };
  return JSON.stringify(payload);
}

export function dispatch(invocation: Invocation, ctx: CliContext): DispatchResult {
  if (invocation.kind === 'help') {
    return { stdout: formatHelp(), exitCode: 0 };
  }
  if (invocation.kind === 'unknown') {
    return { stderr: formatUnknownVerbError(invocation.verb), exitCode: 1 };
  }
  const verbs = VERBS_BY_NAMESPACE[invocation.namespace];
  if (verbs === undefined) {
    // Namespace recognized but no verbs wired up yet (U1 shell;
    // verbs land in U3-U6).
    const payload = {
      error: 'not-implemented',
      message: `namespace '${invocation.namespace}' is recognized but not wired up yet`,
      namespace: invocation.namespace,
    };
    return { stderr: JSON.stringify(payload), exitCode: 1 };
  }
  // Verbless namespace: the namespace IS the only handler. Route the
  // entire rest to it. (Unreachable in U1 — VERBS_BY_NAMESPACE is
  // empty — but the structure is here for U3+.)
  if (VERBLESS_NAMESPACES.has(invocation.namespace)) {
    const handler = verbs[invocation.namespace];
    if (handler !== undefined) {
      return handler(invocation.rest, ctx);
    }
  }
  const verbName = invocation.rest[0];
  if (verbName === undefined) {
    const payload = {
      error: 'missing-verb',
      message: `${invocation.namespace} requires a verb`,
      candidates: Object.keys(verbs),
    };
    return { stderr: JSON.stringify(payload), exitCode: 1 };
  }
  const handler = verbs[verbName];
  if (handler === undefined) {
    const payload = {
      error: 'unknown-verb',
      message: `unknown verb: ${invocation.namespace} ${verbName}`,
      candidates: Object.keys(verbs),
    };
    return { stderr: JSON.stringify(payload), exitCode: 1 };
  }
  return handler(invocation.rest.slice(1), ctx);
}

// ---------- Entry ----------

function deriveProjectsRoot(): string {
  return process.env.JELLY_PROJECTS_ROOT ?? join(process.cwd(), 'projects');
}

function main(argv: string[]): never {
  // parseArgs is called for forward compatibility with top-level flags.
  // Verb-level argument parsing lives in each handler (U3+).
  parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
      pretty: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const ctx: CliContext = {
    projectsRoot: deriveProjectsRoot(),
    repoRoot: process.env.JELLY_REPO_ROOT ?? process.cwd(),
  };
  const invocation = parseInvocation(argv);
  const result = dispatch(invocation, ctx);
  if (result.stdout !== undefined) process.stdout.write(result.stdout + '\n');
  if (result.stderr !== undefined) process.stderr.write(result.stderr + '\n');
  process.exit(result.exitCode);
}

function isEntryPoint(): boolean {
  const arg1 = process.argv[1];
  if (!arg1) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(arg1);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2));
}
