// Strip-only smoke for toml.ts. Run directly under real `node`:
//
//   node plugins/loom/cli/lib/toml.smoke.ts
//
// vitest transforms TypeScript through its own pipeline, so it will
// happily run a file that real Node's strip-only loader rejects with
// ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX (parameter properties, a JSDoc block
// comment whose close sequence breaks the stripper, enums). This harness
// imports the lib MODULE DIRECTLY — not through a CLI verb — so a footgun
// living in toml.ts is caught even before any verb imports it. toml.test.ts
// shells this via spawnSync('node', ...) and asserts exit 0 + the marker.

import { parseToml, stringifyToml } from './toml.ts';
import type { TomlValue, TomlTable } from './toml.ts';

// Order-independent structural deep-equal. Round-tripping reorders a
// table's keys (leaves before header sections), so a key-order-sensitive
// compare like JSON.stringify would false-fail; this walks structure.
function deepEqual(a: TomlValue, b: TomlValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((el, i) => deepEqual(el, b[i]));
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const at = a as TomlTable;
    const bt = b as TomlTable;
    const ak = Object.keys(at);
    const bk = Object.keys(bt);
    if (ak.length !== bk.length) return false;
    return ak.every(
      (k) => Object.prototype.hasOwnProperty.call(bt, k) && deepEqual(at[k], bt[k]),
    );
  }
  return a === b;
}

// A maximally-nested sample mirroring a real loom manifest: identity
// scalars, a [config]-shaped table holding an inline-table value, an
// array-of-tables ([[checkins]]) whose elements carry a deeply nested
// inline `contract` table with string arrays, and the nasty literal
// characters that exercise comment-stripping and escaping (#, embedded
// quote, the */ sequence, newline/tab).
const sample: TomlTable = {
  schema_version: 1,
  title: 'Substrate Consolidation',
  active: true,
  config: {
    base_branch: 'main',
    worker_bindings: { default: 'ev-loop-interactive' },
    labels: [],
  },
  checkins: [
    {
      number: '05',
      contract: {
        goal: 'goal with a # hash, a "quoted" word, and a */ sequence',
        acceptance_criteria: ['first\nline', 'tab\tsep'],
        disqualifiers: [],
        nested: { detail: { kind: 'pr-opened', pr: 71 } },
      },
    },
    {
      number: '06',
      contract: {
        goal: 'second',
        acceptance_criteria: ['a', 'b', 'c'],
        disqualifiers: ['none'],
        nested: { detail: { kind: 'note', text: '' } },
      },
    },
  ],
};

const serialized = stringifyToml(sample);
const reparsed = parseToml(serialized);

if (!deepEqual(sample, reparsed)) {
  console.error('toml.smoke: round-trip mismatch');
  console.error('--- serialized ---');
  console.error(serialized);
  console.error('--- reparsed ---');
  console.error(JSON.stringify(reparsed, null, 2));
  process.exit(1);
}

console.log(`toml.smoke ok: round-trip stable over ${serialized.length} bytes`);
