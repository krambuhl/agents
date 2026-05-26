import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import type { CliContext, DispatchResult } from '../lib/types.ts';
import { JellyRunError } from '../lib/errors.ts';
import { assertGoalVersion } from '../lib/goal.ts';

// `jelly-run preflight [--version=<x.y.z>]`
//
// The /goal version GATE the /jelly-run skill runs first: it STOPS on a
// non-zero exit rather than proceeding on a guess. When --version is
// omitted, the verb reads `claude --version`. The gate logic itself is
// pure (lib/goal.ts assertGoalVersion); this verb only sources the
// version string.
//
// `ctx` is unused (the verb reads the CLI version, not project state) but
// kept in the handler signature so every verb shares one shape.
export function preflightVerb(rest: string[], _ctx: CliContext): DispatchResult {
  const { values } = parseArgs({
    args: rest,
    options: { version: { type: 'string' } },
    allowPositionals: true,
    strict: false,
  });

  let version = values.version;
  if (version === undefined) {
    const result = spawnSync('claude', ['--version'], { encoding: 'utf8' });
    if (result.status !== 0 || typeof result.stdout !== 'string') {
      const payload = new JellyRunError(
        'claude-version-unavailable',
        `could not read 'claude --version' (status ${result.status ?? 'null'}); pass --version explicitly`,
      ).toPayload();
      return { stderr: JSON.stringify(payload), exitCode: 1 };
    }
    // `claude --version` prints e.g. "2.1.139 (Claude Code)"; take the
    // leading dotted-numeric token.
    version = result.stdout.trim().split(/\s+/)[0] ?? '';
  }

  return assertGoalVersion(version);
}
