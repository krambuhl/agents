import { describe, expect, test } from 'vitest';

import { detectDrift } from '../../../scripts/sync-shared.ts';

/**
 * Real-FS drift gate for the two cross-plugin shared docs.
 *
 * `plugins/commons/docs/{LOOM-CONVENTIONS,SUBSTRATE-COMPOSITIONS}.md`
 * are the canonical sources; `scripts/sync-shared.ts` mirrors them
 * into each consumer plugin's `plugins/<consumer>/docs/` tree per
 * `COMMONS_CONSUMERS.docs`. The fixture-based tests in
 * `scripts/sync-shared.test.ts` cover the drift-detection LOGIC; this
 * test exercises the drift detector against the REAL working tree, so
 * a developer who edits a consumer copy directly (or forgets to run
 * the sync script) finds out at test time rather than at install time.
 *
 * Scoped tightly to the two shared docs across all consumers; broader
 * sync-shared drift (lib files, orphan files, other docs) is out of
 * scope for this gate by design.
 */
const SHARED_DOCS = ['LOOM-CONVENTIONS.md', 'SUBSTRATE-COMPOSITIONS.md'] as const;

describe('shared-doc byte-identity (real working tree)', () => {
  test('no drift for the two cross-plugin shared docs', () => {
    const allDrift = detectDrift();
    const sharedDocDrift = allDrift.filter((record) =>
      SHARED_DOCS.some((doc) => record.destination.endsWith(`docs/${doc}`)),
    );

    expect(
      sharedDocDrift,
      sharedDocDrift.length === 0
        ? ''
        : `Shared-doc drift detected. Run \`node scripts/sync-shared.ts\` to resync.\n\n${sharedDocDrift
            .map((record) => `  - ${record.message}`)
            .join('\n')}`,
    ).toEqual([]);
  });
});
