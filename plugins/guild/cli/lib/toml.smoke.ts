// sync-shared: plugin-local
// Strip-only smoke for toml.ts. Run directly under real `node`:
//
//   node plugins/guild/cli/lib/toml.smoke.ts
//
// vitest transforms TypeScript through its own pipeline, so it will
// happily run a file that real Node's strip-only loader rejects with
// ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX (parameter properties, a JSDoc block
// comment whose close sequence breaks the stripper, enums). This harness
// imports the lib MODULE DIRECTLY — not through a CLI verb — so a footgun
// living in toml.ts is caught even before any verb imports it. toml.test.ts
// shells this via spawnSync('node', ...) and asserts exit 0 + the marker.
//
// guild's toml.ts is a parse-only reader (no stringify), so this smoke
// parses a representative document covering the grammar guild actually
// supports — scalars, a [table], a dotted 3-level [axis.phase.reviewer]
// header, an [[array-of-tables]], a single-line string array, an empty
// array, a trailing comment, and a # plus a */ sequence inside a quoted
// value — and structurally compares the parse against the expected tree.
// Loader-compatibility plus a shallow parse, not value-correctness (that
// is toml.test.ts's job).

import { isTomlTable, parseToml } from './toml.ts';
import type { TomlTable, TomlValue } from './toml.ts';

// Order-independent structural deep-equal — guild's reader may emit keys
// in a different order than written, so a key-order-sensitive compare
// would false-fail.
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

// A representative document in the shape guild reads (panel.manifest.toml /
// axes.toml). The # inside the quoted `note` value must survive (it is not
// a comment); the trailing comment on `name` must be stripped.
const src = [
  'schema_version = 1',
  'name = "guild-toml-smoke" # trailing',
  'active = true',
  'note = "has a # hash and a */ sequence"',
  'domains = ["a11y", "react", "naming"]',
  'empty = []',
  '',
  '[meta]',
  'title = "smoke"',
  '',
  '[axis.phase.reviewer]',
  'writes = false',
  '',
  '[[combinations]]',
  'phase = "reviewer"',
  '',
  '[[combinations]]',
  'phase = "plan"',
  '',
].join('\n');

const expected: TomlTable = {
  schema_version: 1,
  name: 'guild-toml-smoke',
  active: true,
  note: 'has a # hash and a */ sequence',
  domains: ['a11y', 'react', 'naming'],
  empty: [],
  meta: { title: 'smoke' },
  axis: { phase: { reviewer: { writes: false } } },
  combinations: [{ phase: 'reviewer' }, { phase: 'plan' }],
};

const parsed = parseToml(src);

if (!isTomlTable(parsed) || !deepEqual(parsed, expected)) {
  console.error('guild-toml.smoke: parse mismatch');
  console.error('--- parsed ---');
  console.error(JSON.stringify(parsed, null, 2));
  process.exit(1);
}

console.log(
  `guild-toml.smoke ok: parsed ${Object.keys(parsed).length} top-level keys over ${src.length} bytes`,
);
