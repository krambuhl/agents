#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { planVerb, reviseVerb } from './verbs/plan.ts';
import type {
  PlanCliContext,
  DispatchResult,
  VerbHandler,
} from './verbs/plan.ts';

// `bin/draft`'s context shape is the plan/revise verbs' context.
// Phase 8 retires `bin/draft` entirely; until then the alias keeps
// the existing public type surface intact.
export type DraftCliContext = PlanCliContext;
export type { DispatchResult };

// ---------- Verb registry ----------

// draft has a flat verb namespace. Two verbs after Phase 2 (`read`
// was dropped — no consumers). The Phase 8 cleanup deletes
// `bin/draft` and `cli/draft.ts` entirely; until then the entry
// stays as a thin shim over the relocated handlers.
export const VERBS: Record<string, string> = {
  plan: 'Create a new plan (writes PLAN.md and INTERVIEW.md)',
  revise: 'Replace PLAN.md with a revision and append to ## Revision log',
};

export const DRAFT_VERBS: Record<string, VerbHandler> = {
  plan: planVerb,
  revise: reviseVerb,
};

// ---------- Pure helpers (exported for direct unit tests) ----------

export type Invocation =
  | { kind: 'help' }
  | { kind: 'unknown'; verb: string }
  | { kind: 'verb'; verb: string; rest: string[] };

export function parseInvocation(argv: string[]): Invocation {
  // Look for --help anywhere in argv first.
  if (argv.length === 0) return { kind: 'help' };
  if (argv.includes('--help') || argv.includes('-h')) return { kind: 'help' };

  const [first, ...rest] = argv;
  if (typeof first !== 'string' || first.startsWith('-')) {
    return { kind: 'unknown', verb: first ?? '' };
  }
  if (Object.hasOwn(VERBS, first)) {
    return { kind: 'verb', verb: first, rest };
  }
  return { kind: 'unknown', verb: first };
}

export function formatHelp(): string {
  const verbLines = Object.entries(VERBS).map(
    ([name, purpose]) => `  ${name.padEnd(8)}  ${purpose}`,
  );
  return [
    'draft — grill-me-shaped planning CLI',
    '',
    'Usage:',
    '  draft <verb> [options]',
    '',
    'Verbs:',
    ...verbLines,
    '',
    'Output is JSON by default. Pass --pretty for indented JSON.',
    'Errors emit a structured JSON object on stderr and exit non-zero.',
    'See docs/LOOM-CONVENTIONS.md for full substrate conventions.',
  ].join('\n');
}

export function formatUnknownVerbError(verb: string): string {
  const payload = {
    error: 'unknown-verb',
    message: verb ? `unknown verb: ${verb}` : 'no verb specified',
    candidates: Object.keys(VERBS),
  };
  return JSON.stringify(payload);
}

export function dispatch(
  invocation: Invocation,
  ctx: DraftCliContext,
): DispatchResult {
  if (invocation.kind === 'help') {
    return { stdout: formatHelp(), exitCode: 0 };
  }
  if (invocation.kind === 'unknown') {
    return {
      stderr: formatUnknownVerbError(invocation.verb),
      exitCode: 1,
    };
  }
  const handler = DRAFT_VERBS[invocation.verb];
  if (handler === undefined) {
    // Reachable only if VERBS includes a name not present in
    // DRAFT_VERBS. Kept as a defensive branch so the surface stays
    // consistent if the two registries drift.
    const payload = {
      error: 'not-implemented',
      message: `verb '${invocation.verb}' has no handler yet`,
      verb: invocation.verb,
    };
    return { stderr: JSON.stringify(payload), exitCode: 1 };
  }
  return handler(invocation.rest, ctx);
}

// ---------- Entry ----------

function deriveProjectsRoot(): string {
  return process.env.DRAFT_PROJECTS_ROOT ?? join(process.cwd(), 'projects');
}

function main(argv: string[]): never {
  // parseArgs is invoked here for forward compatibility with top-level
  // flags. Verb-level argument parsing lives in each verb's handler.
  parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
      pretty: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const ctx: DraftCliContext = { projectsRoot: deriveProjectsRoot() };
  const invocation = parseInvocation(argv);
  const result = dispatch(invocation, ctx);
  if (result.stdout !== undefined) process.stdout.write(`${result.stdout}\n`);
  if (result.stderr !== undefined) process.stderr.write(`${result.stderr}\n`);
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
