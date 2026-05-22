#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { configure, type DispatchResult } from './verbs/configure.ts';
import { PROJECT_VERBS } from './verbs/project.ts';
import { research } from './verbs/research.ts';

// ---------- Namespace registry ----------
//
// Mirrors `bin/loom`'s namespace surface 1:1 per DESIGN.md § 3, plus
// linear-loom-specific verbs (`configure`, `tasks`) introduced in
// DESIGN.md § 10 and § 12. Phase 2 registered names only; Phase 3
// begins wiring real verb handlers (configure ships in U1, project
// verbs in U2-U4).

const NAMESPACES: Record<string, string> = {
  project: 'Manage projects: create, read, status, list, archive (Phase 3)',
  phase: 'Read and update phase state — maps to Linear Milestone state (Phase 3)',
  checkin: 'Post unit-of-work check-ins as comments on Linear Sub-Issues (Phase 6)',
  task: 'Comment on Linear Sub-Issues by composed stable ID (Phase 6)',
  events: 'Read project audit trail synthesized from Linear native audit data (Phase 6)',
  session: 'Write and read session handoffs (Phase 6)',
  retro: 'Write and read retrospectives (Phase 4)',
  pr: 'PR linkage notes — Linear native GitHub integration owns the wiring (DESIGN.md § 20)',
  doctor: 'Project health check (Phase 6)',
  plan: 'Create a new plan (writes PLAN.md, uploads INTERVIEW.md as Linear Document) (Phase 4)',
  'revise-plan': 'Replace PLAN.md with a revision (Phase 4)',
  research: 'Create a new research dossier (writes RESEARCH.md, uploads to Linear) (Phase 4)',
  configure: 'Idempotent Linear workspace schema bootstrap (Phase 3)',
  tasks: 'Generate / reconcile Linear Sub-Issues from PLAN.md (Phase 5)',
};

// Namespaces with wired-up async handlers. Recognized namespaces NOT
// in either map fall through to the `not-implemented` placeholder.
type VerbHandler = (rest: string[]) => Promise<DispatchResult>;
const VERBLESS_HANDLERS: Record<string, VerbHandler> = {
  configure: (rest) => configure(rest),
  research: (rest) => research(rest),
};

const VERB_HANDLERS: Record<string, Record<string, VerbHandler>> = {
  project: PROJECT_VERBS,
};

function printHelp(): void {
  process.stdout.write(`linear-loom — Linear-backed project substrate CLI

Usage:
  linear-loom <namespace> <verb> [options]
  linear-loom --help

Namespaces:
`);
  const widest = Math.max(...Object.keys(NAMESPACES).map((n) => n.length));
  for (const [name, desc] of Object.entries(NAMESPACES)) {
    process.stdout.write(`  ${name.padEnd(widest + 2)}${desc}\n`);
  }
  process.stdout.write(`
Output is JSON by default. Pass --pretty on read verbs for human view.
Errors emit a structured JSON object on stderr and exit non-zero.
See plugins/linear-loom/docs/DESIGN.md for the full surface.

Phase 3 wires configure in U1 and the project verbs in U2-U4. All
other namespaces still return the structured 'not-implemented' error
pointing at the phase that ships the verb.
`);
}

function notImplemented(namespace: string, verb: string | undefined): void {
  const payload = {
    error: 'not-implemented',
    namespace,
    verb: verb ?? null,
    message: `linear-loom ${namespace}${verb ? ` ${verb}` : ''} is not implemented yet. See plugins/linear-loom/docs/DESIGN.md for the wiring phase.`,
  };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exit(2);
}

function writeResult(result: DispatchResult): never {
  if (result.stdout !== undefined && result.stdout !== '') {
    process.stdout.write(result.stdout);
    if (!result.stdout.endsWith('\n')) process.stdout.write('\n');
  }
  if (result.stderr !== undefined && result.stderr !== '') {
    process.stderr.write(result.stderr);
  }
  process.exit(result.exitCode);
}

async function main(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: {
      help: { type: 'boolean' as const, short: 'h' },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.help === true || positionals.length === 0) {
    printHelp();
    process.exit(0);
  }

  const namespace = positionals[0];
  if (namespace === undefined || !(namespace in NAMESPACES)) {
    process.stderr.write(
      `${JSON.stringify({
        error: 'unknown-namespace',
        namespace: namespace ?? null,
        candidates: Object.keys(NAMESPACES),
      })}\n`,
    );
    process.exit(2);
  }

  const verblessHandler = VERBLESS_HANDLERS[namespace];
  if (verblessHandler !== undefined) {
    const result = await verblessHandler(positionals.slice(1));
    writeResult(result);
  }

  const namespaceHandlers = VERB_HANDLERS[namespace];
  if (namespaceHandlers !== undefined) {
    const verb = positionals[1];
    if (verb === undefined) {
      process.stderr.write(
        `${JSON.stringify({
          error: 'missing-verb',
          namespace,
          candidates: Object.keys(namespaceHandlers),
        })}\n`,
      );
      process.exit(2);
    }
    const handler = namespaceHandlers[verb];
    if (handler === undefined) {
      process.stderr.write(
        `${JSON.stringify({
          error: 'unknown-verb',
          namespace,
          verb,
          candidates: Object.keys(namespaceHandlers),
        })}\n`,
      );
      process.exit(2);
    }
    const result = await handler(positionals.slice(2));
    writeResult(result);
  }

  const verb = positionals[1];
  notImplemented(namespace, verb);
}

main(process.argv.slice(2)).catch((err) => {
  process.stderr.write(
    `${JSON.stringify({
      error: 'unhandled-error',
      message: (err as Error).message,
      stack: (err as Error).stack,
    })}\n`,
  );
  process.exit(3);
});
