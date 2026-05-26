import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/**
 * Three-axis integrity tripwire for the jelly-guild substrate.
 *
 * jelly-guild composes specialists from three orthogonal axes —
 * personality (HOW), domain (WHAT), phase (WHEN). The composition is
 * reference-based: a personality subagent reads its named domain +
 * phase mode files at dispatch time. That wiring is only as sound as
 * the references between the files, and nothing in the markdown
 * itself enforces that a referenced mode path resolves, that every
 * domain has a paired rubric, or that a personality's frontmatter is
 * well-formed enough to register as a subagent.
 *
 * This test is the structural gate. It catches the failure class
 * "someone renamed a domain mode and a personality now references a
 * dangling path" or "a rubric lost its paired domain" before it
 * ships — the same flavor of static substrate-shape assertion as
 * commons/cli/marketplace-manifest.test.ts.
 *
 * It does NOT verify runtime dispatch behavior (a personality
 * actually reading the modes under /goal and producing coherent
 * output). That is end-to-end territory for the dogfood phase, not a
 * unit test.
 */

const PLUGIN_DIR = dirname(fileURLToPath(import.meta.url));
const AGENTS_DIR = join(PLUGIN_DIR, 'agents');
const DOMAINS_DIR = join(PLUGIN_DIR, 'modes/domains');
const PHASES_DIR = join(PLUGIN_DIR, 'modes/phases');
const RUBRICS_DIR = join(PLUGIN_DIR, 'rubrics');
const TEMPLATE_PATH = join(PLUGIN_DIR, 'templates/CLAUDE.md');

const PERSONALITIES = ['skeptic', 'methodical', 'generative', 'pragmatist', 'synthesizer'] as const;
const DOMAINS = ['composition', 'naming', 'abstraction', 'testing', 'a11y'] as const;
const PHASES = ['researcher', 'planner', 'implementer', 'reviewer'] as const;

interface Frontmatter {
  readonly fields: Record<string, string>;
  readonly body: string;
}

/**
 * Minimal YAML-frontmatter splitter. The substrate's agent files use
 * a flat `key: value` frontmatter (no nested structures), so a
 * line-by-line split is sufficient — we do not need a full YAML
 * parser, and avoiding one keeps the test dependency-free.
 */
function parseFrontmatter(raw: string): Frontmatter {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { fields: {}, body: raw };
  }
  const [, fmBlock, body] = match;
  const fields: Record<string, string> = {};
  for (const line of fmBlock.split('\n')) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) fields[key] = value;
  }
  return { fields, body };
}

function readAgent(name: string): Frontmatter {
  return parseFrontmatter(readFileSync(join(AGENTS_DIR, `${name}.md`), 'utf8'));
}

describe('jelly-guild: file existence', () => {
  test('personality-base.md exists', () => {
    expect(existsSync(join(AGENTS_DIR, 'personality-base.md'))).toBe(true);
  });

  test.each(PERSONALITIES)('personality %s.md exists', (name) => {
    expect(existsSync(join(AGENTS_DIR, `${name}.md`))).toBe(true);
  });

  test.each(DOMAINS)('domain mode %s.md exists', (name) => {
    expect(existsSync(join(DOMAINS_DIR, `${name}.md`))).toBe(true);
  });

  test.each(PHASES)('phase mode %s.md exists', (name) => {
    expect(existsSync(join(PHASES_DIR, `${name}.md`))).toBe(true);
  });

  test('CLAUDE.md template exists', () => {
    expect(existsSync(TEMPLATE_PATH)).toBe(true);
  });
});

describe('jelly-guild: personality frontmatter', () => {
  test('personality-base is role personality-base and read-only', () => {
    const { fields } = readAgent('personality-base');
    expect(fields.role).toBe('personality-base');
    expect(fields.tools).toBe('Read, Glob, Grep');
  });

  test.each(PERSONALITIES)('%s declares role + tool superset + model', (name) => {
    const { fields } = readAgent(name);
    expect(fields.name).toBe(name);
    expect(fields.role).toBe('personality');
    expect(fields.model).toBe('inherit');
    // The U3 tool-superset model: personalities declare Read (to load
    // mode files) plus the write tools the implementer phase needs.
    // The phase mode governs which are actually used at dispatch.
    for (const tool of ['Read', 'Glob', 'Grep', 'Bash', 'Write', 'Edit']) {
      expect(fields.tools).toContain(tool);
    }
  });

  test.each(PERSONALITIES)('%s declares the mcp__jelly__* substrate tools', (name) => {
    // The mcp__jelly__* server shipped in jelly-loom (Phase 1.3 U7),
    // so the personalities now declare the wildcard (deferred from
    // Phase 1.2 U4 until the server made the tools real). The wildcard
    // grants every mcp__jelly__<verb> tool the server exposes.
    const { fields } = readAgent(name);
    expect(fields.tools).toContain('mcp__jelly__*');
  });
});

describe('jelly-guild: composition mechanism wiring', () => {
  test.each(PERSONALITIES)('%s body references personality-base.md', (name) => {
    const { body } = readAgent(name);
    expect(body).toContain('personality-base.md');
  });

  test('personality-base references the domain + phase mode directories', () => {
    const { body } = readAgent('personality-base');
    expect(body).toContain('modes/domains/');
    expect(body).toContain('modes/phases/');
  });
});

describe('jelly-guild: domain ↔ rubric pairing', () => {
  test('every domain mode has a paired rubric and vice versa (no orphans)', () => {
    const domainFiles = readdirSync(DOMAINS_DIR)
      .filter((f: string) => f.endsWith('.md'))
      .sort();
    const rubricFiles = readdirSync(RUBRICS_DIR)
      .filter((f: string) => f.endsWith('.md'))
      .sort();
    // Same set of basenames on both sides — a rubric without a domain
    // mode (or a domain mode without a rubric) is a wiring gap.
    expect(rubricFiles).toEqual(domainFiles);
  });

  test.each(DOMAINS)('domain %s has both a mode and a rubric', (name) => {
    expect(existsSync(join(DOMAINS_DIR, `${name}.md`))).toBe(true);
    expect(existsSync(join(RUBRICS_DIR, `${name}.md`))).toBe(true);
  });
});

describe('jelly-guild: CLAUDE.md template', () => {
  const template = (): string => readFileSync(TEMPLATE_PATH, 'utf8');

  test('documents the @-import propagation mechanism', () => {
    // Phase 1.1 confirmed subdir CLAUDE.md does NOT auto-discover;
    // it must be @-imported from the repo-root CLAUDE.md. The
    // template must say so, or a future reader will assume
    // auto-discovery and the posture will silently fail to propagate.
    expect(template()).toContain('@projects/');
  });

  test('carries placeholder slots for jelly plan to fill', () => {
    expect(template()).toContain('{{PROJECT_SLUG}}');
    expect(template()).toContain('{{PROJECT_TITLE}}');
  });

  test('names the three axes and the registered personalities', () => {
    const t = template();
    for (const personality of PERSONALITIES) {
      expect(t).toContain(personality);
    }
  });
});
