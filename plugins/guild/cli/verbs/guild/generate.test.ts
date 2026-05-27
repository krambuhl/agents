import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseToml } from '../../lib/toml.ts';
import {
  composeBody,
  generateVerb,
  nameFor,
  planAgents,
  resolveTools,
  stripFrontmatter,
} from './generate.ts';
import type { GuildCliContext } from './index.ts';

// plugins/guild (this file: plugins/guild/cli/verbs/guild/generate.test.ts)
const REAL_SOURCE = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
);

const toolsMap = parseToml(
  readFileSync(join(REAL_SOURCE, 'tools-map.toml'), 'utf8'),
);
const manifest = parseToml(
  readFileSync(join(REAL_SOURCE, 'panel.manifest.toml'), 'utf8'),
);

const ctx: GuildCliContext = { cwd: REAL_SOURCE, stdin: '' };

function toolsLine(content: string): string[] {
  const m = content.match(/^tools:\s*(.+)$/m);
  if (!m) throw new Error('no tools: line in agent file');
  return m[1].split(',').map((t) => t.trim());
}

const sorted = (xs: string[]): string[] => [...xs].sort();

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'guild-generate-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('resolveTools — the fold', () => {
  it('phase-base-only when the domain has no grants row (naming@reviewer)', () => {
    expect(resolveTools('reviewer', 'naming', toolsMap)).toEqual([
      'Read',
      'Glob',
      'Grep',
    ]);
  });

  it('appends domain grants at a reviewer combination (a11y@reviewer)', () => {
    const tools = resolveTools('reviewer', 'a11y', toolsMap);
    expect(tools.slice(0, 3)).toEqual(['Read', 'Glob', 'Grep']);
    expect(tools).toContain('Bash(npm run test:a11y:*)');
  });

  it('a reviewer agent carries no write capability (the writes=false floor)', () => {
    const tools = resolveTools('reviewer', 'a11y', toolsMap);
    expect(tools).not.toContain('Write');
    expect(tools).not.toContain('Edit');
  });

  it('fails loud when the phase has no tools-map row (no permissive empty)', () => {
    expect(() => resolveTools('ghost', 'a11y', toolsMap)).toThrow(/phase.ghost/);
  });
});

describe('nameFor — clean <prefix>-<domain>', () => {
  it('reviewer -> evaluator-<domain>', () => {
    expect(nameFor('reviewer', 'a11y')).toBe('evaluator-a11y');
  });
  it('planner -> whiteboard-<domain>', () => {
    expect(nameFor('planner', 'react')).toBe('whiteboard-react');
  });
  it('throws for a phase with no prefix', () => {
    expect(() => nameFor('researcher', 'a11y')).toThrow();
  });
});

describe('stripFrontmatter + composeBody', () => {
  it('strips a leading YAML frontmatter block', () => {
    expect(stripFrontmatter('---\nname: x\n---\n# Body\nhi')).toBe('# Body\nhi');
  });
  it('leaves a frontmatter-less fragment intact', () => {
    expect(stripFrontmatter('# Domain: a11y\nbody')).toBe('# Domain: a11y\nbody');
  });
  it('inlines bodies in order, frontmatter-stripped', () => {
    const body = composeBody(['---\nk: v\n---\n# Base', '# Phase', '# Domain']);
    expect(body).toBe('# Base\n\n# Phase\n\n# Domain\n');
  });
});

describe('generateVerb — against the real source', () => {
  function generateInto(out: string) {
    return generateVerb([`--source-dir=${REAL_SOURCE}`, `--out=${out}`], ctx);
  }

  it('emits one file per fanned combination domain', () => {
    const res = generateInto(tmp);
    expect(res.exitCode).toBe(0);
    const payload = JSON.parse(res.stdout ?? '{}') as {
      emitted: string[];
      count: number;
    };
    // 8 reviewer domains + (performance, substrate, react, test-unit,
    // test-integration, a11y) = 6 planner domains = 14 agents.
    const expectedPlanCount = planAgents(manifest, toolsMap).length;
    expect(payload.count).toBe(expectedPlanCount);
    expect(payload.emitted).toContain('evaluator-a11y.md');
    expect(payload.emitted).toContain('whiteboard-react.md');
    expect(readdirSync(tmp).sort()).toEqual([...payload.emitted].sort());
  });

  it('reproduces the baked evaluator-a11y tools line exactly (name+tools equivalence)', () => {
    generateInto(tmp);
    const generated = toolsLine(readFileSync(join(tmp, 'evaluator-a11y.md'), 'utf8'));
    const baked = toolsLine(
      readFileSync(join(REAL_SOURCE, 'agents', 'evaluator-a11y.md'), 'utf8'),
    );
    expect(sorted(generated)).toEqual(sorted(baked));
    // and the fold recomputed independently agrees with both
    expect(sorted(generated)).toEqual(sorted(resolveTools('reviewer', 'a11y', toolsMap)));
  });

  it('synthesizes phase-determined frontmatter (maxTurns reviewer-only)', () => {
    generateInto(tmp);
    const reviewer = readFileSync(join(tmp, 'evaluator-a11y.md'), 'utf8');
    expect(reviewer).toMatch(/^model: inherit$/m);
    expect(reviewer).toMatch(/^maxTurns: 5$/m);
    expect(reviewer).toMatch(/^role: evaluator$/m);

    const planner = readFileSync(join(tmp, 'whiteboard-react.md'), 'utf8');
    expect(planner).toMatch(/^model: inherit$/m);
    expect(planner).not.toMatch(/^maxTurns:/m);
    expect(planner).toMatch(/^role: whiteboard-engineer$/m);
  });

  it('inlines fragment bodies reference-free (no dispatch-time read)', () => {
    generateInto(tmp);
    const body = readFileSync(join(tmp, 'evaluator-a11y.md'), 'utf8');
    // positive sentinels: the base contract and the phase output contract
    // are present inline (so the inlining cannot pass vacuously).
    expect(body).toContain('three-axis');
    expect(body).toContain('VERDICT: approved');
    // negative: the baked agent's dispatch-time "read evaluator-base.md"
    // instruction must not survive into the generated, inlined agent.
    expect(body).not.toContain('evaluator-base.md');
  });

  it('is deterministic — two runs produce byte-identical trees', () => {
    const a = mkdtempSync(join(tmpdir(), 'guild-generate-a-'));
    const b = mkdtempSync(join(tmpdir(), 'guild-generate-b-'));
    try {
      generateInto(a);
      generateInto(b);
      const filesA = readdirSync(a).sort();
      const filesB = readdirSync(b).sort();
      expect(filesA).toEqual(filesB);
      for (const f of filesA) {
        expect(readFileSync(join(b, f), 'utf8')).toBe(
          readFileSync(join(a, f), 'utf8'),
        );
      }
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it('fails loud (exit 1) when a combination names a phase absent from tools-map', () => {
    const src = mkdtempSync(join(tmpdir(), 'guild-generate-badsrc-'));
    try {
      writeFileSync(
        join(src, 'panel.manifest.toml'),
        '[[combinations]]\nphase = "reviewer"\npersonality = "skeptic"\ndomains = ["a11y"]\n',
      );
      // tools-map declares planner but NOT reviewer -> fail loud.
      writeFileSync(
        join(src, 'tools-map.toml'),
        '[phase.planner]\nbase = ["Read", "Glob", "Grep"]\nwrites = false\n',
      );
      const res = generateVerb([`--source-dir=${src}`, `--out=${tmp}`], ctx);
      expect(res.exitCode).toBe(1);
      expect(res.stderr).toContain('guild-generate-error');
      expect(res.stderr).toContain('phase.reviewer');
    } finally {
      rmSync(src, { recursive: true, force: true });
    }
  });
});
