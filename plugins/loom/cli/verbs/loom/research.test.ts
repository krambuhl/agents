import { test, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { researchVerb, RESEARCH_VERBS } from './research.ts';
import type { GitRunner } from '../../lib/git.ts';
import { manifestPath, readManifestFile } from '../../lib/manifest-toml.ts';
import type { Event } from '../../lib/types.ts';

// Events now live in the project's manifest.toml [[events]].
function readEvents(projectDir: string): Event[] {
  return readManifestFile(manifestPath(projectDir)).manifest.events;
}

let projectsRoot: string;
let researchFile: string;
let notesFile: string;
let gitCalls: Array<{ method: string; args: unknown[] }>;
let committedPaths: Set<string>;
let gitRunner: GitRunner;

beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), 'research-test-'));
  const srcDir = mkdtempSync(join(tmpdir(), 'research-test-src-'));
  researchFile = join(srcDir, 'research.md');
  notesFile = join(srcDir, 'notes.md');
  writeFileSync(researchFile, '# RESEARCH\n\nA grounded claim with source.\n');
  writeFileSync(notesFile, '# RESEARCH NOTES\n\nRaw interview trail.\n');

  gitCalls = [];
  committedPaths = new Set();
  gitRunner = {
    isCommitted(repoRoot: string, filePath: string): boolean {
      gitCalls.push({ method: 'isCommitted', args: [repoRoot, filePath] });
      return committedPaths.has(filePath);
    },
    addAndCommit(repoRoot: string, paths: string[], message: string): void {
      gitCalls.push({ method: 'addAndCommit', args: [repoRoot, paths, message] });
      for (const p of paths) committedPaths.add(p);
    },
  };
});

afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true });
});

const baseCtx = () => ({
  projectsRoot,
  today: '2026-05-18',
  gitRunner,
});

// ---------- Registry shape ----------

test('RESEARCH_VERBS exposes `research` as the only verb (verbless namespace)', () => {
  expect(typeof RESEARCH_VERBS.research).toBe('function');
  expect(Object.keys(RESEARCH_VERBS)).toEqual(['research']);
});

// ---------- Happy paths ----------

test('researchVerb: happy path writes both research files + auto-adopts loom + commits + emits events', () => {
  const result = researchVerb(
    [
      'New research topic',
      `--research-file=${researchFile}`,
      `--notes-file=${notesFile}`,
    ],
    baseCtx(),
  );

  expect(result.exitCode).toBe(0);
  expect(result.stdout).toBeDefined();
  const payload = JSON.parse(result.stdout as string);
  expect(payload.slug).toBe('2026-05-18-new-research-topic');
  expect(payload.path).toBe(
    join(projectsRoot, '2026-05-18-new-research-topic'),
  );
  expect(payload.committed).toBe(true);
  expect(payload.loom_adopted).toBe(true);
  expect(payload.events_emitted).toBe(true);

  // Research files written
  expect(
    readFileSync(join(payload.path, 'RESEARCH.md'), 'utf8'),
  ).toContain('# RESEARCH');
  expect(
    readFileSync(join(payload.path, 'RESEARCH-NOTES.md'), 'utf8'),
  ).toContain('# RESEARCH NOTES');

  // Single state file written by auto-adopt (config.json / events.jsonl folded in)
  expect(existsSync(join(payload.path, 'manifest.toml'))).toBe(true);
  expect(existsSync(join(payload.path, 'config.json'))).toBe(false);
  expect(existsSync(join(payload.path, 'events.jsonl'))).toBe(false);

  // [[events]] carries project-initialized + research-started + research-completed
  const events = readEvents(payload.path);
  const names = events.map((e) => e.event);
  expect(names).toEqual([
    'project-initialized',
    'research-started',
    'research-completed',
  ]);

  // research-started detail carries the topic (slug-derived)
  const startedDetail = events[1].detail as {
    slug: string;
    topic: string | null;
  };
  expect(startedDetail.slug).toBe('2026-05-18-new-research-topic');
  expect(startedDetail.topic).toBe('New research topic');

  // research-completed detail carries project-relative paths
  const completedDetail = events[2].detail as {
    slug: string;
    research_path: string;
    notes_path: string;
  };
  expect(completedDetail.research_path).toBe('RESEARCH.md');
  expect(completedDetail.notes_path).toBe('RESEARCH-NOTES.md');

  // git addAndCommit called once with the three files (RESEARCH.md +
  // RESEARCH-NOTES.md + manifest.toml) + a loom-research message
  const addCalls = gitCalls.filter((c) => c.method === 'addAndCommit');
  expect(addCalls.length).toBe(1);
  const [, paths, message] = addCalls[0]?.args ?? [];
  expect((paths as string[]).length).toBe(3);
  expect(message).toContain('loom research');
  expect(message).toContain('2026-05-18-new-research-topic');
});

test('researchVerb: --no-loom skips auto-adopt AND skips event emission', () => {
  const result = researchVerb(
    [
      'Topic',
      `--research-file=${researchFile}`,
      `--notes-file=${notesFile}`,
      '--no-loom',
    ],
    baseCtx(),
  );

  expect(result.exitCode).toBe(0);
  const payload = JSON.parse(result.stdout as string);
  expect(payload.loom_adopted).toBe(false);
  expect(payload.events_emitted).toBe(false);

  // Research files present
  expect(existsSync(join(payload.path, 'RESEARCH.md'))).toBe(true);
  expect(existsSync(join(payload.path, 'RESEARCH-NOTES.md'))).toBe(true);
  // No manifest exists to write events into
  expect(existsSync(join(payload.path, 'events.jsonl'))).toBe(false);
  expect(existsSync(join(payload.path, 'manifest.toml'))).toBe(false);

  // Commit only includes the two research files
  const addCalls = gitCalls.filter((c) => c.method === 'addAndCommit');
  expect(addCalls.length).toBe(1);
  const [, paths] = addCalls[0]?.args ?? [];
  expect((paths as string[]).length).toBe(2);
});

test('researchVerb: pre-existing manifest.toml skips loom adopt but still emits events', () => {
  // Recovery / coexistence case: a project that already adopted loom
  // (e.g. via `loom plan` earlier) and the user is now adding research.
  const slug = '2026-05-18-existing';
  const dir = join(projectsRoot, slug);
  mkdirSync(dir, { recursive: true });
  // A valid pre-existing manifest.toml (recordEvent parses it to append).
  const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'fixtures');
  writeFileSync(
    manifestPath(dir),
    readFileSync(join(FIXTURES, 'manifest-basic.toml'), 'utf8'),
  );

  const result = researchVerb(
    [
      slug,
      `--research-file=${researchFile}`,
      `--notes-file=${notesFile}`,
    ],
    baseCtx(),
  );
  expect(result.exitCode).toBe(0);
  const payload = JSON.parse(result.stdout as string);
  expect(payload.loom_adopted).toBe(false);
  expect(payload.events_emitted).toBe(true);

  // Existing manifest preserved (its phases survive; only [[events]] grows)
  const { manifest } = readManifestFile(manifestPath(dir));
  expect(manifest.phases).toHaveLength(4);
  // Events appended to the pre-existing manifest
  const names = manifest.events.map((e) => e.event);
  expect(names).toEqual(['research-started', 'research-completed']);
});

test('researchVerb: --no-commit writes files but skips git', () => {
  const result = researchVerb(
    [
      'Topic',
      `--research-file=${researchFile}`,
      `--notes-file=${notesFile}`,
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.exitCode).toBe(0);
  const payload = JSON.parse(result.stdout as string);
  expect(payload.committed).toBe(false);
  // Files still written + loom still adopted
  expect(existsSync(join(payload.path, 'RESEARCH.md'))).toBe(true);
  expect(existsSync(join(payload.path, 'manifest.toml'))).toBe(true);
  // Events still emitted — emission is gated on loom-presence, not on
  // commit decisions.
  expect(payload.events_emitted).toBe(true);
  // No addAndCommit call
  expect(gitCalls.filter((c) => c.method === 'addAndCommit').length).toBe(0);
});

test('researchVerb: --pretty produces indented JSON output', () => {
  const result = researchVerb(
    [
      'Topic',
      `--research-file=${researchFile}`,
      `--notes-file=${notesFile}`,
      '--pretty',
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.stdout).toContain('\n');
  expect(result.stdout).toContain('  "slug"');
});

test('researchVerb: derives slug from a topic via createSlug(topic, today)', () => {
  const result = researchVerb(
    [
      'CLI: research & shifts!',
      `--research-file=${researchFile}`,
      `--notes-file=${notesFile}`,
      '--no-commit',
    ],
    baseCtx(),
  );
  const payload = JSON.parse(result.stdout as string);
  expect(payload.slug).toBe('2026-05-18-cli-research-shifts');
});

test('researchVerb: full-slug positional passed through verbatim', () => {
  const result = researchVerb(
    [
      '2026-05-18-explicit-slug',
      `--research-file=${researchFile}`,
      `--notes-file=${notesFile}`,
      '--no-commit',
    ],
    baseCtx(),
  );
  const payload = JSON.parse(result.stdout as string);
  expect(payload.slug).toBe('2026-05-18-explicit-slug');
  // research-started.detail.topic is null when the positional was a slug
  const events = readEvents(payload.path);
  const startedDetail = events.find((e) => e.event === 'research-started')
    ?.detail as { topic?: string | null };
  // TOML has no null literal, so a null topic round-trips as an absent key
  // (null-by-absence) — undefined here, semantically "no topic" either way.
  expect(startedDetail.topic ?? null).toBeNull();
});

// ---------- Directory exists but no RESEARCH.md ----------

test('researchVerb: dir-exists-no-RESEARCH succeeds and writes files', () => {
  const targetDir = join(projectsRoot, '2026-05-18-existing-dir');
  mkdirSync(targetDir, { recursive: true });
  const result = researchVerb(
    [
      'existing-dir',
      `--research-file=${researchFile}`,
      `--notes-file=${notesFile}`,
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.exitCode).toBe(0);
  expect(existsSync(join(targetDir, 'RESEARCH.md'))).toBe(true);
});

// ---------- RESEARCH.md exists ----------

test('researchVerb: uncommitted RESEARCH.md is overwritten (recovery case)', () => {
  const targetDir = join(projectsRoot, '2026-05-18-recovery');
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, 'RESEARCH.md'), 'stale content');
  // committedPaths is empty → isCommitted returns false
  const result = researchVerb(
    [
      'recovery',
      `--research-file=${researchFile}`,
      `--notes-file=${notesFile}`,
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.exitCode).toBe(0);
  expect(readFileSync(join(targetDir, 'RESEARCH.md'), 'utf8')).toContain(
    '# RESEARCH',
  );
});

test('researchVerb: committed RESEARCH.md throws research-exists-committed', () => {
  const targetDir = join(projectsRoot, '2026-05-18-committed');
  mkdirSync(targetDir, { recursive: true });
  const researchMdPath = join(targetDir, 'RESEARCH.md');
  writeFileSync(researchMdPath, 'committed research');
  committedPaths.add(researchMdPath);
  const result = researchVerb(
    [
      'committed',
      `--research-file=${researchFile}`,
      `--notes-file=${notesFile}`,
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  const payload = JSON.parse(result.stderr as string);
  expect(payload.error).toBe('research-exists-committed');
  // Error message points the user at the deferred `loom revise-research`
  // verb so they don't go hunting for a workaround.
  expect(payload.message).toMatch(/revise-research/);
});

// ---------- Missing args ----------

test('researchVerb: missing positional throws missing-args', () => {
  const result = researchVerb(
    [`--research-file=${researchFile}`, `--notes-file=${notesFile}`],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('researchVerb: missing --research-file throws missing-args', () => {
  const result = researchVerb(
    ['Topic', `--notes-file=${notesFile}`],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('researchVerb: missing --notes-file throws missing-args', () => {
  const result = researchVerb(
    ['Topic', `--research-file=${researchFile}`],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

// ---------- Source-file existence ----------

test('researchVerb: missing --research-file source throws research-file-not-found', () => {
  const result = researchVerb(
    [
      'Topic',
      '--research-file=/nonexistent/research.md',
      `--notes-file=${notesFile}`,
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe(
    'research-file-not-found',
  );
});

test('researchVerb: missing --notes-file source throws notes-file-not-found', () => {
  const result = researchVerb(
    [
      'Topic',
      `--research-file=${researchFile}`,
      '--notes-file=/nonexistent/notes.md',
      '--no-commit',
    ],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe(
    'notes-file-not-found',
  );
});
