import { test, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  copyFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { doctor } from './doctor.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '..', 'fixtures');

let projectsRoot: string;
let projectPath: string;

beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), 'loom-verbs-doctor-'));
  projectPath = join(projectsRoot, '2026-05-15-test-loom');
  mkdirSync(projectPath);
});

afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true });
});

test('doctor: healthy project returns ok=true with empty issues', () => {
  copyFileSync(
    join(FIXTURES, 'manifest-basic.toml'),
    join(projectPath, 'manifest.toml'),
  );
  const result = doctor(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  const report = JSON.parse(result.stdout as string);
  expect(report.ok).toBe(true);
  expect(report.issues).toEqual([]);
});

test('doctor: missing manifest.toml is reported as an issue and ok=false', () => {
  // Resolve by explicit path (the slug filter requires manifest.toml to
  // even see the project; an explicit path reaches a dir that lacks it).
  const result = doctor([projectPath], { projectsRoot });
  expect(result.exitCode).toBe(1);
  const report = JSON.parse(result.stdout as string);
  expect(report.ok).toBe(false);
  const codes = report.issues.map((i: { code: string }) => i.code);
  expect(codes).toContain('manifest-missing');
});

test('doctor: an unparseable / unsupported-version manifest is reported', () => {
  // schema_version 999 — readManifest rejects it on parse, surfacing as
  // manifest-unreadable through doctor.
  writeFileSync(
    join(projectPath, 'manifest.toml'),
    [
      '[meta]',
      'schema_version = 999',
      'title = "x"',
      'slug = "x"',
      'started = "2026-05-15"',
      'status = "active"',
      'strategy = "x"',
      '',
      '[config]',
      'base_branch = "main"',
      'reviewers = []',
      'labels = []',
      'verification = []',
      'worker_bindings = {}',
      '',
    ].join('\n'),
  );
  const result = doctor(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(1);
  const report = JSON.parse(result.stdout as string);
  expect(report.ok).toBe(false);
  const codes = report.issues.map((i: { code: string }) => i.code);
  expect(codes).toContain('manifest-unreadable');
});

test('doctor: no slug arg → uses cwd discovery (not-in-project error if absent)', () => {
  // Without a slug and without cwdOverride pointing at a project,
  // doctor reports it cannot find a project.
  const result = doctor([], { projectsRoot, cwdOverride: tmpdir() });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('not-in-project');
});
