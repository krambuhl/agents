// Loop-layer environment-provider seam (ADR-0010).
//
// Resolution + command templating: these functions decide WHICH provider is
// active on this machine and render the exact shell command for an op
// (`up` / `exec` / `status` / `down`). They never spawn — the CLI layer
// (cli/ev.ts) is what executes what these render. Config discovery
// (settings.json + settings.local.json) also lives here so it is unit-testable
// (cli/ev.ts process.exit()s on import and can't be tested directly).

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

export type EnvOp = 'up' | 'exec' | 'status' | 'down';

export const ENV_OPS: ReadonlyArray<EnvOp> = ['up', 'exec', 'status', 'down'];

// How the loop uses a provider's environment (ADR-0011):
// - `exec`     — the env shares THIS working tree (a bind-mount, e.g.
//                fella/OrbStack), so the loop edits here and routes its
//                repo commands into the env via `exec`.
// - `dispatch` — the env has its OWN clone (a coder cloud workspace), so
//                the loop hands the whole phase to a Claude running
//                INSIDE the env via `dispatch`, and does no exec-routing.
export type EnvMode = 'exec' | 'dispatch';

// The four command templates every provider implements. Each is a shell
// command string with `{project}` / `{handle}` / `{cmd}` / `{phase}` /
// `{task}` placeholders the renderer substitutes.
export interface ProviderTemplates {
  up: string;
  exec: string;
  status: string;
  down: string;
}

// A provider's config/defaults: the four core templates plus the optional
// `mode` (default `exec`) and the `dispatch` template (required when
// `mode` is `dispatch`).
export interface ProviderConfig extends Partial<ProviderTemplates> {
  mode?: EnvMode;
  dispatch?: string;
}

// The `ev.environment` block read from machine-local settings
// (.claude/settings.local.json). `provider` names the active backend on
// THIS machine; `providers` overrides/extends the shipped defaults.
export interface EnvironmentConfig {
  provider?: string;
  providers?: Record<string, ProviderConfig>;
}

export interface ResolvedProvider {
  name: string;
  mode: EnvMode;
  templates: ProviderTemplates;
  dispatch?: string;
}

// Shipped defaults for the v1 providers (ADR-0010/0011). These are
// best-effort command shapes; an operator whose `fella`/`coder` differ
// overrides any field via the `providers` block in settings.local.json.
// `{project}`/`{handle}` are the project slug (handles are slug-keyed);
// `{cmd}` is a command to run inside the env (exec mode); `{phase}` is
// the phase number handed to the in-env runner (dispatch mode).
export const DEFAULT_PROVIDERS: Record<string, ProviderConfig> = {
  // Home: OrbStack via the `fella` wrapper (krambuhl/local-dev). Shared
  // tree → exec mode.
  fella: {
    mode: 'exec',
    up: 'fella up {project}',
    exec: 'fella exec {handle} -- {cmd}',
    status: 'fella status {handle}',
    down: 'fella down {handle}',
  },
  // Work: Coder cloud workspaces. Separate clone → dispatch mode. The
  // `dispatch` template runs the phase INSIDE the workspace via a headless
  // Claude. The `{run}` placeholder is ev's canonical inner-loop
  // invocation — `/ev-run <slug> <phase> --mode=auto` — so the operator
  // can't forget headless `--mode=auto` (ADR-0011 §5). The rest is
  // workspace-specific (ssh target, repo path, runner, env hygiene), so
  // most operators override it. `unset ANTHROPIC_API_KEY` keeps billing on
  // the subscription OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`); the workspace
  // (coder template) must provide an authed `claude` + the krambuhl
  // plugins + the repo (see ADR-0011).
  coder: {
    mode: 'dispatch',
    // `--yes` only auto-confirms the final build; it does NOT fill a
    // template's defaulted-but-prompting rich params (validation: `coder
    // create --yes` fast-fails `prepare build: EOF` on such a template).
    // `--use-parameter-defaults` is the flag that makes it non-interactive.
    up: 'coder create --yes --use-parameter-defaults {project}',
    exec: 'coder ssh {handle} -- {cmd}',
    status: 'coder show {handle}',
    down: 'coder delete --yes {handle}',
    dispatch:
      'coder ssh {handle} -- bash -lc "unset ANTHROPIC_API_KEY; cd ~/agents && claude -p \'{run}\'"',
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

// ---------- settings discovery (settings.json + settings.local.json) ----------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

// Deep-merge two config trees, `over` winning. Objects merge key-by-key;
// arrays and scalars are replaced wholesale. This is what lets a committed
// `settings.json` carry the shared `ev.environment.providers` while a
// per-machine `settings.local.json` overrides individual fields (decision
// 0009).
export function deepMerge(base: unknown, over: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(over)) return over;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    out[k] = k in out ? deepMerge(out[k], v) : v;
  }
  return out;
}

function readJsonIfExists(path: string): unknown {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new EnvironmentError(
      'env-settings-unreadable',
      `could not read/parse ${path}: ${(err as Error).message}`,
    );
  }
}

// Merge a single `.claude/` dir's committed `settings.json` (shared) UNDER its
// `settings.local.json` (machine-local override). Returns null when neither
// exists. Exported for unit tests.
export function loadMergedSettings(claudeDir: string): unknown {
  const shared = readJsonIfExists(join(claudeDir, 'settings.json'));
  const local = readJsonIfExists(join(claudeDir, 'settings.local.json'));
  if (shared === undefined && local === undefined) return null;
  return deepMerge(shared ?? {}, local ?? {});
}

// Nearest `.claude/` dir (walking up from cwd) carrying a settings file; else
// ~/.claude.
function findClaudeDir(): string | null {
  let dir = process.cwd();
  for (;;) {
    const cd = join(dir, '.claude');
    if (existsSync(join(cd, 'settings.json')) || existsSync(join(cd, 'settings.local.json'))) {
      return cd;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const home = join(homedir(), '.claude');
  if (existsSync(join(home, 'settings.json')) || existsSync(join(home, 'settings.local.json'))) {
    return home;
  }
  return null;
}

// Resolve settings: an explicit path reads exactly that file; otherwise the
// nearest `.claude/` dir's settings.json + settings.local.json, merged.
// Validation found ev only ever read settings.local.json, leaving a committed
// settings.json dead (decision 0009 was aspirational); this implements it.
export function resolveSettings(explicit?: string): unknown {
  if (explicit !== undefined && explicit !== '') {
    return existsSync(explicit) ? (readJsonIfExists(explicit) ?? null) : null;
  }
  const dir = findClaudeDir();
  return dir === null ? null : loadMergedSettings(dir);
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

  const merged: ProviderConfig = {
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

  const mode: EnvMode = merged.mode === 'dispatch' ? 'dispatch' : 'exec';
  if (mode === 'dispatch') {
    if (typeof merged.dispatch !== 'string' || merged.dispatch.trim() === '') {
      throw new EnvironmentError(
        'env-dispatch-template-missing',
        `provider "${name}" is mode=dispatch but has no non-empty "dispatch" template`,
      );
    }
  }

  return {
    name,
    mode,
    templates: {
      up: merged.up as string,
      exec: merged.exec as string,
      status: merged.status as string,
      down: merged.down as string,
    },
    dispatch: merged.dispatch,
  };
}

export interface RenderVars {
  project?: string;
  handle?: string;
  cmd?: string;
  phase?: string;
  task?: string;
  slug?: string;
  run?: string;
}

const PLACEHOLDER = /\{(project|handle|cmd|phase|task|slug|run)\}/g;
const ANY_PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/;

// `{run}` is the canonical inner-loop invocation ev composes for dispatch
// (e.g. `/ev-run <slug> <phase> --mode=auto`). Unlike every other var it
// is inserted RAW, not shell-quoted: the operator's dispatch template
// places it inside their own quoting (`claude -p '{run}'`), so quoting it
// here would double-wrap. Its contents are ev-composed from a loom slug +
// phase number (no shell metacharacters), so raw insertion is safe.
const RAW_VARS: ReadonlySet<string> = new Set(['run']);

// Tokens safe to leave bare in a shell command line. Anything outside
// this set (spaces, quotes, $, &, |, globs, …) gets single-quoted.
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

// POSIX shell-quote a single value, shlex.quote-style: bare when safe
// (keeps dry-run output and simple slugs readable), else wrapped in
// single quotes with embedded `'` escaped as `'\''`. This is what makes
// `--cmd="node -e 'x'"` survive the local `sh -c` parse instead of
// mis-splitting (the 2-minute-hang bug from the prototype).
export function shellQuote(value: string): string {
  if (value === '') return "''";
  if (SHELL_SAFE.test(value)) return value;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

// Substitute `{project}` / `{handle}` / `{cmd}` in a template, shell-
// quoting each substituted value so a slug or command with spaces/quotes
// can't break the rendered command line. Any placeholder left
// unsubstituted (a var the op didn't supply) is an error, not a
// silently-half-rendered command.
export function renderTemplate(template: string, vars: RenderVars): string {
  const rendered = template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = (vars as Record<string, string | undefined>)[key];
    if (value === undefined) return `{${key}}`;
    return RAW_VARS.has(key) ? value : shellQuote(value);
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
// `dispatch` resolves the provider's dispatch template (dispatch-mode
// providers only); the four core ops resolve from `templates`.
export function planCommand(
  op: EnvOp | 'dispatch',
  provider: ResolvedProvider,
  vars: RenderVars,
): string {
  if (op === 'dispatch') {
    if (provider.dispatch === undefined || provider.dispatch.trim() === '') {
      throw new EnvironmentError(
        'env-dispatch-unsupported',
        `provider "${provider.name}" has no dispatch template (mode=${provider.mode})`,
      );
    }
    return renderTemplate(provider.dispatch, vars);
  }
  return renderTemplate(provider.templates[op], vars);
}
