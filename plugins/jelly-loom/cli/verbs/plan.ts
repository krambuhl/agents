import { parseArgs } from 'node:util';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { JellyError } from '../lib/errors.ts';
import { createSlug, SLUG_RE } from '../lib/project.ts';
import { type GitRunner, defaultGitRunner } from '../lib/git.ts';
import {
  stringifyManifest,
  type JellyManifest,
  type JellyPhase,
} from '../lib/manifest.ts';
import type { CliContext, DispatchResult } from '../lib/types.ts';

// `jelly plan <slug-or-topic> --plan-file --interview-file --manifest-file
//  --template-file [--no-commit]` scaffolds a jelly project: files PLAN.md +
// INTERVIEW.md, writes manifest.toml (from a JSON --manifest-file via U2's
// lib), instantiates the jelly-guild CLAUDE.md template into
// projects/<slug>/CLAUDE.md, idempotently registers the project's @-line in
// the repo-root CLAUDE.md, and commits. Unlike loom's plan it writes NO
// events.jsonl and NO config.json — jelly's config lives in manifest.toml's
// [config] table and jelly keeps no event log.

function emit(value: unknown, pretty: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function errToResult(err: unknown): DispatchResult {
  if (err instanceof JellyError) {
    return { stderr: JSON.stringify(err.toPayload()), exitCode: 1 };
  }
  throw err;
}

function todayString(ctx: CliContext): string {
  return ctx.today ?? new Date().toISOString().slice(0, 10);
}

function gitRunnerOf(ctx: CliContext): GitRunner {
  return ctx.gitRunner ?? defaultGitRunner;
}

function repoRootOf(ctx: CliContext): string {
  return ctx.repoRoot ?? process.cwd();
}

// ---------- Manifest-input → JellyManifest ----------

// Markers delimiting the jelly-managed import block in the repo-root
// CLAUDE.md. The block holds one @-line per active jelly project.
const ROOT_BLOCK_START = '<!-- jelly:projects -->';
const ROOT_BLOCK_END = '<!-- /jelly:projects -->';

function asString(v: unknown, where: string): string {
  if (typeof v !== 'string') {
    throw new JellyError('manifest-input-invalid', `${where} must be a string`);
  }
  return v;
}

function buildManifestFromInput(
  raw: string,
  slug: string,
  started: string,
): { manifest: JellyManifest; context: string | undefined; conventions: string | undefined } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new JellyError(
      'manifest-input-invalid',
      `--manifest-file is not valid JSON: ${(err as Error).message}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new JellyError('manifest-input-invalid', 'manifest input must be a JSON object');
  }
  const input = parsed as Record<string, unknown>;

  const title = asString(input.title, 'manifest input "title"');
  const status = asString(input.status, 'manifest input "status"');

  if (typeof input.config !== 'object' || input.config === null || Array.isArray(input.config)) {
    throw new JellyError('manifest-input-invalid', 'manifest input "config" must be an object');
  }
  const cfg = input.config as Record<string, unknown>;
  const config = {
    base_branch: asString(cfg.base_branch, 'manifest input "config.base_branch"'),
    substrate: asString(cfg.substrate, 'manifest input "config.substrate"'),
  };

  if (!Array.isArray(input.phases)) {
    throw new JellyError('manifest-input-invalid', 'manifest input "phases" must be an array');
  }
  const phases: JellyPhase[] = input.phases.map((p, i) => {
    if (typeof p !== 'object' || p === null || Array.isArray(p)) {
      throw new JellyError('manifest-input-invalid', `manifest input phases[${i}] must be an object`);
    }
    const phase = p as Record<string, unknown>;
    if (!Array.isArray(phase.depends_on) || phase.depends_on.some((d) => typeof d !== 'string')) {
      throw new JellyError(
        'manifest-input-invalid',
        `manifest input phases[${i}].depends_on must be an array of strings`,
      );
    }
    return {
      number: asString(phase.number, `manifest input phases[${i}].number`),
      milestone: asString(phase.milestone, `manifest input phases[${i}].milestone`),
      name: asString(phase.name, `manifest input phases[${i}].name`),
      depends_on: phase.depends_on as string[],
    };
  });

  const context = input.context === undefined ? undefined : asString(input.context, 'manifest input "context"');
  const conventions =
    input.conventions === undefined ? undefined : asString(input.conventions, 'manifest input "conventions"');

  const manifest: JellyManifest = {
    schema_version: 1,
    title,
    slug,
    started,
    status,
    plan_file: 'PLAN.md',
    research_file: 'RESEARCH.md',
    adr_log: '../adr-log',
    config,
    phases,
  };
  return { manifest, context, conventions };
}

// ---------- Template instantiation ----------

export function instantiateTemplate(
  templateRaw: string,
  fills: Record<string, string>,
): string {
  let out = templateRaw;
  for (const [key, value] of Object.entries(fills)) {
    out = out.split(`{{${key}}}`).join(value);
  }
  // Any remaining {{...}} means the template carries a placeholder this
  // verb doesn't know how to fill — a template/placeholder drift. Fail
  // loud rather than ship a CLAUDE.md with literal {{...}} in it.
  const leftover = out.match(/\{\{[A-Z_]+\}\}/);
  if (leftover !== null) {
    throw new JellyError(
      'template-placeholder-unfilled',
      `template has an unfilled placeholder ${leftover[0]} that jelly plan does not know how to fill`,
    );
  }
  return out;
}

// ---------- Repo-root @-line management ----------

// Ensures `@projects/<slug>/CLAUDE.md` is present in the jelly-managed
// block of the repo-root CLAUDE.md. Idempotent: adds the line if absent,
// no-ops if already present. Accumulates — never removes another
// project's line (swap/remove is a deferred session-switch concern).
// Returns true if the file content changed.
export function ensureRootClaudeMdImport(rootClaudeMdPath: string, slug: string): boolean {
  const importLine = `@projects/${slug}/CLAUDE.md`;
  const existing = existsSync(rootClaudeMdPath)
    ? readFileSync(rootClaudeMdPath, 'utf8')
    : null;

  if (existing === null) {
    // Create the file with a managed block.
    const content = `${ROOT_BLOCK_START}\n${importLine}\n${ROOT_BLOCK_END}\n`;
    writeFileSync(rootClaudeMdPath, content);
    return true;
  }

  const startIdx = existing.indexOf(ROOT_BLOCK_START);
  const endIdx = existing.indexOf(ROOT_BLOCK_END);

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    // No managed block (or malformed) — append a fresh one. A
    // malformed half-block is left in place untouched; we add a clean
    // block rather than try to repair, surfacing the oddity to a human
    // reader rather than silently rewriting their file.
    const sep = existing.endsWith('\n') ? '\n' : '\n\n';
    const block = `${ROOT_BLOCK_START}\n${importLine}\n${ROOT_BLOCK_END}\n`;
    writeFileSync(rootClaudeMdPath, existing + sep + block);
    return true;
  }

  // Block exists — check whether the line is already in it.
  const blockBody = existing.slice(startIdx + ROOT_BLOCK_START.length, endIdx);
  const lines = blockBody
    .split('\n')
    .map((l: string) => l.trim())
    .filter((l: string) => l.length > 0);
  if (lines.includes(importLine)) {
    return false; // idempotent no-op
  }

  // Insert the line just before the end marker.
  const before = existing.slice(0, endIdx);
  const after = existing.slice(endIdx);
  const needsNewline = before.endsWith('\n') ? '' : '\n';
  writeFileSync(rootClaudeMdPath, `${before}${needsNewline}${importLine}\n${after}`);
  return true;
}

// ---------- The verb ----------

const PLAN_OPTIONS = {
  'plan-file': { type: 'string' as const },
  'interview-file': { type: 'string' as const },
  'manifest-file': { type: 'string' as const },
  'template-file': { type: 'string' as const },
  'no-commit': { type: 'boolean' as const },
  pretty: { type: 'boolean' as const },
};

export function planVerb(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: PLAN_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slugOrTopic = positionals[0];
  const planFile = values['plan-file'];
  const interviewFile = values['interview-file'];
  const manifestFile = values['manifest-file'];
  const templateFile = values['template-file'];
  const noCommit = values['no-commit'] === true;
  const pretty = values.pretty === true;

  const missing: string[] = [];
  if (slugOrTopic === undefined) missing.push('<slug-or-topic>');
  if (planFile === undefined) missing.push('--plan-file');
  if (interviewFile === undefined) missing.push('--interview-file');
  if (manifestFile === undefined) missing.push('--manifest-file');
  if (templateFile === undefined) missing.push('--template-file');
  if (missing.length > 0) {
    return errToResult(
      new JellyError('missing-args', `plan requires: ${missing.join(', ')}`),
    );
  }

  for (const [flag, path] of [
    ['--plan-file', planFile],
    ['--interview-file', interviewFile],
    ['--manifest-file', manifestFile],
    ['--template-file', templateFile],
  ] as const) {
    if (!existsSync(path as string)) {
      return errToResult(
        new JellyError('input-file-not-found', `${flag} does not exist at ${path}`),
      );
    }
  }

  const topicWasSlug = SLUG_RE.test(slugOrTopic as string);
  let slug: string;
  try {
    slug = topicWasSlug ? (slugOrTopic as string) : createSlug(slugOrTopic as string, todayString(ctx));
  } catch (err) {
    return errToResult(err);
  }

  const targetDir = join(ctx.projectsRoot, slug);
  const planMdPath = join(targetDir, 'PLAN.md');
  const interviewMdPath = join(targetDir, 'INTERVIEW.md');
  const manifestTomlPath = join(targetDir, 'manifest.toml');
  const projectClaudeMdPath = join(targetDir, 'CLAUDE.md');
  const rootClaudeMdPath = join(repoRootOf(ctx), 'CLAUDE.md');

  // Collision check on PLAN.md: committed → refuse; uncommitted → overwrite.
  if (existsSync(planMdPath)) {
    if (gitRunnerOf(ctx).isCommitted(repoRootOf(ctx), planMdPath)) {
      return errToResult(
        new JellyError(
          'plan-exists-committed',
          `PLAN.md at ${planMdPath} is already committed — use 'jelly revise --target=plan' to update it`,
        ),
      );
    }
  }

  // Build + validate the manifest and instantiate the template BEFORE
  // writing anything, so an invalid input fails without leaving a
  // half-created project dir.
  let manifestToml: string;
  let projectClaudeMd: string;
  try {
    const { manifest, context, conventions } = buildManifestFromInput(
      readFileSync(manifestFile as string, 'utf8'),
      slug,
      todayString(ctx),
    );
    manifestToml = stringifyManifest(manifest);
    projectClaudeMd = instantiateTemplate(readFileSync(templateFile as string, 'utf8'), {
      PROJECT_TITLE: manifest.title,
      PROJECT_SLUG: slug,
      PROJECT_CONTEXT: context ?? '<!-- TODO: fill in project context -->',
      PROJECT_CONVENTIONS: conventions ?? '<!-- TODO: fill in project conventions -->',
    });
  } catch (err) {
    return errToResult(err);
  }

  try {
    mkdirSync(targetDir, { recursive: true });
    copyFileSync(planFile as string, planMdPath);
    copyFileSync(interviewFile as string, interviewMdPath);
    writeFileSync(manifestTomlPath, manifestToml);
    writeFileSync(projectClaudeMdPath, projectClaudeMd);
  } catch (err: unknown) {
    return errToResult(
      new JellyError('plan-write-failed', `writing project files failed: ${(err as Error).message}`),
    );
  }

  let rootUpdated: boolean;
  try {
    rootUpdated = ensureRootClaudeMdImport(rootClaudeMdPath, slug);
  } catch (err: unknown) {
    return errToResult(
      new JellyError(
        'root-claude-md-write-failed',
        `updating the repo-root CLAUDE.md import failed: ${(err as Error).message}`,
      ),
    );
  }

  if (!noCommit) {
    const filesToCommit = [planMdPath, interviewMdPath, manifestTomlPath, projectClaudeMdPath];
    if (rootUpdated) filesToCommit.push(rootClaudeMdPath);
    try {
      gitRunnerOf(ctx).addAndCommit(repoRootOf(ctx), filesToCommit, `[jelly plan] ${slug}`);
    } catch (err) {
      return errToResult(err);
    }
  }

  return {
    stdout: emit(
      {
        slug,
        path: targetDir,
        manifest_path: 'manifest.toml',
        project_claude_md: 'CLAUDE.md',
        root_claude_md_updated: rootUpdated,
        committed: !noCommit,
      },
      pretty,
    ),
    exitCode: 0,
  };
}

export const PLAN_VERBS = {
  plan: planVerb,
};
