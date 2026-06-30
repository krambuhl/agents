import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  TOKEN,
  parseAnnotation,
  readDictionary,
  resolveSites,
  scanSites,
} from './runbook.ts';

// Build markers from TOKEN so this test file's literals never depend on the
// spelling, and so a scan of the repo wouldn't be needed to exercise it.
const mark = (rest: string): string => `${TOKEN}:${rest}`;

describe('parseAnnotation', () => {
  test('parses dict-id + key=value params', () => {
    expect(parseAnnotation(`// ${mark('rename-foo target=bar n=2')}`)).toEqual({
      dictId: 'rename-foo',
      params: { target: 'bar', n: '2' },
    });
  });

  test('bare marker has empty params', () => {
    expect(parseAnnotation(`# ${mark('drop-legacy')}`)).toEqual({
      dictId: 'drop-legacy',
      params: {},
    });
  });

  test('non-annotation lines return null', () => {
    expect(parseAnnotation('just an ordinary comment')).toBeNull();
    expect(parseAnnotation('TODO: not a migrate marker')).toBeNull();
  });
});

describe('scanSites', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'runbook-scan-'));
    writeFileSync(join(root, 'a.ts'), `const x = 1;\n// ${mark('rename-foo target=bar')}\nconst y = 2;\n`);
    mkdirSync(join(root, 'sub'), { recursive: true });
    writeFileSync(join(root, 'sub', 'b.md'), `text\ntext\n<!-- ${mark('drop-legacy')} -->\n`);
    // skipped: node_modules + a non-text extension
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    writeFileSync(join(root, 'node_modules', 'c.ts'), `// ${mark('should-be-skipped')}\n`);
    writeFileSync(join(root, 'image.png'), `// ${mark('not-text')}\n`);
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test('finds annotated sites with file (relative) + 1-indexed line', () => {
    const sites = scanSites(root).sort((a, b) => a.file.localeCompare(b.file));
    expect(sites.map((s) => ({ file: s.file, line: s.line, dictId: s.dictId }))).toEqual([
      { file: 'a.ts', line: 2, dictId: 'rename-foo' },
      { file: join('sub', 'b.md'), line: 3, dictId: 'drop-legacy' },
    ]);
    expect(sites[0].params).toEqual({ target: 'bar' });
  });

  test('skips node_modules and non-text files', () => {
    const ids = scanSites(root).map((s) => s.dictId);
    expect(ids).not.toContain('should-be-skipped');
    expect(ids).not.toContain('not-text');
  });
});

describe('readDictionary + resolveSites', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'runbook-dict-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test('loads the dictionary as id -> entry', () => {
    const p = join(root, 'runbook.toml');
    writeFileSync(
      p,
      '[rename-foo]\ndescription = "Rename foo to bar"\nrunbook = "replace foo( with bar("\n',
    );
    const dict = readDictionary(p);
    expect(dict.get('rename-foo')).toEqual({
      id: 'rename-foo',
      description: 'Rename foo to bar',
      runbook: 'replace foo( with bar(',
    });
  });

  test('resolveSites flags unknown dict-ids', () => {
    const p = join(root, 'runbook.toml');
    writeFileSync(p, '[rename-foo]\ndescription = "x"\n');
    const dict = readDictionary(p);
    const resolved = resolveSites(
      [
        { dictId: 'rename-foo', params: {}, file: 'a.ts', line: 1, raw: '' },
        { dictId: 'ghost', params: {}, file: 'b.ts', line: 1, raw: '' },
      ],
      dict,
    );
    expect(resolved.map((r) => r.known)).toEqual([true, false]);
    expect(resolved[0].entry?.description).toBe('x');
    expect(resolved[1].entry).toBeNull();
  });
});
