import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  derivePanel,
  derivePanelVerb,
  globToRegex,
  loadSpec,
  matchPath,
  parsePrecedence,
  parseRules,
  type Spec,
} from './derive-panel.ts';
import type { GuildCliContext } from './index.ts';

function loadRealSpec(): Spec {
  return loadSpec(process.cwd()).spec;
}

function run(args: string[], stdin?: string) {
  const ctx: GuildCliContext = { cwd: process.cwd(), stdin: stdin ?? '' };
  return derivePanelVerb(args, ctx);
}

// ---- React-gating: *.ts gets react only when it imports react (D1) ----

describe('derivePanel react-gating (Phase 3 D1)', () => {
  const spec = loadRealSpec();
  // Inject a reader stub mapping paths → contents; any path not in the map
  // is "unreadable" (undefined), exercising the conservative-keep path.
  const reader =
    (contents: Record<string, string>) =>
    (p: string): string | undefined =>
      contents[p];

  test('non-JSX .ts that imports react → react KEPT', () => {
    const r = reader({ 'src/useThing.ts': "import { useState } from 'react';" });
    expect(derivePanel(['src/useThing.ts'], spec, r)).toContain('evaluator-react');
  });

  test('non-JSX .ts that does NOT import react → react DROPPED (naming stays)', () => {
    const r = reader({
      'src/math.ts': 'export const add = (a: number, b: number) => a + b;',
    });
    const panel = derivePanel(['src/math.ts'], spec, r);
    expect(panel).not.toContain('evaluator-react');
    expect(panel).toContain('evaluator-naming');
    expect(panel).toContain('evaluator-contract-fit');
  });

  test('.ts importing a sibling package (react-router) → react DROPPED', () => {
    const r = reader({ 'src/routes.ts': "import { Router } from 'react-router';" });
    expect(derivePanel(['src/routes.ts'], spec, r)).not.toContain('evaluator-react');
  });

  test('.tsx keeps react unconditionally even with no react import', () => {
    const r = reader({ 'src/Page.tsx': 'export const Page = () => null;' });
    expect(derivePanel(['src/Page.tsx'], spec, r)).toContain('evaluator-react');
  });

  test('unreadable .ts → react KEPT (never strip a lens we cannot disprove)', () => {
    expect(derivePanel(['src/mystery.ts'], spec, reader({}))).toContain(
      'evaluator-react',
    );
  });

  test('react-dom (and a react subpath) counts as a react import', () => {
    const r = reader({ 'src/root.ts': "import { createRoot } from 'react-dom/client';" });
    expect(derivePanel(['src/root.ts'], spec, r)).toContain('evaluator-react');
  });

  test('require() and dynamic import() of react both count', () => {
    expect(
      derivePanel(['a.ts'], spec, reader({ 'a.ts': "const React = require('react');" })),
    ).toContain('evaluator-react');
    expect(
      derivePanel(['b.ts'], spec, reader({ 'b.ts': "const m = await import('react');" })),
    ).toContain('evaluator-react');
  });

  test('the gate is per-file: a react .ts and a non-react .ts in one call both resolve correctly', () => {
    // Proves the gate filters each file independently rather than all-or-
    // nothing: the union still contains react (from the react file) AND
    // naming (from both), and react is not stripped just because a sibling
    // file lacked the import.
    const r = reader({
      'src/hook.ts': "import { useEffect } from 'react';",
      'src/pure.ts': 'export const id = <T>(x: T): T => x;',
    });
    const panel = derivePanel(['src/hook.ts', 'src/pure.ts'], spec, r);
    expect(panel).toContain('evaluator-react');
    expect(panel).toContain('evaluator-naming');
  });
});

// ---- Pure-function unit tests on the parsed spec ----

describe('derivePanel (live spec)', () => {
  const spec = loadRealSpec();

  test('empty file list → contract-fit only', () => {
    expect(derivePanel([], spec)).toEqual(['evaluator-contract-fit']);
  });

  test('single .tsx → contract-fit + a11y + nextjs + react + naming', () => {
    expect(derivePanel(['components/Foo.tsx'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-a11y',
      'evaluator-nextjs',
      'evaluator-react',
      'evaluator-naming',
    ]);
  });

  test('single .jsx → same panel as .tsx', () => {
    expect(derivePanel(['legacy/Foo.jsx'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-a11y',
      'evaluator-nextjs',
      'evaluator-react',
      'evaluator-naming',
    ]);
  });

  test('single .module.css → contract-fit + tokens + naming', () => {
    expect(derivePanel(['components/Foo.module.css'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-tokens',
      'evaluator-naming',
    ]);
  });

  test('single .css (non-module) → contract-fit + tokens', () => {
    expect(derivePanel(['styles/globals.css'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-tokens',
    ]);
  });

  test('single .ts (non-JSX) → contract-fit + react + naming', () => {
    expect(derivePanel(['lib/util.ts'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-react',
      'evaluator-naming',
    ]);
  });

  test('single .md (prose) → contract-fit only', () => {
    expect(derivePanel(['README.md'], spec)).toEqual(['evaluator-contract-fit']);
  });

  test('single .json → contract-fit only', () => {
    expect(derivePanel(['package.json'], spec)).toEqual(['evaluator-contract-fit']);
  });

  test('substrate doc (.claude/agents/*.md) → contract-fit only', () => {
    expect(derivePanel(['.claude/agents/evaluator-foo.md'], spec)).toEqual([
      'evaluator-contract-fit',
    ]);
  });

  test('substrate skill (.claude/skills/foo/SKILL.md) → contract-fit only', () => {
    expect(derivePanel(['.claude/skills/foo/SKILL.md'], spec)).toEqual([
      'evaluator-contract-fit',
    ]);
  });

  test('checkin file under projects/ → contract-fit only', () => {
    expect(
      derivePanel(['projects/2026-05-02-agent-guilds/checkins/ev.foo/01.md'], spec),
    ).toEqual(['evaluator-contract-fit']);
  });

  test('substrate CLI (plugins/loom/cli/verbs/loom/doctor.ts) → contract-fit + naming, NOT react', () => {
    expect(derivePanel(['plugins/loom/cli/verbs/loom/doctor.ts'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-naming',
    ]);
  });

  test('substrate CLI top-level entrypoint (plugins/loom/cli/loom.ts, directly in cli/) → contract-fit + naming', () => {
    // The `**/` zero-segment case: a file directly under cli/ (a bin
    // entrypoint), no intervening directory. Must still resolve as substrate.
    expect(derivePanel(['plugins/loom/cli/loom.ts'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-naming',
    ]);
  });

  test('repo-root script directly under scripts/ (scripts/sync-shared.ts) → contract-fit + naming', () => {
    // The other `**/` zero-segment case: a file directly under scripts/.
    expect(derivePanel(['scripts/sync-shared.ts'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-naming',
    ]);
  });

  test('plugin-local script (plugins/guild/scripts/convert-to-axes.ts) → contract-fit + naming', () => {
    expect(derivePanel(['plugins/guild/scripts/convert-to-axes.ts'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-naming',
    ]);
  });

  test('substrate CLI test (plugins/loom/cli/verbs/loom/doctor.test.ts) → contract-fit + test-unit', () => {
    expect(derivePanel(['plugins/loom/cli/verbs/loom/doctor.test.ts'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-test-unit',
    ]);
  });

  test('substrate CLI test (.claude/cli/foo/bar.test.ts) → contract-fit + test-unit', () => {
    expect(derivePanel(['.claude/cli/foo/bar.test.ts'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-test-unit',
    ]);
  });

  test('general unit test (scripts/check-nextjs.test.ts) → contract-fit + test-unit', () => {
    expect(derivePanel(['scripts/check-nextjs.test.ts'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-test-unit',
    ]);
  });

  test('general spec file (utilities/foo.spec.ts) → contract-fit + test-unit', () => {
    expect(derivePanel(['utilities/foo.spec.ts'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-test-unit',
    ]);
  });

  test('integration spec (tests/e2e/index.spec.ts) → contract-fit + test-integration', () => {
    expect(derivePanel(['tests/e2e/index.spec.ts'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-test-integration',
    ]);
  });

  test('a11y e2e spec (tests/e2e/a11y/home.spec.ts) → contract-fit + a11y (overrides test-integration)', () => {
    expect(derivePanel(['tests/e2e/a11y/home.spec.ts'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-a11y',
    ]);
  });

  test('multi-file union (.tsx + .module.css) → all five domain lenses + contract-fit', () => {
    expect(
      derivePanel(['components/Foo.tsx', 'components/Foo.module.css'], spec),
    ).toEqual([
      'evaluator-contract-fit',
      'evaluator-a11y',
      'evaluator-nextjs',
      'evaluator-react',
      'evaluator-tokens',
      'evaluator-naming',
    ]);
  });

  test('sketch file (sketches/53-foo.tsx) → same as plain .tsx', () => {
    expect(derivePanel(['sketches/53-foo.tsx'], spec)).toEqual([
      'evaluator-contract-fit',
      'evaluator-a11y',
      'evaluator-nextjs',
      'evaluator-react',
      'evaluator-naming',
    ]);
  });

  test('duplicates deduped across multiple .tsx files', () => {
    expect(
      derivePanel(
        ['app/page.tsx', 'app/about/page.tsx', 'components/Foo.tsx'],
        spec,
      ),
    ).toEqual([
      'evaluator-contract-fit',
      'evaluator-a11y',
      'evaluator-nextjs',
      'evaluator-react',
      'evaluator-naming',
    ]);
  });
});

// ---- globToRegex ----

describe('globToRegex', () => {
  test('*.tsx matches plain and nested .tsx files', () => {
    const re = globToRegex('*.tsx');
    expect(re.test('Foo.tsx')).toBe(true);
    expect(re.test('Foo.ts')).toBe(false);
  });

  test('** matches any path segments', () => {
    const re = globToRegex('.claude/scripts/**/*.ts');
    expect(re.test('.claude/scripts/guild/derive-panel.ts')).toBe(true);
    expect(re.test('.claude/scripts/griot/capture.ts')).toBe(true);
    expect(re.test('app/foo/bar.ts')).toBe(false);
  });

  test('* does not cross directory boundaries', () => {
    const re = globToRegex('.claude/agents/*.md');
    expect(re.test('.claude/agents/foo.md')).toBe(true);
    expect(re.test('.claude/agents/sub/foo.md')).toBe(false);
  });

  test('escapes regex metacharacters', () => {
    const re = globToRegex('package.json');
    expect(re.test('package.json')).toBe(true);
    expect(re.test('packageXjson')).toBe(false);
  });
});

// ---- Verb tests ----

describe('derivePanelVerb', () => {
  test('--files= with single .tsx', () => {
    const res = run(['--files=components/Foo.tsx']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe(
      'evaluator-contract-fit,evaluator-a11y,evaluator-nextjs,evaluator-react,evaluator-naming',
    );
  });

  test('--files= with comma-separated multi-file union', () => {
    const res = run(['--files=Foo.tsx,Foo.module.css']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe(
      'evaluator-contract-fit,evaluator-a11y,evaluator-nextjs,evaluator-react,evaluator-tokens,evaluator-naming',
    );
  });

  test('stdin variant (newline-delimited paths)', () => {
    const res = run([], 'components/Foo.tsx\ncomponents/Foo.module.css\n');
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe(
      'evaluator-contract-fit,evaluator-a11y,evaluator-nextjs,evaluator-react,evaluator-tokens,evaluator-naming',
    );
  });

  test('stdin variant with empty input → baseline only', () => {
    const res = run([], '');
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe('evaluator-contract-fit');
  });

  test('--files= with no files → baseline only', () => {
    const res = run(['--files=']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe('evaluator-contract-fit');
  });
});

// ---- Phase-parameterized composition (--phase) ----

describe('derivePanelVerb --phase=reviewer (backward-compat regression lock)', () => {
  test('--phase=reviewer is byte-for-byte identical to the bare invocation', () => {
    const explicit = run(['--phase=reviewer', '--files=Foo.tsx,Foo.module.css']);
    const bare = run(['--files=Foo.tsx,Foo.module.css']);
    expect(explicit.stdout).toBe(bare.stdout);
    expect(explicit.exitCode).toBe(bare.exitCode);
  });

  test('no --phase defaults to reviewer → evaluator-* file-driven output', () => {
    const res = run(['--files=components/Foo.tsx']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe(
      'evaluator-contract-fit,evaluator-a11y,evaluator-nextjs,evaluator-react,evaluator-naming',
    );
  });

  test('--phase=reviewer with empty files → baseline only (unchanged)', () => {
    const res = run(['--phase=reviewer', '--files=']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe('evaluator-contract-fit');
  });

  test('positional arg still baselines under default reviewer (documented quirk preserved)', () => {
    const res = run(['Foo.tsx']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe('evaluator-contract-fit');
  });
});

describe('derivePanelVerb --phase (roster-driven phases from axes.toml)', () => {
  test('--phase=research emits the 10 research-* domains, sorted', () => {
    const res = run(['--phase=research']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe(
      'research-a11y,research-abstraction,research-composition,research-naming,research-performance,research-react,research-substrate,research-test-integration,research-test-unit,research-tokens',
    );
  });

  test('--phase=plan emits the 10 plan-* domains', () => {
    const res = run(['--phase=plan']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe(
      'plan-a11y,plan-abstraction,plan-composition,plan-naming,plan-performance,plan-react,plan-substrate,plan-test-integration,plan-test-unit,plan-tokens',
    );
  });

  test('--phase=implementer emits the 8 implementer-* domains', () => {
    const res = run(['--phase=implementer']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe(
      'implementer-a11y,implementer-css-architecture,implementer-naming,implementer-nextjs,implementer-react,implementer-test-integration,implementer-test-unit,implementer-tokens',
    );
  });

  test('--phase=fixer emits the 8 fixer-* domains', () => {
    const res = run(['--phase=fixer']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toBe(
      'fixer-a11y,fixer-css-architecture,fixer-naming,fixer-nextjs,fixer-react,fixer-test-integration,fixer-test-unit,fixer-tokens',
    );
  });

  test('roster phases ignore --files= (file-independent participation)', () => {
    const withFiles = run(['--phase=research', '--files=components/Foo.tsx']);
    const without = run(['--phase=research']);
    expect(withFiles.stdout).toBe(without.stdout);
  });

  test('unknown phase → structured error, non-zero exit', () => {
    const res = run(['--phase=bogus']);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/^derive-panel-error: unknown phase 'bogus'/);
  });
});

// ---- Defensive fallback ----

describe('loadSpec fallback', () => {
  test('returns valid spec from synthetic repo missing the file', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'derive-panel-fallback-'));
    try {
      const { spec, warning } = loadSpec(tmp);
      expect(spec.rules.length).toBeGreaterThan(0);
      expect(spec.precedence.length).toBe(9);
      expect(spec.precedence[0]).toBe('evaluator-contract-fit');
      expect(warning).toMatch(/panel-spec-unreadable/);
      expect(derivePanel(['components/Foo.tsx'], spec)).toEqual([
        'evaluator-contract-fit',
        'evaluator-a11y',
        'evaluator-nextjs',
        'evaluator-react',
        'evaluator-naming',
      ]);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('returns valid spec when the file is present but unparseable', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'derive-panel-bad-spec-'));
    try {
      mkdirSync(join(tmp, 'docs'), { recursive: true });
      writeFileSync(
        join(tmp, 'docs', 'PANEL-COMPOSITION.md'),
        '# nothing useful\n\nno sections.\n',
      );
      const { spec, warning } = loadSpec(tmp);
      expect(spec.rules.length).toBeGreaterThan(0);
      expect(warning).toMatch(/mapping-section-missing/);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('verb surfaces fallback warning on stderr without affecting exit code', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'derive-panel-verb-fallback-'));
    try {
      const ctx: GuildCliContext = { cwd: tmp, stdin: '' };
      const res = derivePanelVerb(['--files=Foo.tsx'], ctx);
      expect(res.exitCode).toBe(0);
      expect(res.stderr).toMatch(/derive-panel-error: panel-spec-unreadable/);
      expect(res.stdout).toContain('evaluator-contract-fit');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ---- Spec parsing matches verb output ----

describe('spec parsing', () => {
  test('parseRules + parsePrecedence on live spec parse non-empty', () => {
    const spec = loadRealSpec();
    expect(spec.rules.length).toBeGreaterThanOrEqual(6);
    expect(spec.precedence).toEqual([
      'evaluator-contract-fit',
      'evaluator-a11y',
      'evaluator-nextjs',
      'evaluator-css-architecture',
      'evaluator-react',
      'evaluator-test-integration',
      'evaluator-test-unit',
      'evaluator-tokens',
      'evaluator-naming',
    ]);
  });

  test('matchPath uses most-specific-wins (substrate CLI over generic .ts)', () => {
    const spec = loadRealSpec();
    const matched = matchPath('plugins/loom/cli/verbs/loom/doctor.ts', spec.rules);
    expect(matched).not.toContain('evaluator-react');
    expect(matched).toContain('evaluator-naming');
  });

  test('globToRegex: **/ matches zero path segments (file directly in the base dir)', () => {
    // Regression guard for the bin-entrypoint gap: `a/**/*.ts` must match
    // both `a/f.ts` (zero segments) and `a/b/f.ts` (one+ segments).
    const re = globToRegex('plugins/**/cli/**/*.ts');
    expect(re.test('plugins/loom/cli/loom.ts')).toBe(true); // zero segments after cli/
    expect(re.test('plugins/loom/cli/verbs/loom/doctor.ts')).toBe(true); // nested
    expect(globToRegex('scripts/**/*.ts').test('scripts/sync-shared.ts')).toBe(true);
  });

  test('parseRules is callable directly on a synthetic spec', () => {
    const synthetic = [
      '# Panel composition',
      '',
      '## File-type → evaluator mapping',
      '',
      '| File pattern | Evaluators added |',
      '|--------------|------------------|',
      '| `*.ts` | `evaluator-naming` |',
      '',
      '## Precedence',
      '',
      '1. **`evaluator-contract-fit`** — baseline',
      '2. **`evaluator-naming`** — readability',
    ].join('\n');
    expect(parseRules(synthetic)).toHaveLength(1);
    expect(parsePrecedence(synthetic)).toEqual([
      'evaluator-contract-fit',
      'evaluator-naming',
    ]);
  });
});
