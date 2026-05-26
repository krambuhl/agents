#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';

// ---------- Shared CLI types ----------
//
// Inlined in the entry for the U1 gate (the plugin has no verbs yet, so
// there is nothing to import them from without a cycle). When the first
// verbs land (U2), these move to cli/lib/types.ts so verb modules can
// import them — mirroring jelly-loom's cli/lib/types.ts split.

export interface CliContext {
  // Absolute path to the projects root (jelly-loom-managed projects).
  projectsRoot: string;
  // Absolute path to the repo root the run targets (git + PLAN.md live here).
  repoRoot: string;
}

export interface DispatchResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

type VerbHandler = (rest: string[], ctx: CliContext) => DispatchResult;

// ---------- Namespace registry ----------
//
// EMPTY in the U1 gate. jelly-run ships its own testable CLI (the
// whiteboard decision: deterministic logic — preamble composition,
// comment classification, PR-field confidence scoring — lives here as
// pure functions the thin skills shell out to). The verbs land in
// U2 (/jelly-run + /jelly-pr) and U3 (/jelly-pr-feedback). Until then
// the dispatcher only resolves --help and unknown-verb, and the
// jelly-run.test.ts no-gaps tripwire guards against a namespace being
// added here before its verb is wired into VERBS_BY_NAMESPACE.

export const NAMESPACES: Record<string, string> = {};

const VERBS_BY_NAMESPACE: Record<string, Record<string, VerbHandler>> = {};

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
  const namespaceEntries = Object.entries(NAMESPACES);
  const namespaceSection =
    namespaceEntries.length === 0
      ? ['  (no verbs yet — the orchestration skills + their CLI verbs land in U2-U3)']
      : namespaceEntries.map(([name, purpose]) => `  ${name.padEnd(10)}  ${purpose}`);
  return [
    'jelly-run — orchestration CLI (jelly substrate)',
    '',
    'Backs the /jelly-run, /jelly-pr, and /jelly-pr-feedback skills with',
    'testable derivations (preamble composition, comment classification,',
    'PR-field confidence scoring). The skills are thin glue over these verbs.',
    '',
    'Usage:',
    '  jelly-run <verb> [args] [options]',
    '',
    'Verbs:',
    ...namespaceSection,
    '',
    'Output is JSON by default. Errors emit a structured JSON object on',
    'stderr and exit non-zero.',
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
  // invocation.kind === 'verb': namespace is in NAMESPACES (parseInvocation
  // gates this), but it may not be wired to a handler yet. Unreachable in
  // the U1 gate (NAMESPACES is empty); the structure is here so U2 only
  // populates the two registries above. ctx is threaded to handlers.
  const verbs = VERBS_BY_NAMESPACE[invocation.namespace];
  if (verbs === undefined) {
    const payload = {
      error: 'not-implemented',
      message: `namespace '${invocation.namespace}' is recognized but not wired up yet`,
      namespace: invocation.namespace,
    };
    return { stderr: JSON.stringify(payload), exitCode: 1 };
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
  // Verb-level argument parsing lives in each handler (U2+).
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
