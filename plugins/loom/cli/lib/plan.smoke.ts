// sync-shared: plugin-local
// Strip-only smoke for plan.ts. Run directly under real `node`:
//
//   node plugins/loom/cli/lib/plan.smoke.ts
//
// vitest transforms TypeScript through its own pipeline, so it will
// happily run a file that real Node's strip-only loader rejects with
// ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX (parameter properties, a `*/`
// sequence inside a block comment, enums). This harness imports the
// lib MODULE DIRECTLY — not through a CLI verb — so a footgun living in
// plan.ts is caught even before any verb imports it. plan.real.test.ts
// shells this via spawnSync('node', ...) and asserts exit 0.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePlan } from './plan.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, '..', 'fixtures', 'plan-milestone-integer.md');

const text = readFileSync(fixturePath, 'utf8');
const { plan, diagnostics } = parsePlan(text);

if (plan.phases.length < 1) {
  console.error('plan.smoke: expected at least one phase, got 0');
  process.exit(1);
}

console.log(
  `plan.smoke ok: ${plan.phases.length} phases, ${diagnostics.length} diagnostics`,
);
