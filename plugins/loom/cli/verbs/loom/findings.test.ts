import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findingsHarvest } from './findings.ts';
import { manifestPath, readManifestFile } from '../../lib/manifest-toml.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '..', 'fixtures');

let projectsRoot: string;
let projectPath: string;

function row(over: Record<string, unknown>): string {
  return JSON.stringify({
    ts: '2026-06-03T00:00:00Z',
    slug: '2026-05-15-test-loom',
    branch: 'b',
    unit: '01',
    evaluator: 'evaluator-test-unit',
    code: 'c',
    evidence: 'e',
    signature: 'sig',
    severity: 'advisory',
    ...over,
  });
}

function writeJsonl(lines: string[]): void {
  writeFileSync(join(projectPath, '.guild-findings.jsonl'), `${lines.join('\n')}\n`, 'utf8');
}

beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), 'loom-verbs-findings-'));
  projectPath = join(projectsRoot, '2026-05-15-test-loom');
  mkdirSync(projectPath);
  copyFileSync(join(FIXTURES, 'manifest-basic.toml'), join(projectPath, 'manifest.toml'));
});

afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true });
});

test('harvest folds new rows into [[findings]], deduped on signature, idempotent', () => {
  writeJsonl([
    row({ signature: 'sig-a', code: 'c1' }),
    row({ signature: 'sig-b', code: 'c2', severity: 'blocking', unit: '02' }),
    row({ signature: 'sig-a', code: 'c1' }), // duplicate signature — folds once
  ]);
  const result = findingsHarvest(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout as string)).toEqual({
    section: 'findings',
    harvested: 2,
    skipped: 1,
  });

  const { manifest } = readManifestFile(manifestPath(projectPath));
  expect(manifest.findings).toHaveLength(2);
  expect(manifest.findings.map((f) => f.signature).sort()).toEqual(['sig-a', 'sig-b']);
  const a = manifest.findings.find((f) => f.signature === 'sig-a');
  expect(a).toMatchObject({ evaluator: 'evaluator-test-unit', code: 'c1', severity: 'advisory', branch: 'b', unit: '01' });
  expect(typeof a?.harvested_at).toBe('string');

  // Re-harvest: every signature is already in the manifest, so nothing new folds.
  const again = findingsHarvest(['test-loom'], { projectsRoot });
  expect(JSON.parse(again.stdout as string)).toEqual({ section: 'findings', harvested: 0, skipped: 3 });
  expect(readManifestFile(manifestPath(projectPath)).manifest.findings).toHaveLength(2);
});

test('harvest with no .guild-findings.jsonl returns harvested 0, no error', () => {
  const result = findingsHarvest(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout as string)).toEqual({ section: 'findings', harvested: 0, skipped: 0 });
});

test('harvest --branch folds only rows from that branch', () => {
  writeJsonl([
    row({ signature: 'sig-x', branch: 'b1' }),
    row({ signature: 'sig-y', branch: 'b2' }),
  ]);
  const result = findingsHarvest(['test-loom', '--branch=b1'], { projectsRoot });
  expect(JSON.parse(result.stdout as string)).toEqual({ section: 'findings', harvested: 1, skipped: 0 });
  const { manifest } = readManifestFile(manifestPath(projectPath));
  expect(manifest.findings.map((f) => f.signature)).toEqual(['sig-x']);
});

test('harvest skips a malformed jsonl line rather than failing', () => {
  writeJsonl([row({ signature: 'sig-ok' }), 'not json at all']);
  const result = findingsHarvest(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout as string)).toEqual({ section: 'findings', harvested: 1, skipped: 1 });
});

test('harvest without a slug returns missing-slug', () => {
  const result = findingsHarvest([], { projectsRoot });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-slug');
});
