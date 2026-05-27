// Strip-only smoke for manifest-toml.ts. Run directly under real `node`:
//
//   node plugins/loom/cli/lib/manifest-toml.smoke.ts
//
// Same rationale as toml.smoke.ts / plan.smoke.ts: vitest transforms TS
// through its own pipeline and would happily run a file that real Node's
// strip-only loader rejects (parameter properties, a JSDoc whose close
// sequence breaks the stripper, enums). The typing layer is new code that
// runs under `node` once wired to verbs (U3/U5), so it gets its own
// loader gate now. This harness imports readManifest DIRECTLY and runs it
// on the real-artifact fixture; manifest-toml.test.ts shells it via
// spawnSync('node') and asserts exit 0 + the marker.
//
// The smoke defends LOADER-COMPATIBILITY, not value-correctness — that is
// the unit tier's job. Assertions here are deliberately shallow.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readManifest } from './manifest-toml.ts';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, '..', 'fixtures', 'manifest-real.toml');

const manifest = readManifest(readFileSync(fixturePath, 'utf8'));

if (manifest.meta.slug.length === 0) {
  console.error('manifest-toml.smoke: expected a non-empty meta.slug');
  process.exit(1);
}
if (manifest.phases.length < 1 || manifest.checkins.length < 1) {
  console.error('manifest-toml.smoke: expected at least one phase and one checkin');
  process.exit(1);
}

console.log(
  `manifest-toml.smoke ok: ${manifest.phases.length} phases, ` +
    `${manifest.events.length} events, ${manifest.checkins.length} checkins, ` +
    `${manifest.sessions.length} sessions`,
);
