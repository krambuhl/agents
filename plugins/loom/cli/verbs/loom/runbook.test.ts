import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runbookVerb } from './runbook.ts';
import { TOKEN } from '../../lib/runbook.ts';
import type { CliContext } from './project.ts';

const ctx = { projectsRoot: '/unused' } as CliContext;
const mark = (rest: string): string => `${TOKEN}:${rest}`;

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'runbook-verb-'));
  writeFileSync(join(root, 'a.ts'), `// ${mark('rename-foo')}\n// ${mark('ghost')}\n`);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function parse(out: { stdout?: string }): Record<string, unknown> {
  return JSON.parse(out.stdout ?? '{}');
}

describe('loom runbook scan', () => {
  test('scans sites under a root', () => {
    const r = runbookVerb(['scan', root], ctx);
    expect(r.exitCode).toBe(0);
    expect(parse(r).count).toBe(2);
  });

  test('--dict resolves and counts unknown dict-ids', () => {
    const dict = join(root, 'runbook.toml');
    writeFileSync(dict, '[rename-foo]\ndescription = "x"\n');
    const r = runbookVerb(['scan', root, `--dict=${dict}`], ctx);
    const j = parse(r);
    expect(j.count).toBe(2);
    expect(j.unknown).toBe(1); // 'ghost' is not in the dictionary
  });

  test('missing root / dict / unknown sub-verb error', () => {
    expect(runbookVerb(['scan', join(root, 'nope')], ctx).exitCode).toBe(1);
    expect(runbookVerb(['scan', root, '--dict=/no/such.toml'], ctx).exitCode).toBe(1);
    expect(runbookVerb(['bogus'], ctx).exitCode).toBe(1);
  });
});
