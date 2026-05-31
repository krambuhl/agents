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
import { researchInit, researchAppend, researchShow, RESEARCH_VERBS } from './research.ts';
import type { GitRunner } from '../../lib/git.ts';
import { manifestPath, readManifestFile, writeManifest } from '../../lib/manifest-toml.ts';
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

test('RESEARCH_VERBS exposes the init/append/show subverb family', () => {
  expect(typeof RESEARCH_VERBS.init).toBe('function');
  expect(typeof RESEARCH_VERBS.append).toBe('function');
  expect(typeof RESEARCH_VERBS.show).toBe('function');
  expect(Object.keys(RESEARCH_VERBS)).toEqual(['init', 'append', 'show']);
});

// ---------- Happy paths ----------

test('researchInit: happy path writes both research files + auto-adopts loom + commits + emits events', () => {
  const result = researchInit(
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

test('researchInit: --no-loom skips auto-adopt AND skips event emission', () => {
  const result = researchInit(
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

test('researchInit: pre-existing manifest.toml skips loom adopt but still emits events', () => {
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

  const result = researchInit(
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

test('researchInit: --no-commit writes files but skips git', () => {
  const result = researchInit(
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

test('researchInit: --pretty produces indented JSON output', () => {
  const result = researchInit(
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

test('researchInit: derives slug from a topic via createSlug(topic, today)', () => {
  const result = researchInit(
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

test('researchInit: full-slug positional passed through verbatim', () => {
  const result = researchInit(
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

test('researchInit: dir-exists-no-RESEARCH succeeds and writes files', () => {
  const targetDir = join(projectsRoot, '2026-05-18-existing-dir');
  mkdirSync(targetDir, { recursive: true });
  const result = researchInit(
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

test('researchInit: uncommitted RESEARCH.md is overwritten (recovery case)', () => {
  const targetDir = join(projectsRoot, '2026-05-18-recovery');
  mkdirSync(targetDir, { recursive: true });
  writeFileSync(join(targetDir, 'RESEARCH.md'), 'stale content');
  // committedPaths is empty → isCommitted returns false
  const result = researchInit(
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

test('researchInit: committed RESEARCH.md throws research-exists-committed', () => {
  const targetDir = join(projectsRoot, '2026-05-18-committed');
  mkdirSync(targetDir, { recursive: true });
  const researchMdPath = join(targetDir, 'RESEARCH.md');
  writeFileSync(researchMdPath, 'committed research');
  committedPaths.add(researchMdPath);
  const result = researchInit(
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

test('researchInit: missing positional throws missing-args', () => {
  const result = researchInit(
    [`--research-file=${researchFile}`, `--notes-file=${notesFile}`],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('researchInit: missing --research-file throws missing-args', () => {
  const result = researchInit(
    ['Topic', `--notes-file=${notesFile}`],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('researchInit: missing --notes-file throws missing-args', () => {
  const result = researchInit(
    ['Topic', `--research-file=${researchFile}`],
    baseCtx(),
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

// ---------- Source-file existence ----------

test('researchInit: missing --research-file source throws research-file-not-found', () => {
  const result = researchInit(
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

test('researchInit: missing --notes-file source throws notes-file-not-found', () => {
  const result = researchInit(
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

// ---------- append / show (Phase 5 unit 2) ----------

const APPEND_SLUG = '2026-05-18-some-topic';

// Scaffold a loom-adopted project (so resolveProject + the manifest exist)
// and return its dir + a fact file ready to append.
function initProject(): { dir: string; factFile: string } {
  researchInit(
    [APPEND_SLUG, `--research-file=${researchFile}`, `--notes-file=${notesFile}`, '--no-commit'],
    baseCtx(),
  );
  const dir = join(projectsRoot, APPEND_SLUG);
  const factFile = join(dirname(researchFile), 'fact.md');
  writeFileSync(factFile, 'A freeform finding paragraph.\n');
  return { dir, factFile };
}

test('researchAppend: appends a provenance-stamped block; prior content is an untouched prefix', () => {
  const { dir, factFile } = initProject();
  const before = readFileSync(join(dir, 'RESEARCH.md'), 'utf8');

  const res = researchAppend(
    [APPEND_SLUG, '--section=Findings', `--fact-file=${factFile}`, '--citing=PR #170', '--phase=5', '--no-commit'],
    baseCtx(),
  );
  expect(res.exitCode).toBe(0);
  const out = JSON.parse(res.stdout as string);
  expect(out.section).toBe('Findings');
  expect(out.provenance.slug).toBe(APPEND_SLUG);
  expect(out.provenance.phase).toBe(5);
  expect(out.provenance.citing).toBe('PR #170');
  expect(typeof out.provenance.at).toBe('string');

  const after = readFileSync(join(dir, 'RESEARCH.md'), 'utf8');
  expect(after.startsWith(before)).toBe(true); // append-only
  expect(after).toContain('## Findings');
  expect(after).toContain('<!-- loom:provenance');
  expect(after).toContain('A freeform finding paragraph.');
});

test('researchAppend: derives the session id from the latest handoff', () => {
  const { dir, factFile } = initProject();
  const mp = manifestPath(dir);
  const { manifest, token } = readManifestFile(mp);
  writeManifest(
    mp,
    {
      ...manifest,
      sessions: [
        ...manifest.sessions,
        {
          schema_version: 1,
          date: '2026-05-31',
          letter: 'a',
          phases_touched: [],
          checkins_written: [],
          pr_activity: [],
          what_happened: [],
          open_threads: [],
          notes: [],
        },
      ],
    },
    { expect: token },
  );

  const out = JSON.parse(
    researchAppend(
      [APPEND_SLUG, '--section=Notes', `--fact-file=${factFile}`, '--citing=x', '--no-commit'],
      baseCtx(),
    ).stdout as string,
  );
  expect(out.provenance.session).toBe('2026-05-31-a');
});

test('researchAppend: session is omitted when no handoff has been saved', () => {
  const { factFile } = initProject();
  const out = JSON.parse(
    researchAppend(
      [APPEND_SLUG, '--section=Notes', `--fact-file=${factFile}`, '--citing=x', '--no-commit'],
      baseCtx(),
    ).stdout as string,
  );
  expect(out.provenance.session).toBeUndefined();
});

test('researchAppend: two appends accumulate; the first block stays byte-unchanged', () => {
  const { dir, factFile } = initProject();
  researchAppend([APPEND_SLUG, '--section=One', `--fact-file=${factFile}`, '--citing=a', '--no-commit'], baseCtx());
  const afterFirst = readFileSync(join(dir, 'RESEARCH.md'), 'utf8');
  researchAppend([APPEND_SLUG, '--section=Two', `--fact-file=${factFile}`, '--citing=b', '--no-commit'], baseCtx());
  const afterSecond = readFileSync(join(dir, 'RESEARCH.md'), 'utf8');
  // The second append only adds at the end — the post-first state is a prefix.
  expect(afterSecond.startsWith(afterFirst)).toBe(true);
  expect(afterSecond).toContain('## One');
  expect(afterSecond).toContain('## Two');
});

test('researchAppend: commits the dossier with a descriptive message unless --no-commit', () => {
  const { factFile } = initProject();
  gitCalls.length = 0;
  researchAppend([APPEND_SLUG, '--section=Findings', `--fact-file=${factFile}`, '--citing=a'], baseCtx());
  const commit = gitCalls.find((c) => c.method === 'addAndCommit');
  expect(commit).toBeDefined();
  expect(commit?.args[2]).toContain('append');
  expect(commit?.args[2]).toContain('Findings');
});

test('researchAppend: errors research-not-found when RESEARCH.md is absent', () => {
  const { dir, factFile } = initProject();
  rmSync(join(dir, 'RESEARCH.md'));
  const res = researchAppend(
    [APPEND_SLUG, '--section=X', `--fact-file=${factFile}`, '--citing=y', '--no-commit'],
    baseCtx(),
  );
  expect(res.exitCode).toBe(1);
  expect(JSON.parse(res.stderr as string).error).toBe('research-not-found');
});

test('researchAppend: missing --section / --fact-file / --citing each error', () => {
  const { factFile } = initProject();
  expect(
    JSON.parse(researchAppend([APPEND_SLUG, `--fact-file=${factFile}`, '--citing=a'], baseCtx()).stderr as string).error,
  ).toBe('missing-args');
  expect(
    JSON.parse(researchAppend([APPEND_SLUG, '--section=S', '--citing=a'], baseCtx()).stderr as string).error,
  ).toBe('missing-args');
  expect(
    JSON.parse(researchAppend([APPEND_SLUG, '--section=S', `--fact-file=${factFile}`], baseCtx()).stderr as string).error,
  ).toBe('missing-args');
});

test('researchShow: returns the full dossier, and a single section with --section', () => {
  const { factFile } = initProject();
  researchAppend([APPEND_SLUG, '--section=Findings', `--fact-file=${factFile}`, '--citing=PR #170', '--no-commit'], baseCtx());

  const full = JSON.parse(researchShow([APPEND_SLUG], baseCtx()).stdout as string);
  expect(full.content).toContain('# RESEARCH');
  expect(full.content).toContain('## Findings');

  const sec = JSON.parse(researchShow([APPEND_SLUG, '--section=Findings'], baseCtx()).stdout as string);
  expect(sec.section).toBe('Findings');
  expect(sec.content.startsWith('## Findings')).toBe(true);
  expect(sec.content).toContain('A freeform finding paragraph.');
  expect(sec.content).not.toContain('A grounded claim with source.'); // not the init body
});

test('researchShow: section-not-found for an absent section', () => {
  initProject();
  const res = researchShow([APPEND_SLUG, '--section=Nope'], baseCtx());
  expect(res.exitCode).toBe(1);
  expect(JSON.parse(res.stderr as string).error).toBe('section-not-found');
});
