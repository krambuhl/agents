import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/**
 * Regression guard for the manifest.toml consolidation
 * (project 2026-06-02-state-file-format-audit). Loom project state is one
 * sectioned `manifest.toml` now; the retired pre-consolidation file names
 * (`manifest.json`, `config.json`, `events.jsonl`) must not reappear in the
 * should-be-current prose surfaces: every skill body, plus the agent- and
 * project-convention docs.
 *
 * `LOOM-CONVENTIONS.md` is deliberately NOT scanned — it is the canonical
 * doc that narrates the consolidation history on purpose ("project state
 * lived in five separate files…") and documents the legacy
 * `retros/<filename>.json` shape for forward-only reads. The high-churn
 * surfaces that actually drift back are the skills and the convention docs;
 * those are what this guard locks. (This test file naturally contains the
 * forbidden names in its own constants — it is not in the scanned set.)
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const PLUGINS_ROOT = join(REPO_ROOT, 'plugins');

const FORBIDDEN: ReadonlyArray<{ name: string; re: RegExp }> = [
  { name: 'manifest.json', re: /\bmanifest\.json\b/ },
  { name: 'config.json', re: /\bconfig\.json\b/ },
  { name: 'events.jsonl', re: /\bevents\.jsonl\b/ },
];

// Every skill body + the two convention docs that describe project state.
// AGENT-CONVENTIONS.md is scanned in its commons-canonical copy only; the
// per-plugin mirrors are held byte-identical by doc-copies-byte-identity.
function listScannedFiles(): string[] {
  const files: string[] = [];
  for (const pluginName of readdirSync(PLUGINS_ROOT)) {
    const skillsDir = join(PLUGINS_ROOT, pluginName, 'skills');
    let names: string[];
    try {
      if (!statSync(skillsDir).isDirectory()) continue;
      names = readdirSync(skillsDir);
    } catch {
      continue;
    }
    for (const name of names) {
      const path = join(skillsDir, name, 'SKILL.md');
      try {
        statSync(path);
        files.push(path);
      } catch {
        // directory without a SKILL.md; skip
      }
    }
  }
  files.push(join(PLUGINS_ROOT, 'commons', 'docs', 'AGENT-CONVENTIONS.md'));
  files.push(join(REPO_ROOT, 'projects', 'CONVENTIONS.md'));
  return files;
}

describe('retired five-file vocabulary stays out of current prose', () => {
  test('no skill body or convention doc references manifest.json / config.json / events.jsonl', () => {
    const files = listScannedFiles();
    // Coverage-erosion floor: if skills move out of `plugins/*/skills/` or
    // `SKILL.md` is renamed, the scan would silently shrink toward empty and
    // still pass green. There are well over a dozen skill bodies + 2 docs.
    expect(files.length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const path of files) {
      readFileSync(path, 'utf8')
        .split('\n')
        .forEach((line: string, i: number) => {
          for (const { re } of FORBIDDEN) {
            if (re.test(line)) {
              offenders.push(`${path.replace(`${REPO_ROOT}/`, '')}:${i + 1}: ${line.trim()}`);
            }
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  test('the guard bites a planted retired-format reference (it is not a no-op)', () => {
    const hits = (s: string) => FORBIDDEN.some(({ re }) => re.test(s));
    // The retired names trip it.
    expect(hits('the project `manifest.json` holds state')).toBe(true);
    expect(hits('verification commands from `config.json`')).toBe(true);
    expect(hits('the `events.jsonl` trail')).toBe(true);
    // The consolidated vocabulary must NOT trip it.
    expect(hits("the manifest's `[[events]]` section in `manifest.toml`")).toBe(false);
    // The live scratch stream must NOT trip it (it is not events.jsonl).
    expect(hits('projects/<slug>/.guild-findings.jsonl')).toBe(false);
  });
});
