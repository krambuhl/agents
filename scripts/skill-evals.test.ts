import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as parseYaml } from 'js-yaml';
import { describe, expect, test } from 'vitest';

/**
 * Skill-eval tripwire.
 *
 * A skill may ship a promptfoo suite under `skills/<name>/evals/`. The
 * suite only runs on demand (it calls a model), so nothing in `npm test`
 * exercises it. What can rot silently is the wiring: a fixture renamed
 * without its `file://` reference, a config that no longer parses, a
 * plugin path that no longer points at the plugin, a skill name that no
 * longer matches the skill next door. This test checks that wiring
 * statically so a broken suite fails here instead of at the first eval
 * run weeks later.
 *
 * Same flavor as `plugin-hooks.test.ts`: structural assertions on
 * hand-authored files, no model calls.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLUGINS_ROOT = join(REPO_ROOT, 'plugins');

interface EvalSuite {
  readonly plugin: string;
  readonly skill: string;
  readonly dir: string;
}

interface ProviderEntry {
  readonly id?: string;
  readonly config?: {
    readonly plugins?: ReadonlyArray<{ type?: string; path?: string }>;
    readonly skills?: ReadonlyArray<string> | string;
    readonly working_dir?: string;
  };
}

interface AssertionEntry {
  readonly type?: string;
  readonly value?: unknown;
}

interface PromptfooConfig {
  readonly prompts?: ReadonlyArray<string>;
  readonly providers?: ReadonlyArray<ProviderEntry | string>;
  readonly tests?: ReadonlyArray<string | object>;
  readonly defaultTest?: { assert?: ReadonlyArray<AssertionEntry> };
}

interface TestCase {
  readonly description?: string;
  readonly metadata?: Record<string, unknown>;
  readonly vars?: Record<string, unknown>;
  readonly assert?: ReadonlyArray<AssertionEntry>;
}

function listSuites(): ReadonlyArray<EvalSuite> {
  const out: EvalSuite[] = [];
  for (const plugin of readdirSync(PLUGINS_ROOT)) {
    const skillsDir = join(PLUGINS_ROOT, plugin, 'skills');
    if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) continue;
    for (const skill of readdirSync(skillsDir)) {
      const dir = join(skillsDir, skill, 'evals');
      if (existsSync(dir) && statSync(dir).isDirectory()) out.push({ plugin, skill, dir });
    }
  }
  return out;
}

function fileRefs(value: unknown, acc: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.startsWith('file://')) acc.push(value.slice('file://'.length));
  } else if (Array.isArray(value)) {
    for (const v of value) fileRefs(v, acc);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) fileRefs(v, acc);
  }
  return acc;
}

const SUITES = listSuites();

describe('skill evals: promptfoo suites under skills/<name>/evals', () => {
  test('the two voice skills ship suites', () => {
    const names = SUITES.map((s) => `${s.plugin}/${s.skill}`);
    expect(names).toContain('commons/write-as-me');
    expect(names).toContain('commons/pr-comments');
  });

  for (const suite of SUITES) {
    describe(`plugins/${suite.plugin}/skills/${suite.skill}/evals`, () => {
      const configPath = join(suite.dir, 'promptfooconfig.yaml');
      const config = parseYaml(readFileSync(configPath, 'utf8')) as PromptfooConfig;

      test('has the three required files', () => {
        for (const f of ['promptfooconfig.yaml', 'prompt.txt', 'tests.yaml']) {
          expect(existsSync(join(suite.dir, f)), `missing ${f}`).toBe(true);
        }
      });

      test('every file:// reference in the config resolves', () => {
        for (const rel of fileRefs(config)) {
          expect(existsSync(join(suite.dir, rel)), `unresolved ${rel}`).toBe(true);
        }
      });

      test('every file:// reference in tests.yaml resolves and is a text fixture', () => {
        const cases = parseYaml(readFileSync(join(suite.dir, 'tests.yaml'), 'utf8')) as TestCase[];
        expect(Array.isArray(cases)).toBe(true);
        expect(cases.length).toBeGreaterThan(0);
        for (const c of cases) {
          for (const rel of fileRefs(c.vars)) {
            expect(existsSync(join(suite.dir, rel)), `unresolved ${rel} in "${c.description}"`).toBe(true);
            // promptfoo executes a file:// var that ends in .js/.ts/.py and
            // uses the return value, so a code-shaped fixture must carry a
            // text extension or it gets run instead of read.
            expect(/\.(m?[jt]sx?|py)$/.test(rel), `fixture ${rel} would be executed, not read; use .txt/.md/.diff`).toBe(false);
            // fixture text is rendered through nunjucks before it reaches the
            // model, so template syntax (jsx `{{ }}`, `{% %}`) breaks the run.
            const body = readFileSync(join(suite.dir, rel), 'utf8');
            expect(/\{\{|\{%/.test(body), `fixture ${rel} contains template syntax that nunjucks will try to render`).toBe(false);
          }
        }
      });

      test('every case carries suite and case_id metadata', () => {
        const cases = parseYaml(readFileSync(join(suite.dir, 'tests.yaml'), 'utf8')) as TestCase[];
        for (const c of cases) {
          expect(c.metadata?.suite, `no suite on "${c.description}"`).toBe(suite.skill);
          expect(typeof c.metadata?.case_id, `no case_id on "${c.description}"`).toBe('string');
        }
      });

      test('the agent-sdk provider loads this plugin and enables this skill', () => {
        const providers = (config.providers ?? []).filter(
          (p): p is ProviderEntry => typeof p === 'object' && (p.id ?? '').includes('claude-agent-sdk'),
        );
        expect(providers.length, 'no claude-agent-sdk provider').toBeGreaterThan(0);
        for (const p of providers) {
          const plugins = p.config?.plugins ?? [];
          expect(plugins.length, 'provider loads no plugins').toBeGreaterThan(0);
          for (const plugin of plugins) {
            const abs = resolve(suite.dir, plugin.path ?? '');
            expect(abs, 'plugin path must point at this skill\'s plugin').toBe(join(PLUGINS_ROOT, suite.plugin));
            expect(existsSync(join(abs, '.claude-plugin', 'plugin.json'))).toBe(true);
          }
          const skills = p.config?.skills;
          expect(
            skills === 'all' || (Array.isArray(skills) && skills.includes(`${suite.plugin}:${suite.skill}`)),
            `skills must include ${suite.plugin}:${suite.skill}`,
          ).toBe(true);
        }
      });

      test('defaultTest asserts the skill was actually used', () => {
        const asserts = config.defaultTest?.assert ?? [];
        const skillUsed = asserts.find((a) => a.type === 'skill-used');
        expect(skillUsed, 'no skill-used assertion').toBeDefined();
        expect(JSON.stringify(skillUsed?.value)).toContain(suite.skill);
      });
    });
  }
});
