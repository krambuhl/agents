import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { parseArgs } from 'node:util';

import {
  compile,
  compileEmitOnly,
  compileThroughResolve,
} from './compile.ts';
import type { DispatchResult, GuildCliContext } from './index.ts';
import type { ComposedAgent } from './compile/types.ts';

// guild compile — CLI entry for the multi-stage pipeline.
//
// Modes:
//   guild compile
//     Full pipeline (parse → validate → derive → resolve → compose → emit).
//
//   guild compile --stage=parse,validate,derive,resolve
//     Runs the through-resolve subset. Emits `{schema_version, cells:
//     ResolvedCell[], cache_hits, cache_misses}` as JSON on stdout
//     so the /guild-compile skill can drive in-session LLM fusion
//     against the bundle.
//
//   guild compile --stage=emit
//     Consumes `{schema_version, agents: ComposedAgent[]}` JSON from
//     stdin, writes per-cell files + .cache.toml. The skill calls
//     this after performing fusion on the cache-miss cells.
//
// Flags:
//   --axes-toml=<path>    Default: plugins/guild/axes.toml (cwd-relative).
//   --output-dir=<path>   Default: plugins/guild/agents/generated (cwd-relative).
//   --cache-toml=<path>   Default: <output-dir>/.cache.toml.

const THROUGH_RESOLVE_STAGE = 'parse,validate,derive,resolve';
const EMIT_ONLY_STAGE = 'emit';

const DEFAULT_AXES_TOML = 'plugins/guild/axes.toml';
const DEFAULT_OUTPUT_DIR = 'plugins/guild/agents/generated';

const OPTIONS = {
  stage: { type: 'string' as const },
  'axes-toml': { type: 'string' as const },
  'output-dir': { type: 'string' as const },
  'cache-toml': { type: 'string' as const },
};

function errorResult(name: string, message: string, exitCode = 1): DispatchResult {
  return {
    stderr: JSON.stringify({ error: name, message }),
    exitCode,
  };
}

function readCacheFile(cachePath: string): string | undefined {
  if (!existsSync(cachePath)) return undefined;
  return readFileSync(cachePath, 'utf8');
}

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function makeFileWriter(): (relPath: string, content: string) => void {
  return (relPath: string, content: string) => {
    const abs = resolvePath(relPath);
    ensureDir(dirname(abs));
    writeFileSync(abs, content);
  };
}

function makeFragmentReader(pluginRoot: string): (relPath: string) => string {
  return (relPath: string) => readFileSync(join(pluginRoot, relPath), 'utf8');
}

interface EmitInput {
  schema_version: number;
  agents: ComposedAgent[];
}

function parseEmitStdin(stdin: string): EmitInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdin);
  } catch (err) {
    throw new Error(
      `--stage=emit: malformed JSON on stdin: ${(err as Error).message}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('--stage=emit: input must be a JSON object');
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.schema_version !== 1) {
    throw new Error(
      `--stage=emit: schema_version: expected 1, got ${String(obj.schema_version)}`,
    );
  }
  if (!Array.isArray(obj.agents)) {
    throw new Error('--stage=emit: agents: expected array');
  }
  // Trust the agents array shape — emit() will throw on its own if
  // the entries are malformed during write. Validating each field
  // here would duplicate that logic.
  return { schema_version: 1, agents: obj.agents as ComposedAgent[] };
}

export function compileVerb(
  rest: string[],
  ctx: GuildCliContext,
): DispatchResult {
  let values: { stage?: string; 'axes-toml'?: string; 'output-dir'?: string; 'cache-toml'?: string };
  try {
    ({ values } = parseArgs({
      args: rest,
      options: OPTIONS,
      allowPositionals: true,
      strict: false,
    }) as { values: typeof values });
  } catch (err) {
    return errorResult('bad-args', (err as Error).message);
  }

  const axesTomlPath = resolvePath(ctx.cwd, values['axes-toml'] ?? DEFAULT_AXES_TOML);
  const outputDir = values['output-dir'] ?? DEFAULT_OUTPUT_DIR;
  const cachePath = resolvePath(
    ctx.cwd,
    values['cache-toml'] ?? join(outputDir, '.cache.toml'),
  );
  const pluginRoot = dirname(axesTomlPath);
  const fragmentReader = makeFragmentReader(pluginRoot);
  const fileWriter = makeFileWriter();
  const stage = values.stage;

  try {
    if (stage === THROUGH_RESOLVE_STAGE) {
      const axesToml = readFileSync(axesTomlPath, 'utf8');
      const cacheToml = readCacheFile(cachePath);
      const result = compileThroughResolve({
        axesToml,
        fragmentReader,
        cacheToml,
      });
      return {
        stdout: JSON.stringify(
          {
            schema_version: 1,
            cells: result.resolved,
            cache_hits: result.cache_hits,
            cache_misses: result.cache_misses,
          },
          null,
          2,
        ),
        exitCode: 0,
      };
    }

    if (stage === EMIT_ONLY_STAGE) {
      const stdin = ctx.stdin ?? '';
      if (stdin.length === 0) {
        return errorResult(
          'missing-stdin',
          '--stage=emit requires a JSON ComposedAgent[] bundle on stdin',
        );
      }
      const input = parseEmitStdin(stdin);
      const result = compileEmitOnly({
        agents: input.agents,
        outputDir: resolvePath(ctx.cwd, outputDir),
        fileWriter,
      });
      return {
        stdout: JSON.stringify(result, null, 2),
        exitCode: 0,
      };
    }

    if (stage !== undefined) {
      return errorResult(
        'unknown-stage',
        `--stage="${stage}" not supported; use "${THROUGH_RESOLVE_STAGE}" or "${EMIT_ONLY_STAGE}" or omit for the full pipeline`,
      );
    }

    // Full pipeline default.
    const axesToml = readFileSync(axesTomlPath, 'utf8');
    const cacheToml = readCacheFile(cachePath);
    const report = compile({
      axesToml,
      outputDir: resolvePath(ctx.cwd, outputDir),
      cacheToml,
      fragmentReader,
      fileWriter,
    });
    return {
      stdout: JSON.stringify(report, null, 2),
      exitCode: 0,
    };
  } catch (err) {
    const e = err as Error;
    return errorResult(e.name || 'compile-failed', e.message);
  }
}
