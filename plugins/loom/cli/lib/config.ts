import { readFileSync } from 'node:fs';
import type { Config } from './types.ts';
import { LoomError } from './errors.ts';

// readConfig stays after the manifest.toml cutover: scaffold / adopt read an
// EXTERNAL --config-file (operator-supplied JSON) through it, then fold it
// into the manifest's [config] section. The internal config.json store is
// gone, so the matching writeConfig was removed.

export function readConfig(path: string): Config {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'ENOENT') {
      throw new LoomError('config-not-found', `config not found at ${path}`);
    }
    throw new LoomError(
      'config-unreadable',
      `config unreadable at ${path}: ${(err as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err: unknown) {
    throw new LoomError(
      'config-invalid-json',
      `config at ${path} is not valid JSON: ${(err as Error).message}`,
    );
  }

  return parsed as Config;
}
