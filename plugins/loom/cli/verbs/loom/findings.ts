import { parseArgs } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveProject } from '../../lib/project.ts';
import {
  manifestPath,
  readManifestFile,
  appendFinding,
  writeManifest,
} from '../../lib/manifest-toml.ts';
import { LoomError } from '../../lib/errors.ts';
import type { GuildFinding, FindingSeverity } from '../../lib/types.ts';
import type { CliContext, DispatchResult } from './project.ts';

function emit(value: unknown, pretty: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function errToResult(err: unknown): DispatchResult {
  if (err instanceof LoomError) {
    return { stderr: JSON.stringify(err.toPayload()), exitCode: 1 };
  }
  throw err;
}

const HARVEST_OPTIONS = {
  pretty: { type: 'boolean' as const },
  branch: { type: 'string' as const },
  unit: { type: 'string' as const },
};

// One row of guild's .guild-findings.jsonl, as written by `guild findings
// append`. `branch`/`unit` are optional (a finding may be unattributed);
// `ts`/`slug` are guild-side metadata the harvest drops — the manifest is
// already scoped to the project, and `harvested_at` replaces the row `ts`.
type GuildFindingRow = {
  evaluator: string;
  code: string;
  evidence: string;
  severity: FindingSeverity;
  signature: string;
  branch?: string;
  unit?: string;
};

function isFindingRow(v: unknown): v is GuildFindingRow {
  if (typeof v !== 'object' || v === null) return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.evaluator === 'string' &&
    typeof r.code === 'string' &&
    typeof r.evidence === 'string' &&
    (r.severity === 'blocking' || r.severity === 'advisory') &&
    typeof r.signature === 'string' &&
    (r.branch === undefined || typeof r.branch === 'string') &&
    (r.unit === undefined || typeof r.unit === 'string')
  );
}

// Fold guild's append-only .guild-findings.jsonl scratch stream into the
// manifest's [[findings]] section at unit/phase close. This is the serial,
// single-writer harvest the concurrency design calls for: the parallel
// evaluator panel appends to the jsonl during a unit; this verb folds it in
// once, at close, never mid-panel. Idempotent — a row whose signature is
// already in [[findings]] is skipped, so re-running harvests only new
// findings. Optional --branch/--unit narrow which rows fold (default: all
// rows for the project). The jsonl is left intact (it is gitignored scratch);
// dedupe-on-signature keeps re-harvests clean.
export function findingsHarvest(rest: string[], ctx: CliContext): DispatchResult {
  const { values, positionals } = parseArgs({
    args: rest,
    options: HARVEST_OPTIONS,
    allowPositionals: true,
    strict: false,
  });
  const slug = positionals[0];
  if (slug === undefined) {
    return errToResult(
      new LoomError('missing-slug', 'findings harvest requires a slug'),
    );
  }
  try {
    const path = resolveProject(slug, ctx.projectsRoot);
    const jsonlPath = join(path, '.guild-findings.jsonl');
    // No scratch stream → nothing to harvest (not an error).
    if (!existsSync(jsonlPath)) {
      return {
        stdout: emit(
          { section: 'findings', harvested: 0, skipped: 0 },
          values.pretty === true,
        ),
        exitCode: 0,
      };
    }
    const mp = manifestPath(path);
    const { manifest, token } = readManifestFile(mp);
    // Dedupe set: signatures already in [[findings]], plus any folded earlier
    // in this same batch (a duplicate signature in the jsonl folds once).
    const seen = new Set(manifest.findings.map((f) => f.signature));
    const harvestedAt = new Date().toISOString();

    let next = manifest;
    let harvested = 0;
    let skipped = 0;
    for (const line of readFileSync(jsonlPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      let row: unknown;
      try {
        row = JSON.parse(trimmed);
      } catch {
        // A malformed scratch line is skipped, not fatal — the stream is
        // best-effort and doctor surfaces a corrupt file separately.
        skipped += 1;
        continue;
      }
      if (!isFindingRow(row)) {
        skipped += 1;
        continue;
      }
      // Optional row filters (intentionally-excluded rows are not "skipped").
      if (values.branch !== undefined && row.branch !== values.branch) continue;
      if (values.unit !== undefined && row.unit !== values.unit) continue;
      if (seen.has(row.signature)) {
        skipped += 1;
        continue;
      }
      seen.add(row.signature);
      const finding: GuildFinding = {
        evaluator: row.evaluator,
        code: row.code,
        evidence: row.evidence,
        severity: row.severity,
        signature: row.signature,
        harvested_at: harvestedAt,
      };
      if (row.branch !== undefined) finding.branch = row.branch;
      if (row.unit !== undefined) finding.unit = row.unit;
      next = appendFinding(next, finding);
      harvested += 1;
    }
    // Only write when something changed (a no-op harvest leaves the manifest
    // byte-identical and skips the optimistic-lock write entirely).
    if (harvested > 0) {
      writeManifest(mp, next, { expect: token });
    }
    return {
      stdout: emit(
        { section: 'findings', harvested, skipped },
        values.pretty === true,
      ),
      exitCode: 0,
    };
  } catch (err) {
    return errToResult(err);
  }
}

export const FINDINGS_VERBS = {
  harvest: findingsHarvest,
};
