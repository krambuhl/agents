#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { join } from 'node:path';
import { resolveStoreRepoRoot } from './lib/git.ts';
import { PROJECT_VERBS } from './verbs/loom/project.ts';
import { PHASE_VERBS } from './verbs/loom/phase.ts';
import { EVENTS_VERBS } from './verbs/loom/events.ts';
import { CHECKIN_VERBS } from './verbs/loom/checkin.ts';
import { SESSION_VERBS } from './verbs/loom/session.ts';
import { RETRO_VERBS } from './verbs/loom/retro.ts';
import { DOCTOR_VERBS } from './verbs/loom/doctor.ts';
import { PR_VERBS } from './verbs/loom/pr.ts';
import {
  PLAN_VERBS,
  REVISE_PLAN_VERBS,
  PARSE_PLAN_VERBS,
} from './verbs/loom/plan.ts';
import { RESEARCH_VERBS } from './verbs/loom/research.ts';
import { ADR_VERBS } from './verbs/loom/adr.ts';
import { DECISION_VERBS } from './verbs/loom/decision.ts';
import { RUNBOOK_VERBS } from './verbs/loom/runbook.ts';
import { FINDINGS_VERBS } from './verbs/loom/findings.ts';
import type { CliContext, DispatchResult } from './verbs/loom/project.ts';

export type { CliContext, DispatchResult };

// ---------- Namespace registry ----------

export const NAMESPACES: Record<string, string> = {
  project: 'Manage projects: scaffold, adopt, read, list, status, archive',
  phase: 'Read and update phase state',
  events: 'Read the project event log',
  checkin: 'Write and read unit-of-work checkins',
  session: 'Write and read session handoffs',
  pr: 'Open, update, and respond to GitHub PRs',
  retro: 'Write and read retrospectives',
  doctor: 'Project health check',
  plan: 'Create a new plan (writes PLAN.md and INTERVIEW.md)',
  'revise-plan':
    'Replace PLAN.md with a revision and append to ## Revision log',
  research: 'Create a new research dossier (writes RESEARCH.md + RESEARCH-NOTES.md)',
  'parse-plan': 'Parse a project PLAN.md into a typed tree + diagnostics (JSON)',
  adr: 'Append a workspace-level Architectural Decision Record',
  decision: 'Record a project-scoped decision (projects/<slug>/decisions/NNNN-*.md)',
  runbook: 'Scan a tree for in-code migration site annotations (decentralized work inventory)',
  findings: 'Harvest guild evaluator findings into the manifest [[findings]] section',
};

// Namespaces with wired-up verb handlers as of this unit. Recognized
// namespaces NOT in this map return the `not-implemented` placeholder.
type VerbHandler = (rest: string[], ctx: CliContext) => DispatchResult;
const VERBS_BY_NAMESPACE: Record<string, Record<string, VerbHandler>> = {
  project: PROJECT_VERBS,
  phase: PHASE_VERBS,
  events: EVENTS_VERBS,
  checkin: CHECKIN_VERBS,
  session: SESSION_VERBS,
  retro: RETRO_VERBS,
  pr: PR_VERBS,
  doctor: DOCTOR_VERBS,
  plan: PLAN_VERBS,
  'revise-plan': REVISE_PLAN_VERBS,
  research: RESEARCH_VERBS,
  'parse-plan': PARSE_PLAN_VERBS,
  adr: ADR_VERBS,
  decision: DECISION_VERBS,
  runbook: RUNBOOK_VERBS,
  findings: FINDINGS_VERBS,
};

// Verbless namespaces are single-handler namespaces (per
// LOOM-CONVENTIONS.md: `loom doctor [<slug>]`, `loom plan <slug-or-topic>
// ...`, `loom revise-plan <slug> ...`). The first verb-position argument
// is treated as the first handler arg.
//
// `research` is NOT verbless: it is a subverb family (`init`, plus
// `append`/`show` in the next unit), so the bare `loom research <slug>`
// form now errors and callers use `loom research init <slug> ...`.
const VERBLESS_NAMESPACES: ReadonlySet<string> = new Set([
  'doctor',
  'plan',
  'revise-plan',
  'parse-plan',
  'adr',
  'decision',
  'runbook',
]);

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
  // Pad to the longest namespace name so descriptions align in a column.
  // Derived (not a hardcoded 8) so a longer verb like `revise-plan` can't
  // silently break the alignment again.
  const width = Math.max(...Object.keys(NAMESPACES).map((n) => n.length));
  const namespaceLines = Object.entries(NAMESPACES).map(
    ([name, purpose]) => `  ${name.padEnd(width)}  ${purpose}`,
  );
  return [
    'loom — project-substrate CLI',
    '',
    'Usage:',
    '  loom <namespace> <verb> [options]',
    '',
    'Namespaces:',
    ...namespaceLines,
    '',
    'Output is JSON by default. Pass --pretty on read verbs for human view.',
    'Errors emit a structured JSON object on stderr and exit non-zero.',
    'See docs/LOOM-CONVENTIONS.md for full conventions.',
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
    return {
      stderr: formatUnknownVerbError(invocation.verb),
      exitCode: 1,
    };
  }
  const verbs = VERBS_BY_NAMESPACE[invocation.namespace];
  if (verbs === undefined) {
    // Namespace recognized but no verbs wired up yet (units after 03).
    const payload = {
      error: 'not-implemented',
      message: `namespace '${invocation.namespace}' has no verbs yet`,
      namespace: invocation.namespace,
    };
    return { stderr: JSON.stringify(payload), exitCode: 1 };
  }
  // Verbless namespace: the namespace IS the only verb. Route the
  // entire rest as args to that single handler.
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
  return process.env.LOOM_PROJECTS_ROOT ?? join(process.cwd(), 'projects');
}

// The repo loom commits project state INTO — the git work-tree that holds
// `projectsRoot`, NOT the process cwd. Under `--env=coder` dispatch the cwd
// is the *code* repo (e.g. ~/patreon_react_features) while the store is a
// separate clone (e.g. ~/projects) named by LOOM_PROJECTS_ROOT; committing
// to cwd would stage a store path in the wrong repo (ADR-0011, decision
// 0014). undefined when the store isn't in a git repo yet — verbs then fall
// back to their cwd default, preserving pre-store-sync behavior.
function deriveStoreRoot(projectsRoot: string): string | undefined {
  return resolveStoreRepoRoot(projectsRoot) ?? undefined;
}

// Whether loom should rebase-and-push after committing state. True only for
// the DISTRIBUTED store — a store repo distinct from the cwd's repo — so we
// never auto-push a monorepo where `projects/` rides inside the working
// repo's own commit workflow. `LOOM_STORE_NO_PUSH=1` forces it off.
function deriveStoreAutosync(storeRoot: string | undefined): boolean {
  if (storeRoot === undefined) return false;
  if (process.env.LOOM_STORE_NO_PUSH === '1') return false;
  const cwdRoot = resolveStoreRepoRoot(process.cwd());
  return cwdRoot !== storeRoot; // null (cwd not a repo) counts as distinct → push
}

function main(argv: string[]): never {
  // parseArgs is called for forward compatibility with top-level flags.
  // Verb-level argument parsing lives in each handler.
  parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean', short: 'h' },
      pretty: { type: 'boolean' },
    },
    allowPositionals: true,
    strict: false,
  });

  const projectsRoot = deriveProjectsRoot();
  const storeRoot = deriveStoreRoot(projectsRoot);
  const ctx: CliContext = {
    projectsRoot,
    repoRoot: storeRoot,
    storeAutosync: deriveStoreAutosync(storeRoot),
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
