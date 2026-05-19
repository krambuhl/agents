import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/**
 * V11 tripwire (from the marketplace-portable-install plan):
 * skill bodies must invoke CLIs as bare commands (`loom`, `griot`,
 * `guild`) rather than the marketplace-local `bin/<cli>` path. After
 * plugin install, each plugin's `bin/` directory lands on Claude
 * Code's Bash PATH automatically, so bare invocations resolve.
 *
 * The check scans every `skills/<name>/SKILL.md` and fails loud on
 * the two patterns that survive a careless rewrite: `Bash("bin/...)`
 * tool invocations and ```bash` code blocks that lead with `bin/<cli>`.
 *
 * Prose noun references to `bin/<cli>` (e.g. "the `bin/loom` CLI as
 * a marketplace path") are intentionally NOT flagged — they discuss
 * the source-of-truth path, not an invocation.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_ROOT = join(REPO_ROOT, 'skills');

interface SkillFile {
  readonly relativePath: string;
  readonly absolutePath: string;
  readonly body: string;
  readonly lines: ReadonlyArray<string>;
}

function listSkillFiles(): ReadonlyArray<SkillFile> {
  const entries = readdirSync(SKILLS_ROOT);
  const skills: SkillFile[] = [];
  for (const name of entries) {
    const skillDir = join(SKILLS_ROOT, name);
    if (!statSync(skillDir).isDirectory()) continue;
    const path = join(skillDir, 'SKILL.md');
    try {
      const body = readFileSync(path, 'utf8');
      skills.push({
        relativePath: join('skills', name, 'SKILL.md'),
        absolutePath: path,
        body,
        lines: body.split('\n'),
      });
    } catch {
      // No SKILL.md in this directory; not a skill source.
    }
  }
  return skills;
}

const SKILLS = listSkillFiles();

describe('V11: skill bodies invoke CLIs as bare commands (no bin/<cli>)', () => {
  test('at least one skill file was discovered (sanity check)', () => {
    expect(SKILLS.length).toBeGreaterThan(0);
  });

  for (const skill of SKILLS) {
    describe(skill.relativePath, () => {
      test('no Bash("bin/<cli> ...) tool invocations', () => {
        const bashInvocationRe = /Bash\("bin\/(loom|griot|guild)\b/;
        const offending: string[] = [];
        skill.lines.forEach((line, idx) => {
          if (bashInvocationRe.test(line)) {
            offending.push(`${skill.relativePath}:${idx + 1}: ${line.trim()}`);
          }
        });
        expect(
          offending,
          `Bash("bin/<cli> ...) invocations must use bare commands after plugin install. Offending lines:\n${offending.join('\n')}`,
        ).toEqual([]);
      });

      test('no bash code blocks that lead with `bin/<cli>` (invocation context)', () => {
        // Walk the file tracking two pieces of state:
        //   - whether we're inside ANY fenced block (so close-fences
        //     don't get misread as openers)
        //   - whether THAT block is a shell-language block (where
        //     `bin/<cli>` is an actionable invocation rather than
        //     prose).
        // Shell lanes: empty lang, `bash`, `sh`, `shell`, `zsh`,
        // `console`. Anything else (`text`, `markdown`, `ts`, `json`)
        // is illustrative-only and `bin/<cli>` inside it is left alone.
        let inFencedBlock = false;
        let blockIsShell = false;
        const offending: string[] = [];
        const codeFenceRe = /^[ \t]*```([a-zA-Z0-9_-]*)/;
        const invocationRe = /^[ \t]*bin\/(loom|griot|guild)\b/;
        const SHELL_LANGS = new Set(['', 'bash', 'sh', 'shell', 'zsh', 'console']);
        skill.lines.forEach((line, idx) => {
          const fence = codeFenceRe.exec(line);
          if (fence !== null) {
            if (inFencedBlock) {
              // Closing the current block. Reset to outside.
              inFencedBlock = false;
              blockIsShell = false;
            } else {
              // Opening a new block. Capture its language to decide
              // whether invocation-matching should fire inside it.
              inFencedBlock = true;
              blockIsShell = SHELL_LANGS.has(fence[1]);
            }
            return;
          }
          if (inFencedBlock && blockIsShell && invocationRe.test(line)) {
            offending.push(`${skill.relativePath}:${idx + 1}: ${line.trim()}`);
          }
        });
        expect(
          offending,
          `bash code blocks must invoke bare commands after plugin install. Offending lines:\n${offending.join('\n')}`,
        ).toEqual([]);
      });
    });
  }
});
