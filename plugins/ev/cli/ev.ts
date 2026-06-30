#!/usr/bin/env node
// ev — loop-layer CLI. Today it ships one namespace: `env`, the
// environment-provider seam (ADR-0010). The loop drivers (/ev-run,
// /ev-goal) shell out to `ev env …` under their `--env` flag to
// provision and run work in a fella (home/OrbStack) or coder (work/
// cloud) environment, selected by machine-local config.

import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import {
  ENV_OPS,
  EnvironmentError,
  deriveHandle,
  loadEnvironmentConfig,
  planCommand,
  resolveProvider,
  resolveSettings,
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

function resolve(opts: { config?: string; provider?: string }): ResolvedProvider {
  const settings = resolveSettings(opts.config);
  const config = loadEnvironmentConfig(settings);
  return resolveProvider(config, opts.provider);
}

const USAGE = `ev env <which|up|exec|status|down> [args]

  ev env which                          show the resolved provider + mode + templates
  ev env up <project>                   provision-or-reuse an environment
  ev env exec <handle> --cmd="<cmd>"    run a command inside the environment (exec mode)
  ev env dispatch <handle> --phase=<N>  run a phase inside the environment (dispatch mode)
  ev env status <handle>                report readiness
  ev env down <handle>                  tear the environment down

Flags:
  --dry-run            print the command instead of running it
  --provider=<name>    override the configured provider
  --config=<path>      use a specific settings.local.json
`;

const RUN_OPS: ReadonlyArray<string> = [...ENV_OPS, 'dispatch'];

function runEnv(rest: string[]): number {
  const op = rest[0] as EnvOp | 'dispatch' | 'which' | undefined;
  const { values, positionals } = parseArgs({
    args: rest.slice(1),
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean', default: false },
      provider: { type: 'string' },
      config: { type: 'string' },
      cmd: { type: 'string' },
      phase: { type: 'string' },
      task: { type: 'string' },
    },
  });
  const common = { config: values.config, provider: values.provider };

  if (op === 'which') {
    const provider = resolve(common);
    process.stdout.write(`${JSON.stringify(provider, null, 2)}\n`);
    return 0;
  }

  if (op === undefined || !RUN_OPS.includes(op)) {
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

  if (op === 'dispatch' && (values.phase === undefined || values.phase === '')) {
    throw new EnvironmentError(
      'env-missing-arg',
      '`ev env dispatch` needs --phase=<N>',
    );
  }

  // Dispatch is inherently headless, so ev composes the canonical inner
  // invocation with `--mode=auto` baked in (ADR-0011 §5) and exposes it as
  // `{run}`. The operator's template can't drop the flag because it never
  // writes it. `{slug}` is the canonical (dated) loom slug for project
  // resolution; `{handle}` is the env handle.
  const run =
    op === 'dispatch'
      ? `/ev-run ${subject} ${values.phase} --mode=auto`
      : undefined;

  // `{handle}` is the env/workspace NAME — a backend-safe projection of the
  // slug when the provider sets handleMaxLen (e.g. coder's 32-char limit);
  // else the slug itself (ADR-0010). `{project}`/`{slug}` stay the canonical
  // slug so the in-box `/ev-run` (via `{run}`) resolves the real project.
  const handle =
    provider.handleMaxLen !== undefined
      ? deriveHandle(subject, provider.handleMaxLen)
      : subject;
  const vars =
    op === 'exec'
      ? { handle, cmd: values.cmd }
      : op === 'dispatch'
        ? { handle, slug: subject, phase: values.phase, task: values.task, run }
        : op === 'up'
          ? { project: subject, slug: subject, handle }
          : { handle };

  if (op === 'exec' && (values.cmd === undefined || values.cmd === '')) {
    throw new EnvironmentError(
      'env-missing-arg',
      '`ev env exec` needs --cmd="<command>"',
    );
  }

  const command = planCommand(op, provider, vars);

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
