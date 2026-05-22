import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { LinearLoomError } from './errors.ts';

// Auth resolution for the linear-loom CLI. Reads a Linear personal
// API key from two sources, in order (DESIGN.md § 9):
//
//   1. LINEAR_API_KEY environment variable (preferred — never lands on disk)
//   2. ~/.linear-loom/config.json with shape { "api_key": "..." }
//
// The config file holds AUTH ONLY — no default Linear Project ID, no
// default loom-project name. Per-slug resolution lives in the marker
// file (DESIGN.md § 4); this module is auth-only.

const CONFIG_RELATIVE_PATH = ['.linear-loom', 'config.json'] as const;

export type AuthSource = 'env' | 'config-file';

export interface AuthResolution {
  apiKey: string;
  source: AuthSource;
}

export interface ResolveAuthOptions {
  env?: NodeJS.ProcessEnv;
  fileReader?: (path: string) => string;
  homeDirResolver?: () => string;
}

export function resolveAuth(options: ResolveAuthOptions = {}): AuthResolution {
  const env = options.env ?? process.env;
  const fileReader = options.fileReader ?? defaultFileReader;
  const homeDirResolver = options.homeDirResolver ?? homedir;

  const fromEnv = env.LINEAR_API_KEY;
  if (typeof fromEnv === 'string' && fromEnv.trim() !== '') {
    return { apiKey: fromEnv.trim(), source: 'env' };
  }

  const configPath = join(homeDirResolver(), ...CONFIG_RELATIVE_PATH);
  let raw: string;
  try {
    raw = fileReader(configPath);
  } catch {
    throw new LinearLoomError(
      'missing-auth',
      `LINEAR_API_KEY is not set and ${configPath} is unreadable. Generate a personal API key in Linear settings, then either export LINEAR_API_KEY or write {"api_key": "..."} to ${configPath}.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new LinearLoomError(
      'config-unparseable',
      `${configPath} is not valid JSON: ${(err as Error).message}`,
    );
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new LinearLoomError(
      'config-malformed',
      `${configPath} must be a JSON object with an "api_key" string field.`,
    );
  }

  const apiKey = (parsed as { api_key?: unknown }).api_key;
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new LinearLoomError(
      'config-malformed',
      `${configPath} has no "api_key" string field (or it is empty).`,
    );
  }

  return { apiKey: apiKey.trim(), source: 'config-file' };
}

function defaultFileReader(path: string): string {
  return readFileSync(path, 'utf8');
}
