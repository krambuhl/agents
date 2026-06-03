import { test, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  copyFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { retroList, retroRead, retroWrite } from './retro.ts';
import { manifestPath, readManifestFile } from '../../lib/manifest-toml.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '..', 'fixtures');

let projectsRoot: string;

beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), 'loom-verbs-retro-'));
  const projectPath = join(projectsRoot, '2026-05-15-test-loom');
  mkdirSync(projectPath);
  // Retros stay file-per-record; the manifest is the single state file.
  copyFileSync(
    join(FIXTURES, 'manifest-basic.toml'),
    join(projectPath, 'manifest.toml'),
  );
  const retrosDir = join(projectPath, 'retros');
  mkdirSync(retrosDir);
  copyFileSync(
    join(FIXTURES, 'retro-session.json'),
    join(retrosDir, 'phase-2-tier-3.json'),
  );
  copyFileSync(
    join(FIXTURES, 'retro-project.json'),
    join(retrosDir, 'project.json'),
  );
});

afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true });
});

test('retroList: returns both retros', () => {
  const result = retroList(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  const list = JSON.parse(result.stdout as string);
  expect(list).toHaveLength(2);
});

test('retroList: --type=session filters', () => {
  const result = retroList(['test-loom', '--type=session'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  const list = JSON.parse(result.stdout as string);
  expect(list).toHaveLength(1);
  expect(list[0].type).toBe('session');
});

test('retroRead: project retro', () => {
  const result = retroRead(['test-loom', '--type=project'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  const r = JSON.parse(result.stdout as string);
  expect(r.type).toBe('project');
});

test('retroRead: session retro requires --phase and --tier', () => {
  const result = retroRead(
    ['test-loom', '--type=session', '--phase=2', '--tier=3'],
    { projectsRoot },
  );
  expect(result.exitCode).toBe(0);
  const r = JSON.parse(result.stdout as string);
  expect(r.type).toBe('session');
});

test('retroRead: session retro missing --phase returns missing-args', () => {
  const result = retroRead(
    ['test-loom', '--type=session', '--tier=3'],
    { projectsRoot },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('retroRead: missing --type returns missing-args', () => {
  const result = retroRead(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('retroWrite: writes a session retro and appends retro-written event', () => {
  // Use a fresh phase/tier so it doesn't collide
  const retro = {
    schema_version: 1,
    type: 'session',
    created: '2026-07-01T12:00:00Z',
    phase: 4,
    tier: 5,
    findings: [],
  };
  const retroFile = join(projectsRoot, 'incoming-retro.json');
  writeFileSync(retroFile, JSON.stringify(retro), 'utf8');

  const result = retroWrite(
    ['test-loom', `--retro-file=${retroFile}`],
    { projectsRoot },
  );
  expect(result.exitCode).toBe(0);
  const written = JSON.parse(result.stdout as string);
  expect(written).toEqual({ section: 'retros', type: 'session', phase: 4, tier: 5 });

  const projectDir = join(projectsRoot, '2026-05-15-test-loom');
  const { manifest } = readManifestFile(manifestPath(projectDir));
  // The retro landed in [[retros]], NOT a retros/ file.
  const appended = manifest.retros.find(
    (r) => r.type === 'session' && r.phase === 4 && r.tier === 5,
  );
  expect(appended).toBeDefined();
  expect(existsSync(join(projectDir, 'retros', 'phase-4-tier-5.json'))).toBe(false);
  // The retro-written breadcrumb still fires.
  const event = manifest.events[manifest.events.length - 1];
  expect(event?.event).toBe('retro-written');
  const detail = event?.detail as { type: string; phase: number; tier: number };
  expect(detail.type).toBe('session');
  expect(detail.phase).toBe(4);
  expect(detail.tier).toBe(5);
});

test('retroWrite: rejects a duplicate (already in the manifest) loudly', () => {
  const retro = {
    schema_version: 1,
    type: 'session',
    created: '2026-07-01T12:00:00Z',
    phase: 7,
    tier: 1,
    findings: [],
  };
  const retroFile = join(projectsRoot, 'dup-retro.json');
  writeFileSync(retroFile, JSON.stringify(retro), 'utf8');
  // First write lands in the manifest.
  expect(
    retroWrite(['test-loom', `--retro-file=${retroFile}`], { projectsRoot }).exitCode,
  ).toBe(0);
  // Second write of the same (phase, tier) is rejected — the create-once guard
  // the verb now owns (appendRetro itself is a plain append).
  const second = retroWrite(['test-loom', `--retro-file=${retroFile}`], { projectsRoot });
  expect(second.exitCode).toBe(1);
  expect(JSON.parse(second.stderr as string).error).toBe('retro-already-exists');
});

test('retroWrite then read/list: a manifest retro is readable manifest-first', () => {
  const retro = {
    schema_version: 1,
    type: 'session',
    created: '2026-09-09T00:00:00Z',
    phase: 9,
    tier: 9,
    findings: [{ category: 'kept-well', description: 'd' }],
  };
  const retroFile = join(projectsRoot, 'r99.json');
  writeFileSync(retroFile, JSON.stringify(retro), 'utf8');
  expect(
    retroWrite(['test-loom', `--retro-file=${retroFile}`], { projectsRoot }).exitCode,
  ).toBe(0);

  // No retros/phase-9-tier-9.json file exists, so a successful read proves the
  // retro came from the manifest, not a fallback file.
  const read = retroRead(
    ['test-loom', '--type=session', '--phase=9', '--tier=9'],
    { projectsRoot },
  );
  expect(read.exitCode).toBe(0);
  const r = JSON.parse(read.stdout as string);
  expect(r.phase).toBe(9);
  expect(r.findings).toHaveLength(1);

  // retroList surfaces the 2 legacy file retros + the 1 new manifest retro,
  // the new one tagged source 'manifest'.
  const list = JSON.parse(
    retroList(['test-loom'], { projectsRoot }).stdout as string,
  );
  expect(list).toHaveLength(3);
  expect(
    list.filter((e: { source: string }) => e.source === 'manifest'),
  ).toHaveLength(1);
  // The two legacy entries are positively tagged 'file' (pins tagging
  // completeness, not just that exactly one is 'manifest').
  expect(
    list.filter((e: { source: string }) => e.source === 'file'),
  ).toHaveLength(2);
});

test('retroWrite: missing --retro-file returns missing-args', () => {
  const result = retroWrite(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});
