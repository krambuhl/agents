import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/**
 * Plugin-hooks tripwire.
 *
 * A plugin's `hooks/hooks.json` is registered by Claude Code at install
 * time. A malformed file, or a command that points at a script that is
 * missing or not executable, fails silently: the hook never fires and
 * the behavior it was meant to enforce quietly does not exist. This
 * asserts the file parses, has the settings-style `hooks` shape, and
 * that every `${CLAUDE_PLUGIN_ROOT}`-relative command resolves to an
 * executable file with a shebang inside that plugin.
 *
 * Same flavor as `marketplace-manifest.test.ts`: static structural
 * assertions on hand-authored substrate files.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGINS_ROOT = join(REPO_ROOT, 'plugins');

const KNOWN_EVENTS = new Set([
  'PreToolUse',
  'PostToolUse',
  'UserPromptSubmit',
  'Notification',
  'Stop',
  'SubagentStop',
  'SessionStart',
  'SessionEnd',
  'PreCompact',
]);

interface HookCommand {
  readonly type: string;
  readonly command?: string;
}

interface HookGroup {
  readonly matcher?: string;
  readonly hooks: ReadonlyArray<HookCommand>;
}

interface HooksFile {
  readonly description?: string;
  readonly hooks: Record<string, ReadonlyArray<HookGroup>>;
}

function listHooksFiles(): ReadonlyArray<{ plugin: string; path: string }> {
  const out: { plugin: string; path: string }[] = [];
  for (const plugin of readdirSync(PLUGINS_ROOT)) {
    const path = join(PLUGINS_ROOT, plugin, 'hooks', 'hooks.json');
    if (existsSync(path)) out.push({ plugin, path });
  }
  return out;
}

const HOOKS_FILES = listHooksFiles();

describe('plugin hooks: hooks.json files', () => {
  test('at least one plugin ships hooks (commons)', () => {
    expect(HOOKS_FILES.map((h) => h.plugin)).toContain('commons');
  });

  for (const { plugin, path } of HOOKS_FILES) {
    describe(`plugins/${plugin}/hooks/hooks.json`, () => {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as HooksFile;
      const pluginRoot = join(PLUGINS_ROOT, plugin);

      test('has a top-level hooks object keyed by known event names', () => {
        expect(typeof parsed.hooks).toBe('object');
        for (const event of Object.keys(parsed.hooks)) {
          expect(KNOWN_EVENTS.has(event), `unknown hook event "${event}"`).toBe(true);
        }
      });

      test('every group is an array of {type: "command", command} entries', () => {
        for (const groups of Object.values(parsed.hooks)) {
          expect(Array.isArray(groups)).toBe(true);
          for (const group of groups) {
            expect(Array.isArray(group.hooks)).toBe(true);
            for (const hook of group.hooks) {
              expect(hook.type).toBe('command');
              expect(typeof hook.command).toBe('string');
            }
          }
        }
      });

      test('every ${CLAUDE_PLUGIN_ROOT} command resolves to an executable script with a shebang', () => {
        for (const groups of Object.values(parsed.hooks)) {
          for (const group of groups) {
            for (const hook of group.hooks) {
              const command = hook.command ?? '';
              const prefix = '${CLAUDE_PLUGIN_ROOT}/';
              expect(command.startsWith(prefix), `command must be plugin-relative: ${command}`).toBe(true);
              const rel = command.slice(prefix.length).split(/\s+/)[0];
              const abs = join(pluginRoot, rel);
              expect(existsSync(abs), `missing script: ${rel}`).toBe(true);
              const mode = statSync(abs).mode;
              expect(mode & 0o111, `not executable: ${rel}`).not.toBe(0);
              expect(readFileSync(abs, 'utf8').startsWith('#!'), `no shebang: ${rel}`).toBe(true);
            }
          }
        }
      });
    });
  }
});
