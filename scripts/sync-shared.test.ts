import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
  applySync,
  detectDrift,
  planForPlugin,
  DOC_CONSUMERS,
  PLUGINS,
} from './sync-shared.ts';

/**
 * sync-shared — single-flow docs sync.
 *
 * The repo-root `docs/` tree is the canonical source for the cross-cutting
 * convention docs. The script mirrors it into each DOC_CONSUMERS plugin's
 * `plugins/<consumer>/docs/`. These tests exercise the plan/apply/drift
 * logic against synthetic fixture trees in a temp dir.
 */

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'sync-shared-test-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function write(path: string, body: string): void {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, body, 'utf8');
}

function read(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

/** Populate the canonical repo-root docs/ source. */
function buildDocsFixture(): void {
  write('docs/AGENT-CONVENTIONS.md', '# Agent conventions fixture\n');
  write('docs/PANEL-COMPOSITION.md', '# Panel composition fixture\n');
}

describe('planForPlugin: only DOC_CONSUMERS receive docs specs', () => {
  test('ev and loom mirror every root doc into their own docs/ tree', () => {
    buildDocsFixture();
    for (const plugin of DOC_CONSUMERS) {
      const plan = planForPlugin(plugin, root);
      const sources = plan.files.map((f) => f.source).sort();
      expect(sources).toEqual(
        ['docs/AGENT-CONVENTIONS.md', 'docs/PANEL-COMPOSITION.md'].sort(),
      );
      for (const { destination } of plan.files) {
        expect(destination.startsWith(`plugins/${plugin}/docs/`)).toBe(true);
      }
    }
  });

  test('non-consumer plugins (commons, griot, guild, agent-loop-full) plan zero files', () => {
    buildDocsFixture();
    for (const plugin of PLUGINS) {
      if (DOC_CONSUMERS.includes(plugin)) continue;
      expect(planForPlugin(plugin, root).files).toEqual([]);
    }
  });

  test('with no docs/ source, every plan is empty (no-op invariant)', () => {
    // No buildDocsFixture() — the source dir does not exist.
    for (const plugin of PLUGINS) {
      expect(planForPlugin(plugin, root).files).toEqual([]);
    }
  });

  test('plan excludes test files and fixtures from the docs source', () => {
    buildDocsFixture();
    write('docs/notes.test.ts', 'test stub');
    write('docs/fixtures/example.md', '# fixture\n');
    const sources = planForPlugin('loom', root).files.map((f) => f.source);
    expect(sources).not.toContain('docs/notes.test.ts');
    expect(sources.some((s) => s.includes('/fixtures/'))).toBe(false);
  });
});

describe('applySync: end-to-end byte-for-byte mirror', () => {
  test('each consumer doc byte-equals its repo-root source', () => {
    buildDocsFixture();
    applySync(root);
    expect(read('plugins/ev/docs/AGENT-CONVENTIONS.md')).toBe(
      read('docs/AGENT-CONVENTIONS.md'),
    );
    expect(read('plugins/loom/docs/PANEL-COMPOSITION.md')).toBe(
      read('docs/PANEL-COMPOSITION.md'),
    );
  });

  test('post-sync drift-check reports no drift on a clean tree', () => {
    buildDocsFixture();
    applySync(root);
    expect(detectDrift(root)).toEqual([]);
  });

  test('non-consumer plugins receive no docs tree', () => {
    buildDocsFixture();
    applySync(root);
    expect(() => read('plugins/griot/docs/AGENT-CONVENTIONS.md')).toThrow();
    expect(() => read('plugins/guild/docs/AGENT-CONVENTIONS.md')).toThrow();
  });
});

describe('detectDrift: missing / divergent / orphan', () => {
  test('a missing consumer copy is reported with its source', () => {
    buildDocsFixture();
    applySync(root);
    rmSync(join(root, 'plugins/loom/docs/AGENT-CONVENTIONS.md'));

    const missing = detectDrift(root).find(
      (d) => d.destination === 'plugins/loom/docs/AGENT-CONVENTIONS.md',
    );
    expect(missing?.kind).toBe('missing');
    expect(missing?.source).toBe('docs/AGENT-CONVENTIONS.md');
    expect(missing?.message).toMatch(/sync-shared\.ts/);
  });

  test('a mutated consumer copy is reported as divergent', () => {
    buildDocsFixture();
    applySync(root);
    writeFileSync(
      join(root, 'plugins/ev/docs/AGENT-CONVENTIONS.md'),
      '# tampered\n',
      'utf8',
    );

    const record = detectDrift(root).find(
      (d) => d.destination === 'plugins/ev/docs/AGENT-CONVENTIONS.md',
    );
    expect(record?.kind).toBe('divergent');
    // The remedy names source, destination, and the resync command.
    expect(record?.message).toContain('plugins/ev/docs/AGENT-CONVENTIONS.md');
    expect(record?.message).toContain('docs/AGENT-CONVENTIONS.md');
    expect(record?.message).toMatch(/sync-shared\.ts/);
  });

  test('an unmarked orphan in a consumer docs/ tree is reported', () => {
    buildDocsFixture();
    applySync(root);
    write('plugins/loom/docs/orphan.md', '# stray\n');

    const orphan = detectDrift(root).find(
      (d) => d.destination === 'plugins/loom/docs/orphan.md',
    );
    expect(orphan?.kind).toBe('orphan');
    expect(orphan?.source).toBeNull();
    // The remedy names BOTH options: mark it, or --strict-orphan.
    expect(orphan?.message).toContain('<!-- sync-shared: plugin-local -->');
    expect(orphan?.message).toContain('--strict-orphan');
  });
});

describe('ADR-0005: plugin-local marker preservation', () => {
  test('a MARKED doc in a NON-consumer plugin is not drift (guild AGENT-CODEGEN.md case)', () => {
    buildDocsFixture();
    applySync(root);
    write(
      'plugins/guild/docs/AGENT-CODEGEN.md',
      '<!-- sync-shared: plugin-local -->\n# Guild-local doc\n',
    );

    const record = detectDrift(root).find(
      (d) => d.destination === 'plugins/guild/docs/AGENT-CODEGEN.md',
    );
    expect(record).toBeUndefined();
  });

  test('default sync preserves orphans (deletes nothing)', () => {
    buildDocsFixture();
    applySync(root);
    write('plugins/loom/docs/orphan.md', '# stray\n');

    const result = applySync(root);
    expect(result.removed).toBe(0);
    expect(result.preserved).toBeGreaterThanOrEqual(1);
    expect(read('plugins/loom/docs/orphan.md')).toContain('stray');
  });

  test('--strict-orphan removes an UNMARKED orphan', () => {
    buildDocsFixture();
    applySync(root);
    write('plugins/loom/docs/orphan.md', '# stray\n');

    const result = applySync(root, { strictOrphan: true });
    expect(result.removed).toBe(1);
    expect(() => read('plugins/loom/docs/orphan.md')).toThrow();
  });

  test('--strict-orphan PRESERVES a MARKED plugin-local doc', () => {
    buildDocsFixture();
    applySync(root);
    write(
      'plugins/guild/docs/AGENT-CODEGEN.md',
      '<!-- sync-shared: plugin-local -->\n# Guild-local doc\n',
    );

    const result = applySync(root, { strictOrphan: true });
    expect(result.removed).toBe(0);
    expect(read('plugins/guild/docs/AGENT-CODEGEN.md')).toContain('Guild-local doc');
  });

  test('a marker BEYOND the head-scan window does not count (removed under strict)', () => {
    buildDocsFixture();
    applySync(root);
    const padding = Array.from({ length: 25 }, (_, i) => `line ${i}`).join('\n');
    write(
      'plugins/loom/docs/late-marker.md',
      `${padding}\n<!-- sync-shared: plugin-local -->\n# late\n`,
    );

    const result = applySync(root, { strictOrphan: true });
    expect(result.removed).toBe(1);
    expect(() => read('plugins/loom/docs/late-marker.md')).toThrow();
  });
});

describe('--only scopes the sync (copy-only, never deletes)', () => {
  test('--only syncs the matching source; other docs untouched', () => {
    buildDocsFixture();
    applySync(root, { only: 'docs/PANEL-COMPOSITION.md' });
    expect(read('plugins/ev/docs/PANEL-COMPOSITION.md')).toBe(
      read('docs/PANEL-COMPOSITION.md'),
    );
    expect(() => read('plugins/ev/docs/AGENT-CONVENTIONS.md')).toThrow();
  });

  test('--only with a single-star basename glob stays within a segment', () => {
    buildDocsFixture();
    applySync(root, { only: 'docs/*.md' });
    expect(read('plugins/loom/docs/PANEL-COMPOSITION.md')).toBe(
      read('docs/PANEL-COMPOSITION.md'),
    );
    expect(read('plugins/loom/docs/AGENT-CONVENTIONS.md')).toBe(
      read('docs/AGENT-CONVENTIONS.md'),
    );
  });

  test('a scoped run never deletes orphans even with strictOrphan; a full run still does', () => {
    buildDocsFixture();
    applySync(root); // full sync populates consumer trees
    write('plugins/loom/docs/orphan.md', '# stray\n');
    // Scoped + strictOrphan: copy-only, the orphan survives (overreach guard).
    applySync(root, { only: 'docs/AGENT-CONVENTIONS.md', strictOrphan: true });
    expect(read('plugins/loom/docs/orphan.md')).toContain('stray');
    // Contrast: a FULL strictOrphan run sweeps the unmarked orphan.
    applySync(root, { strictOrphan: true });
    expect(() => read('plugins/loom/docs/orphan.md')).toThrow();
  });
});

describe('substrate invariants', () => {
  test('DOC_CONSUMERS excludes commons (it is skills-only, never a sink)', () => {
    expect(DOC_CONSUMERS).not.toContain('commons');
  });

  test('commons plans nothing and is never a sync destination', () => {
    buildDocsFixture();
    expect(planForPlugin('commons', root).files).toEqual([]);
  });

  test('agent-loop-full meta-bundle plans zero files', () => {
    buildDocsFixture();
    expect(planForPlugin('agent-loop-full', root).files).toEqual([]);
  });
});
