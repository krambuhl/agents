// Loop-layer environment-provider seam (ADR-0010).
//
// Pure resolution + command templating: these functions decide WHICH
// provider is active on this machine and render the exact shell command
// for an op (`up` / `exec` / `status` / `down`). They never spawn — the
// CLI layer (cli/ev.ts) is what executes what these render. Keeping the
// seam pure is what makes it unit-testable without a real fella/coder
// install (ADR-0010 § "v1 runs the phase's commands in the environment").

export type EnvOp = 'up' | 'exec' | 'status' | 'down';

export const ENV_OPS: ReadonlyArray<EnvOp> = ['up', 'exec', 'status', 'down'];

// The four command templates every provider implements. Each is a shell
// command string with `{project}` / `{handle}` / `{cmd}` placeholders the
// renderer substitutes.
export interface ProviderTemplates {
  up: string;
  exec: string;
  status: string;
  down: string;
}

// The `ev.environment` block read from machine-local settings
// (.claude/settings.local.json). `provider` names the active backend on
// THIS machine; `providers` overrides/extends the shipped defaults.
export interface EnvironmentConfig {
  provider?: string;
  providers?: Record<string, Partial<ProviderTemplates>>;
}

export interface ResolvedProvider {
  name: string;
  templates: ProviderTemplates;
}

// Shipped defaults for the two v1 providers (ADR-0010). These are
// best-effort command shapes; an operator whose `fella`/`coder` differ
// overrides any field via the `providers` block in settings.local.json.
// `{project}` is the project slug; `{handle}` is the env handle (v1:
// the project slug — handles are project-slug-keyed); `{cmd}` is the
// command to run inside the env.
export const DEFAULT_PROVIDERS: Record<string, ProviderTemplates> = {
  // Home: OrbStack via the `fella` wrapper (krambuhl/local-dev).
  fella: {
    up: 'fella up {project}',
    exec: 'fella exec {handle} -- {cmd}',
    status: 'fella status {handle}',
    down: 'fella down {handle}',
  },
  // Work: Coder cloud workspaces.
  coder: {
    up: 'coder create --yes {project}',
    exec: 'coder ssh {handle} -- {cmd}',
    status: 'coder show {handle}',
    down: 'coder delete --yes {handle}',
  },
};

export interface EnvErrorPayload {
  error: string;
  detail: string;
}

// Structured error carrying a stable kebab-case `code`, mirroring the
// loom substrate's `<code>: <detail>` stderr convention. The driver's
// `--env` path keys off these codes to decide whether to surface-and-
// fall-back-to-local vs hard-stop (ADR-0010 § "Watch for").
export class EnvironmentError extends Error {
  code: string;
  detail: string;
  constructor(code: string, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'EnvironmentError';
    this.code = code;
    this.detail = detail;
  }

  toPayload(): EnvErrorPayload {
    return { error: this.code, detail: this.detail };
  }
}

// Pull the `ev.environment` block out of an already-parsed settings
// object. Returns null when the block is absent — the caller decides
// whether absence is an error (an explicit `--env` run) or a no-op (a
// plain run that never touched the seam).
export function loadEnvironmentConfig(settings: unknown): EnvironmentConfig | null {
  if (settings === null || typeof settings !== 'object') return null;
  const ev = (settings as Record<string, unknown>).ev;
  if (ev === null || typeof ev !== 'object') return null;
  const env = (ev as Record<string, unknown>).environment;
  if (env === null || typeof env !== 'object') return null;
  return env as EnvironmentConfig;
}

// Resolve the active provider on this machine: the configured name, with
// its templates merged over the shipped defaults (config wins field-by-
// field). Throws a structured EnvironmentError on every failure the
// driver must surface, never a silent wrong-place provision.
export function resolveProvider(
  config: EnvironmentConfig | null,
  overrideProvider?: string,
): ResolvedProvider {
  if (config === null) {
    throw new EnvironmentError(
      'env-config-missing',
      'no ev.environment block in settings.local.json; set ev.environment.provider for this machine',
    );
  }

  const name = (overrideProvider ?? config.provider ?? '').trim();
  if (name === '') {
    throw new EnvironmentError(
      'env-provider-unset',
      'ev.environment.provider is unset; name the active provider (e.g. "fella" at home, "coder" at work)',
    );
  }

  const defaults = DEFAULT_PROVIDERS[name];
  const override = config.providers?.[name];
  if (defaults === undefined && override === undefined) {
    const known = Object.keys(DEFAULT_PROVIDERS).join(', ');
    throw new EnvironmentError(
      'env-provider-unknown',
      `provider "${name}" has no shipped defaults and no providers.${name} block; known defaults: ${known}`,
    );
  }

  const merged: Partial<ProviderTemplates> = {
    ...(defaults ?? {}),
    ...(override ?? {}),
  };

  for (const op of ENV_OPS) {
    const tpl = merged[op];
    if (typeof tpl !== 'string' || tpl.trim() === '') {
      throw new EnvironmentError(
        'env-template-missing',
        `provider "${name}" is missing a non-empty "${op}" template`,
      );
    }
  }

  return { name, templates: merged as ProviderTemplates };
}

export interface RenderVars {
  project?: string;
  handle?: string;
  cmd?: string;
}

const PLACEHOLDER = /\{(project|handle|cmd)\}/g;
const ANY_PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/;

// Substitute `{project}` / `{handle}` / `{cmd}` in a template. Any
// placeholder left unsubstituted (a var the op didn't supply) is an
// error, not a silently-half-rendered command.
export function renderTemplate(template: string, vars: RenderVars): string {
  const rendered = template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    return value === undefined ? `{${key}}` : value;
  });
  const leftover = rendered.match(ANY_PLACEHOLDER);
  if (leftover !== null) {
    throw new EnvironmentError(
      'env-template-unrendered',
      `template "${template}" left "${leftover[0]}" unsubstituted (missing var for this op)`,
    );
  }
  return rendered;
}

// Render the full command for an op against a resolved provider. The
// returned string is a shell command line the CLI hands to `sh -c`.
export function planCommand(
  op: EnvOp,
  provider: ResolvedProvider,
  vars: RenderVars,
): string {
  return renderTemplate(provider.templates[op], vars);
}
