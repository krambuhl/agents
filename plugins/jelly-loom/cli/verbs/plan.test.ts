import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planVerb, instantiateTemplate, ensureRootClaudeMdImport } from './plan.ts';
import { parseManifest } from '../lib/manifest.ts';
import type { GitRunner } from '../lib/git.ts';
import type { CliContext } from '../lib/types.ts';

function fakeGit(committed = false): GitRunner & {
  commits: { paths: string[]; message: string }[];
} {
  const commits: { paths: string[]; message: string }[] = [];
  return {
    commits,
    isCommitted: () => committed,
    addAndCommit: (_r, paths, message) => commits.push({ paths, message }),
  };
}

const TEMPLATE = [
  '<!-- @projects/{{PROJECT_SLUG}}/CLAUDE.md -->',
  '# {{PROJECT_TITLE}}',
  '**Slug**: `{{PROJECT_SLUG}}`',
  '',
  '{{PROJECT_CONTEXT}}',
  '',
  '## Conventions',
  '{{PROJECT_CONVENTIONS}}',
  '',
].join('\n');

const MANIFEST_INPUT = JSON.stringify({
  title: 'Demo Project',
  status: 'active',
  config: { base_branch: 'main', substrate: 'jelly' },
  phases: [
    { number: '1.1', milestone: 'M1', name: 'First phase', depends_on: [] },
    { number: '1.2', milestone: 'M1', name: 'Second phase', depends_on: ['1.1'] },
  ],
});

let scratch: string;
let projectsRoot: string;
let repoRoot: string;
let planFile: string;
let interviewFile: string;
let manifestFile: string;
let templateFile: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'jelly-plan-'));
  repoRoot = join(scratch, 'repo');
  projectsRoot = join(repoRoot, 'projects');
  mkdirSync(projectsRoot, { recursive: true });
  planFile = join(scratch, 'plan.md');
  interviewFile = join(scratch, 'interview.md');
  manifestFile = join(scratch, 'manifest.json');
  templateFile = join(scratch, 'template.md');
  writeFileSync(planFile, '# Plan\n\nthe plan\n');
  writeFileSync(interviewFile, '# Interview\n\nQ&A\n');
  writeFileSync(manifestFile, MANIFEST_INPUT);
  writeFileSync(templateFile, TEMPLATE);
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

function ctx(git: GitRunner): CliContext {
  return { projectsRoot, repoRoot, today: '2026-05-25', gitRunner: git };
}

function fullArgs(slug: string): string[] {
  return [
    slug,
    `--plan-file=${planFile}`,
    `--interview-file=${interviewFile}`,
    `--manifest-file=${manifestFile}`,
    `--template-file=${templateFile}`,
  ];
}

describe('planVerb: happy path (all 5 concerns)', () => {
  test('writes PLAN.md, INTERVIEW.md, manifest.toml, project CLAUDE.md, root @-line, commits', () => {
    const git = fakeGit();
    const result = planVerb(fullArgs('2026-05-25-demo'), ctx(git));
    expect(result.exitCode).toBe(0);
    const out = JSON.parse(result.stdout as string);
    expect(out.slug).toBe('2026-05-25-demo');
    expect(out.root_claude_md_updated).toBe(true);
    expect(out.committed).toBe(true);

    const dir = join(projectsRoot, '2026-05-25-demo');
    expect(readFileSync(join(dir, 'PLAN.md'), 'utf8')).toContain('the plan');
    expect(readFileSync(join(dir, 'INTERVIEW.md'), 'utf8')).toContain('Q&A');
    expect(existsSync(join(dir, 'manifest.toml'))).toBe(true);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
    // No events.jsonl / config.json (jelly discipline).
    expect(existsSync(join(dir, 'events.jsonl'))).toBe(false);
    expect(existsSync(join(dir, 'config.json'))).toBe(false);

    // Commit staged all 5 files (4 project files + repo-root CLAUDE.md).
    expect(git.commits).toHaveLength(1);
    expect(git.commits[0].message).toBe('[jelly plan] 2026-05-25-demo');
    expect(git.commits[0].paths).toHaveLength(5);
  });

  test('manifest.toml parses back to the expected JellyManifest', () => {
    planVerb(fullArgs('2026-05-25-demo'), ctx(fakeGit()));
    const toml = readFileSync(join(projectsRoot, '2026-05-25-demo', 'manifest.toml'), 'utf8');
    const m = parseManifest(toml);
    expect(m.title).toBe('Demo Project');
    expect(m.slug).toBe('2026-05-25-demo');
    expect(m.started).toBe('2026-05-25');
    expect(m.plan_file).toBe('PLAN.md');
    expect(m.research_file).toBe('RESEARCH.md');
    expect(m.adr_log).toBe('../adr-log');
    expect(m.config).toEqual({ base_branch: 'main', substrate: 'jelly' });
    expect(m.phases).toHaveLength(2);
    expect(m.phases[1].depends_on).toEqual(['1.1']);
  });

  test('project CLAUDE.md has placeholders filled (title, slug, context default)', () => {
    planVerb(fullArgs('2026-05-25-demo'), ctx(fakeGit()));
    const claude = readFileSync(join(projectsRoot, '2026-05-25-demo', 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('# Demo Project');
    expect(claude).toContain('`2026-05-25-demo`');
    expect(claude).toContain('@projects/2026-05-25-demo/CLAUDE.md');
    expect(claude).not.toContain('{{');
    // context/conventions absent in the manifest input → TODO defaults.
    expect(claude).toContain('TODO: fill in project context');
  });

  test('context + conventions from the manifest input fill the template', () => {
    writeFileSync(
      manifestFile,
      JSON.stringify({
        title: 'T',
        status: 'active',
        config: { base_branch: 'main', substrate: 'jelly' },
        phases: [],
        context: 'a real context paragraph',
        conventions: 'use tabs, obviously',
      }),
    );
    planVerb(fullArgs('2026-05-25-demo'), ctx(fakeGit()));
    const claude = readFileSync(join(projectsRoot, '2026-05-25-demo', 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('a real context paragraph');
    expect(claude).toContain('use tabs, obviously');
  });

  test('--no-commit writes files but does not commit', () => {
    const git = fakeGit();
    const result = planVerb([...fullArgs('2026-05-25-demo'), '--no-commit'], ctx(git));
    expect(JSON.parse(result.stdout as string).committed).toBe(false);
    expect(git.commits).toHaveLength(0);
    expect(existsSync(join(projectsRoot, '2026-05-25-demo', 'manifest.toml'))).toBe(true);
  });
});

describe('planVerb: repo-root @-line management', () => {
  test('creates repo-root CLAUDE.md with a managed block when absent', () => {
    planVerb(fullArgs('2026-05-25-demo'), ctx(fakeGit()));
    const root = readFileSync(join(repoRoot, 'CLAUDE.md'), 'utf8');
    expect(root).toContain('<!-- jelly:projects -->');
    expect(root).toContain('@projects/2026-05-25-demo/CLAUDE.md');
    expect(root).toContain('<!-- /jelly:projects -->');
  });

  test('appends a managed block to an existing repo-root CLAUDE.md', () => {
    writeFileSync(join(repoRoot, 'CLAUDE.md'), '# Repo\n\nsome existing posture\n');
    planVerb(fullArgs('2026-05-25-demo'), ctx(fakeGit()));
    const root = readFileSync(join(repoRoot, 'CLAUDE.md'), 'utf8');
    expect(root).toContain('some existing posture');
    expect(root).toContain('@projects/2026-05-25-demo/CLAUDE.md');
  });

  test('re-running for the same slug is idempotent (no duplicate line)', () => {
    planVerb([...fullArgs('2026-05-25-demo'), '--no-commit'], ctx(fakeGit()));
    const result = planVerb([...fullArgs('2026-05-25-demo'), '--no-commit'], ctx(fakeGit()));
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout as string).root_claude_md_updated).toBe(false);
    const root = readFileSync(join(repoRoot, 'CLAUDE.md'), 'utf8');
    const occurrences = root.split('@projects/2026-05-25-demo/CLAUDE.md').length - 1;
    expect(occurrences).toBe(1);
  });

  test('accumulates: a second project adds its line without removing the first', () => {
    planVerb([...fullArgs('2026-05-25-demo'), '--no-commit'], ctx(fakeGit()));
    planVerb([...fullArgs('2026-05-25-other'), '--no-commit'], ctx(fakeGit()));
    const root = readFileSync(join(repoRoot, 'CLAUDE.md'), 'utf8');
    expect(root).toContain('@projects/2026-05-25-demo/CLAUDE.md');
    expect(root).toContain('@projects/2026-05-25-other/CLAUDE.md');
  });
});

describe('planVerb: argument + input validation', () => {
  test('missing required args → missing-args (lists them)', () => {
    const result = planVerb(['2026-05-25-demo'], ctx(fakeGit()));
    expect(result.exitCode).toBe(1);
    const parsed = JSON.parse(result.stderr as string);
    expect(parsed.error).toBe('missing-args');
    expect(parsed.message).toContain('--plan-file');
    expect(parsed.message).toContain('--manifest-file');
    expect(parsed.message).toContain('--template-file');
  });

  test('an input file that does not exist → input-file-not-found', () => {
    const result = planVerb(
      [
        '2026-05-25-demo',
        `--plan-file=${join(scratch, 'nope.md')}`,
        `--interview-file=${interviewFile}`,
        `--manifest-file=${manifestFile}`,
        `--template-file=${templateFile}`,
      ],
      ctx(fakeGit()),
    );
    expect(JSON.parse(result.stderr as string).error).toBe('input-file-not-found');
  });

  test('invalid manifest JSON → manifest-input-invalid (and no project dir created)', () => {
    writeFileSync(manifestFile, '{ not valid json');
    const result = planVerb(fullArgs('2026-05-25-demo'), ctx(fakeGit()));
    expect(JSON.parse(result.stderr as string).error).toBe('manifest-input-invalid');
    expect(existsSync(join(projectsRoot, '2026-05-25-demo'))).toBe(false);
  });

  test('manifest input missing a required field → manifest-input-invalid', () => {
    writeFileSync(manifestFile, JSON.stringify({ status: 'active', config: {}, phases: [] }));
    const result = planVerb(fullArgs('2026-05-25-demo'), ctx(fakeGit()));
    expect(JSON.parse(result.stderr as string).error).toBe('manifest-input-invalid');
  });

  test('template with an unknown placeholder → template-placeholder-unfilled', () => {
    writeFileSync(templateFile, '# {{PROJECT_TITLE}}\n{{UNKNOWN_PLACEHOLDER}}\n');
    const result = planVerb(fullArgs('2026-05-25-demo'), ctx(fakeGit()));
    expect(JSON.parse(result.stderr as string).error).toBe('template-placeholder-unfilled');
    // Failed before writing the project dir.
    expect(existsSync(join(projectsRoot, '2026-05-25-demo'))).toBe(false);
  });

  test('committed PLAN.md → plan-exists-committed (refuse)', () => {
    planVerb([...fullArgs('2026-05-25-demo'), '--no-commit'], ctx(fakeGit()));
    const result = planVerb(fullArgs('2026-05-25-demo'), ctx(fakeGit(true)));
    expect(JSON.parse(result.stderr as string).error).toBe('plan-exists-committed');
  });
});

describe('instantiateTemplate (unit)', () => {
  test('fills all placeholders', () => {
    const out = instantiateTemplate('{{A}} and {{B}}', { A: 'x', B: 'y' });
    expect(out).toBe('x and y');
  });

  test('replaces every occurrence of a placeholder', () => {
    const out = instantiateTemplate('{{A}}-{{A}}', { A: 'z' });
    expect(out).toBe('z-z');
  });

  test('throws on an unfilled placeholder', () => {
    expect(() => instantiateTemplate('{{A}} {{LEFTOVER}}', { A: 'x' })).toThrow(
      /template-placeholder-unfilled/,
    );
  });
});

describe('ensureRootClaudeMdImport (unit)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'jelly-root-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('creates the file when absent (returns true)', () => {
    const p = join(dir, 'CLAUDE.md');
    expect(ensureRootClaudeMdImport(p, 's1')).toBe(true);
    expect(readFileSync(p, 'utf8')).toContain('@projects/s1/CLAUDE.md');
  });

  test('idempotent: second call with the same slug returns false', () => {
    const p = join(dir, 'CLAUDE.md');
    ensureRootClaudeMdImport(p, 's1');
    expect(ensureRootClaudeMdImport(p, 's1')).toBe(false);
  });

  test('accumulates distinct slugs in one block', () => {
    const p = join(dir, 'CLAUDE.md');
    ensureRootClaudeMdImport(p, 's1');
    ensureRootClaudeMdImport(p, 's2');
    const content = readFileSync(p, 'utf8');
    expect(content).toContain('@projects/s1/CLAUDE.md');
    expect(content).toContain('@projects/s2/CLAUDE.md');
    // Exactly one managed block.
    expect(content.split('<!-- jelly:projects -->').length - 1).toBe(1);
  });

  test('appends a block to an existing file without one (returns true)', () => {
    const p = join(dir, 'CLAUDE.md');
    writeFileSync(p, '# Existing\n');
    expect(ensureRootClaudeMdImport(p, 's1')).toBe(true);
    const content = readFileSync(p, 'utf8');
    expect(content).toContain('# Existing');
    expect(content).toContain('@projects/s1/CLAUDE.md');
  });
});
