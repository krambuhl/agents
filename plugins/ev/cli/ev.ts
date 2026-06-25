#!/usr/bin/env node
// ev — loop-layer CLI. Today it ships one namespace: `env`, the
// environment-provider seam (ADR-0010). The loop drivers (/ev-run,
// /ev-goal) shell out to `ev env …` under their `--env` flag to
// provision and run work in a fella (home/OrbStack) or coder (work/
// cloud) environment, selected by machine-local config.

import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import {
  ENV_OPS,
  EnvironmentError,
  loadEnvironmentConfig,
  planCommand,
  resolveProvider,
  type EnvOp,
  type ResolvedProvider,
} from './lib/environment.ts';

function fail(err: unknown): never {
  if (err instanceof EnvironmentError) {
    process.stderr.write(`${JSON.stringify(err.toPayload())}\n`);
    process.exit(1);
  }
  throw err;
}

// Find the machine-local settings file: an explicit --config wins,
// else the nearest .claude/settings.local.json walking up from cwd,
// else ~/.claude/settings.local.json. Returns null if none exists.
function findSettingsPath(explicit?: string): string | null {
  if (explicit !== undefined && explicit !== '') {
    return existsSync(explicit) ? explicit : null;
  }
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, '.claude', 'settings.local.json');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const home = join(homedir(), '.claude', 'settings.local.json');
  return existsSync(home) ? home : null;
}

function readSettings(explicit?: string): unknown {
  const path = findSettingsPath(explicit);
  if (path === null) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new EnvironmentError(
      'env-settings-unreadable',
      `could not read/parse ${path}: ${(err as Error).message}`,
    );
  }
}

function resolve(opts: { config?: string; provider?: string }): ResolvedProvider {
  const settings = readSettings(opts.config);
  const config = loadEnvironmentConfig(settings);
  return resolveProvider(config, opts.provider);
}

const USAGE = `ev env <which|up|exec|status|down> [args]

  ev env which                          show the resolved provider + templates
  ev env up <project>                   provision-or-reuse an environment
  ev env exec <handle> --cmd="<cmd>"    run a command inside the environment
  ev env status <handle>                report readiness
  ev env down <handle>                  tear the environment down

Flags:
  --dry-run            print the command instead of running it
  --provider=<name>    override the configured provider
  --config=<path>      use a specific settings.local.json
`;

function runEnv(rest: string[]): number {
  const op = rest[0] as EnvOp | 'which' | undefined;
  const { values, positionals } = parseArgs({
    args: rest.slice(1),
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      provider: { type: 'string' },
      config: { type: 'string' },
      cmd: { type: 'string' },
    },
  });
  const common = { config: values.config, provider: values.provider };

  if (op === 'which') {
    const provider = resolve(common);
    process.stdout.write(`${JSON.stringify(provider, null, 2)}\n`);
    return 0;
  }

  if (op === undefined || !ENV_OPS.includes(op as EnvOp)) {
    process.stderr.write(USAGE);
    return 2;
  }

  const provider = resolve(common);
  const subject = positionals[0];
  if (subject === undefined) {
    throw new EnvironmentError(
      'env-missing-arg',
      `\`ev env ${op}\` needs a ${op === 'up' ? 'project' : 'handle'} argument`,
    );
  }

  // Handles are project-slug-keyed (ADR-0010), so `up <project>` and
  // `exec/status/down <handle>` share one positional; for up it doubles
  // as the handle so the rendered command can reuse it.
  const vars =
    op === 'exec'
      ? { handle: subject, cmd: values.cmd }
      : op === 'up'
        ? { project: subject, handle: subject }
        : { handle: subject };

  if (op === 'exec' && (values.cmd === undefined || values.cmd === '')) {
    throw new EnvironmentError(
      'env-missing-arg',
      '`ev env exec` needs --cmd="<command>"',
    );
  }

  const command = planCommand(op as EnvOp, provider, vars);

  if (values['dry-run']) {
    process.stdout.write(`[${provider.name}] would run: ${command}\n`);
    return 0;
  }

  const result = spawnSync('sh', ['-c', command], { stdio: 'inherit' });
  if (result.error) {
    throw new EnvironmentError(
      'env-exec-failed',
      `failed to spawn provider command: ${result.error.message}`,
    );
  }
  return result.status ?? 1;
}

function main(): number {
  const argv = process.argv.slice(2);
  const namespace = argv[0];
  if (namespace === undefined || namespace === '--help' || namespace === '-h') {
    process.stdout.write(`ev — loop-layer CLI\n\n${USAGE}`);
    return namespace === undefined ? 2 : 0;
  }
  if (namespace !== 'env') {
    process.stderr.write(
      `{"error":"unknown-namespace","detail":"ev has no namespace \\"${namespace}\\"; today only \\"env\\" is wired"}\n`,
    );
    return 2;
  }
  try {
    return runEnv(argv.slice(1));
  } catch (err) {
    fail(err);
  }
}

process.exit(main());
