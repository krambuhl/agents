#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import type { CliContext, DispatchResult } from './lib/types.ts';
import { composePreambleVerb } from './verbs/compose-preamble.ts';
import { preflightVerb } from './verbs/preflight.ts';
import { composePrBodyVerb } from './verbs/compose-pr-body.ts';
import { classifyCommentsVerb } from './verbs/classify-comments.ts';
import { buildDispatchTasksVerb } from './verbs/build-dispatch-tasks.ts';

// Shared CLI types live in lib/types.ts (so the entry + verbs import them
// without a cycle: jelly-run.ts imports the verbs for its registry; the
// verbs import these types). Re-exported here for callers/tests that
// import them from the entrypoint. The U1 gate inlined them; U2 migrated
// them to lib/ now that real verbs need to import them.
export type { CliContext, DispatchResult } from './lib/types.ts';

type VerbHandler = (rest: string[], ctx: CliContext) => DispatchResult;

// ---------- Namespace registry ----------
//
// jelly-run's commands are flat (verbless): `jelly-run compose-preamble`,
// etc. Each is the only handler in its namespace, so the namespace IS the
// command (mirrors jelly-loom's verbless namespaces). These verbs expose
// jelly-run's testable core (lib/goal.ts, lib/pr.ts, lib/plan.ts,
// lib/feedback.ts) — the deterministic derivations the thin /jelly-run,
// /jelly-pr, and /jelly-pr-feedback skills shell out to.

export const NAMESPACES: Record<string, string> = {
  'compose-preamble':
    'Compose the /goal preamble for a phase from PLAN.md + git state (carries no "open PR" instruction)',
  preflight:
    'Gate on the running Claude Code version being new enough for /goal (refuses, does not warn)',
  'compose-pr-body':
    'Draft a PR body from PLAN.md + the diff, with per-field confidence scores (JSON)',
  'classify-comments':
    'Classify PR review comments (fixed-intent / ambiguous / stale / discussion-only) with confidence (JSON)',
  'build-dispatch-tasks':
    'Build implementer tasks from classified comments — only high-confidence fixed-intent yields a task (JSON)',
};

// All jelly-run commands are verbless: the whole rest goes to the
// namespace's single handler, not a sub-verb.
const VERBLESS_NAMESPACES: ReadonlySet<string> = new Set([
  'compose-preamble',
  'preflight',
  'compose-pr-body',
  'classify-comments',
  'build-dispatch-tasks',
]);

const VERBS_BY_NAMESPACE: Record<string, Record<string, VerbHandler>> = {
  'compose-preamble': { 'compose-preamble': composePreambleVerb },
  preflight: { preflight: preflightVerb },
  'compose-pr-body': { 'compose-pr-body': composePrBodyVerb },
  'classify-comments': { 'classify-comments': classifyCommentsVerb },
  'build-dispatch-tasks': { 'build-dispatch-tasks': buildDispatchTasksVerb },
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
  // gates this). The not-implemented branch is retained defensively — it
  // fires only if a future namespace is added to NAMESPACES before its
  // verb is wired into VERBS_BY_NAMESPACE (the jelly-run.test.ts no-gaps
  // tripwire guards against that landing silently).
  const verbs = VERBS_BY_NAMESPACE[invocation.namespace];
  if (verbs === undefined) {
    const payload = {
      error: 'not-implemented',
      message: `namespace '${invocation.namespace}' is recognized but not wired up yet`,
      namespace: invocation.namespace,
    };
    return { stderr: JSON.stringify(payload), exitCode: 1 };
  }
  // Verbless namespace: the namespace IS the only handler. Route the
  // entire rest to it (all jelly-run commands are verbless).
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
