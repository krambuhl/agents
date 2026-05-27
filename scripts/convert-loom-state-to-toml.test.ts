// Real-artifact regression for the loom-state converter: build a genuine
// old-format project (manifest.json + config.json + events.jsonl +
// checkins/<branch>/NN.json + sessions/*.json) in a temp dir, convert it,
// and assert the consolidated manifest.toml round-trips back to the expected
// shape AND the old stores are gone.

import { test, expect } from 'vitest';
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
import { convertProject } from './convert-loom-state-to-toml.ts';
import { manifestPath, readManifestFile } from '../plugins/loom/cli/lib/manifest-toml.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', 'plugins', 'loom', 'cli', 'fixtures');

function buildLegacyProject(): string {
  const root = mkdtempSync(join(tmpdir(), 'loom-convert-'));
  const dir = join(root, '2026-05-15-test-loom');
  mkdirSync(dir, { recursive: true });
  copyFileSync(join(FIXTURES, 'manifest-basic.json'), join(dir, 'manifest.json'));
  copyFileSync(join(FIXTURES, 'config-basic.json'), join(dir, 'config.json'));
  writeFileSync(
    join(dir, 'events.jsonl'),
    [
      JSON.stringify({ at: 't1', event: 'project-initialized', detail: {} }),
      JSON.stringify({ at: 't2', event: 'pr-merged', detail: { pr: 7 } }),
    ].join('\n') + '\n',
  );
  const branchDir = join(dir, 'checkins', 'loom-cli', 'phase-1');
  mkdirSync(branchDir, { recursive: true });
  copyFileSync(join(FIXTURES, 'checkin-basic.json'), join(branchDir, '04.json'));
  const sessionsDir = join(dir, 'sessions');
  mkdirSync(sessionsDir);
  copyFileSync(join(FIXTURES, 'session-basic.json'), join(sessionsDir, '2026-05-15-a.json'));
  return dir;
}

test('convertProject folds the legacy stores into a manifest.toml and removes them', () => {
  const dir = buildLegacyProject();
  try {
    const counts = convertProject(dir);
    expect(counts).toEqual({ events: 2, checkins: 1, sessions: 1 });

    // The consolidated manifest round-trips through the typed reader.
    const { manifest } = readManifestFile(manifestPath(dir));
    expect(manifest.meta.slug).toBe('2026-05-15-loom-cli');
    expect(manifest.phases).toHaveLength(4);
    expect(manifest.events.map((e) => e.event)).toEqual([
      'project-initialized',
      'pr-merged',
    ]);
    expect(manifest.checkins).toHaveLength(1);
    expect(manifest.checkins[0].number).toBe('04');
    expect(manifest.sessions).toHaveLength(1);
    expect(manifest.config.base_branch).toBeDefined();

    // Old stores are gone.
    expect(existsSync(join(dir, 'manifest.json'))).toBe(false);
    expect(existsSync(join(dir, 'config.json'))).toBe(false);
    expect(existsSync(join(dir, 'events.jsonl'))).toBe(false);
    expect(existsSync(join(dir, 'sessions'))).toBe(false);
    expect(existsSync(join(dir, 'checkins'))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(dirname(dir), { recursive: true, force: true });
  }
});

test('convertProject throws (leaving the project untouched) on a non-loom-shaped checkin', () => {
  // A fork-shaped checkin missing the load-bearing verdict — loom's reader
  // rejects it, so the verify-before-rename throws and nothing is removed.
  // main() turns this into a warn-and-skip; loom's schema stays strict.
  const dir = buildLegacyProject();
  try {
    const branchDir = join(dir, 'checkins', 'ev-agent.fork', 'phase-1');
    mkdirSync(branchDir, { recursive: true });
    writeFileSync(
      join(branchDir, '01.json'),
      JSON.stringify({
        schema_version: 1,
        number: '01',
        created: 't',
        phase: { number: 1, name: 'P' },
        branch: 'ev-agent.fork/phase-1',
        unit: 'u',
        contract: { goal: 'g', acceptance_criteria: [], rules_applied: [], disqualifiers: [], inputs: [] },
        execution: { actions: [], files_touched: [], corrections: [] },
        notes_for_pr: [],
        // no verdict / scope / changes_since_previous
      }),
    );
    expect(() => convertProject(dir)).toThrow(/verdict/);
    // Untouched: the legacy manifest.json is still there, no manifest.toml.
    expect(existsSync(join(dir, 'manifest.json'))).toBe(true);
    expect(existsSync(manifestPath(dir))).toBe(false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(dirname(dir), { recursive: true, force: true });
  }
});

test('convertProject preserves a checkins/<branch>/responses/ subdir', () => {
  const dir = buildLegacyProject();
  try {
    const responsesDir = join(dir, 'checkins', 'loom-cli', 'phase-1', 'responses');
    mkdirSync(responsesDir, { recursive: true });
    writeFileSync(join(responsesDir, 'response-01.json'), '{"comment_id":1,"body":"x"}');

    convertProject(dir);

    // checkin record file folded + removed, but the responses survive.
    expect(existsSync(join(dir, 'checkins', 'loom-cli', 'phase-1', '04.json'))).toBe(false);
    expect(existsSync(join(responsesDir, 'response-01.json'))).toBe(true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(dirname(dir), { recursive: true, force: true });
  }
});
