import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { parseArgs } from 'node:util';

import {
  check,
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
//   guild compile --check
//     Read-only drift detection. Verifies every committed agent file
//     hashes to its cache `output_hash`, every source fragment hashes
//     to its cache entry's `source_hashes`, and (when --prompt-hash is
//     passed) every cache entry's `prompt_hash` matches. Emits a JSON
//     `{ok, drift}` report on stdout. Exit 0 on `ok=true`, exit 1
//     when any drift is detected. Performs no fusion, no LLM call,
//     no writes. Mutually exclusive with `--stage`.
//
// Flags:
//   --axes-toml=<path>    Default: plugins/guild/modes/axes.toml (cwd-relative).
//   --output-dir=<path>   Default: plugins/guild/agents (cwd-relative).
//   --cache-toml=<path>   Default: <output-dir>/.cache.toml.
//   --prompt-hash=<hex>   The SHA-256 of fusion-prompt.md. The U3
//                         /guild-compile skill computes and passes it for
//                         the fusion stages. For --check, an OMITTED flag
//                         is self-computed from the in-plugin
//                         fusion-prompt.md template (see below) so the
//                         check is honest standalone; an explicit value
//                         (including empty, to match pre-U3 legacy cache
//                         entries) always wins.
//   --check               Run drift detection instead of the pipeline.

const THROUGH_RESOLVE_STAGE = 'parse,validate,derive,resolve';
const EMIT_ONLY_STAGE = 'emit';

const DEFAULT_AXES_TOML = 'plugins/guild/modes/axes.toml';
const DEFAULT_OUTPUT_DIR = 'plugins/guild/agents';

const OPTIONS = {
  stage: { type: 'string' as const },
  'axes-toml': { type: 'string' as const },
  'output-dir': { type: 'string' as const },
  'cache-toml': { type: 'string' as const },
  'prompt-hash': { type: 'string' as const },
  check: { type: 'boolean' as const },
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

// The fusion-prompt template codegen fuses against, relative to the guild
// plugin root. The cache stamps each cell with sha256(this template) so a
// prompt-template edit invalidates the cache (see guild-compile SKILL.md).
const FUSION_PROMPT_RELPATH = join('skills', 'guild-compile', 'fusion-prompt.md');

// Self-compute the prompt-hash from the in-plugin fusion-prompt.md, matching
// what the /guild-compile skill computes (`shasum -a 256` over the same file).
// Used by --check when --prompt-hash is omitted, so a standalone check (CI,
// loom doctor) compares against the REAL prompt-hash instead of '' — which
// would false-flag every cell as prompt-drifted. Returns '' if the template
// is absent (a broken install where codegen can't run anyway), preserving the
// pre-U3 legacy-match behavior rather than inventing a phantom mismatch story.
function computeFusionPromptHash(pluginRoot: string): string {
  const templatePath = join(pluginRoot, FUSION_PROMPT_RELPATH);
  if (!existsSync(templatePath)) return '';
  return createHash('sha256')
    .update(readFileSync(templatePath, 'utf8'), 'utf8')
    .digest('hex');
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
  prompt_hash: string;
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
  // prompt_hash is optional on stdin: absent or non-string → empty
  // string. The U3 skill always sends a value; pre-U3 callers
  // (manual /tests) can omit the field.
  const rawPromptHash = obj.prompt_hash;
  const prompt_hash = typeof rawPromptHash === 'string' ? rawPromptHash : '';
  // Trust the agents array shape — emit() will throw on its own if
  // the entries are malformed during write. Validating each field
  // here would duplicate that logic.
  return {
    schema_version: 1,
    agents: obj.agents as ComposedAgent[],
    prompt_hash,
  };
}

export function compileVerb(
  rest: string[],
  ctx: GuildCliContext,
): DispatchResult {
  let values: {
    stage?: string;
    'axes-toml'?: string;
    'output-dir'?: string;
    'cache-toml'?: string;
    'prompt-hash'?: string;
    check?: boolean;
  };
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
  // axes.toml lives at <pluginRoot>/modes/axes.toml, but the fragment
  // relPaths from resolve are <pluginRoot>-relative (modes/domains/*,
  // modes/phases/*, modes/personalities/*). Climb out of modes/ so the
  // fragment reader joins them against the real plugin root, not modes/.
  const pluginRoot = dirname(dirname(axesTomlPath));
  const fragmentReader = makeFragmentReader(pluginRoot);
  const fileWriter = makeFileWriter();
  const stage = values.stage;
  const promptHash = values['prompt-hash'] ?? '';
  const checkMode = values.check === true;

  if (checkMode && stage !== undefined) {
    return errorResult(
      'bad-args',
      '--check is mutually exclusive with --stage',
    );
  }

  try {
    if (checkMode) {
      const axesToml = readFileSync(axesTomlPath, 'utf8');
      const cacheToml = readCacheFile(cachePath);
      const resolvedOutputDir = resolvePath(ctx.cwd, outputDir);
      const agentBodyReader = (cellId: string): string | undefined => {
        const filePath = join(resolvedOutputDir, `${cellId}.md`);
        if (!existsSync(filePath)) return undefined;
        return readFileSync(filePath, 'utf8');
      };
      // An explicit --prompt-hash wins (the skill passes it; an empty value
      // intentionally matches legacy entries). When omitted, self-compute
      // from fusion-prompt.md so a standalone --check is honest instead of
      // false-flagging every cell against ''.
      const checkPromptHash =
        values['prompt-hash'] !== undefined
          ? promptHash
          : computeFusionPromptHash(pluginRoot);
      const result = check({
        axesToml,
        cacheToml,
        fragmentReader,
        agentBodyReader,
        promptHash: checkPromptHash,
      });
      return {
        stdout: JSON.stringify(result, null, 2),
        exitCode: result.ok ? 0 : 1,
      };
    }

    if (stage === THROUGH_RESOLVE_STAGE) {
      const axesToml = readFileSync(axesTomlPath, 'utf8');
      const cacheToml = readCacheFile(cachePath);
      const result = compileThroughResolve({
        axesToml,
        fragmentReader,
        cacheToml,
        promptHash,
      });
      return {
        stdout: JSON.stringify(
          {
            schema_version: 1,
            prompt_hash: promptHash,
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
      // The flag wins when both are supplied — caller's explicit
      // intent overrides the stdin echo. When the flag is empty
      // (default), the stdin value is used; when stdin omits it,
      // both default to empty.
      const effectivePromptHash =
        values['prompt-hash'] !== undefined ? promptHash : input.prompt_hash;
      const result = compileEmitOnly({
        agents: input.agents,
        outputDir: resolvePath(ctx.cwd, outputDir),
        fileWriter,
        promptHash: effectivePromptHash,
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
      promptHash,
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
