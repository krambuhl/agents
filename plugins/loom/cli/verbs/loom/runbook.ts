import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { LoomError } from '../../lib/errors.ts';
import { readDictionary, resolveSites, scanSites } from '../../lib/runbook.ts';
import type { CliContext, DispatchResult } from './project.ts';

// `loom runbook scan <root> [--dict=<path>]` enumerates the migration site
// annotations under <root> (the in-code work inventory, Phase 6). With --dict
// it resolves each site against the runbook (migration dictionary) and reports
// how many reference an unknown entry, so a migration run can fail loud.

function emit(value: unknown, pretty: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function errToResult(err: unknown): DispatchResult {
  if (err instanceof LoomError) {
    return { stderr: JSON.stringify(err.toPayload()), exitCode: 1 };
  }
  throw err;
}

const SCAN_OPTIONS = {
  dict: { type: 'string' as const },
  pretty: { type: 'boolean' as const },
};

function scanVerb(rest: string[]): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: SCAN_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const root = positionals[0] ?? '.';
  if (!existsSync(root)) {
    return errToResult(new LoomError('root-not-found', `scan root does not exist: ${root}`));
  }
  const sites = scanSites(resolve(root));

  if (values.dict === undefined) {
    return { stdout: emit({ count: sites.length, sites }, values.pretty === true), exitCode: 0 };
  }
  if (!existsSync(values.dict)) {
    return errToResult(new LoomError('dict-not-found', `--dict does not exist at ${values.dict}`));
  }
  const resolved = resolveSites(sites, readDictionary(values.dict));
  const unknown = resolved.filter((s) => !s.known).length;
  return {
    stdout: emit({ count: resolved.length, unknown, sites: resolved }, values.pretty === true),
    exitCode: 0,
  };
}

export function runbookVerb(rest: string[], _ctx: CliContext): DispatchResult {
  if (rest[0] === 'scan') return scanVerb(rest.slice(1));
  return errToResult(
    new LoomError('unknown-subverb', `runbook: unknown sub-verb '${rest[0] ?? ''}'; expected 'scan'`),
  );
}

export const RUNBOOK_VERBS = {
  runbook: runbookVerb,
};
