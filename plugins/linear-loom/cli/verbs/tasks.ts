import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LinearClient } from '../lib/linear-client.ts';
import { resolveAuth } from '../lib/auth.ts';
import { LinearLoomError } from '../lib/errors.ts';
import {
  type LinearMarker,
  type MarkerIO,
  markerPath,
  readMarker,
} from '../lib/marker.ts';
import { defaultGitRunner, type GitRunner } from '../lib/git.ts';
import { parsePlan, type FlatNode } from '../lib/plan-parser.ts';
import {
  composeLinearDescription,
  fetchLinearState,
  type LinearState,
} from '../lib/linear-state.ts';
import {
  computeDiff,
  partitionArchiveOps,
  summarizeDiff,
  type DiffOp,
} from '../lib/plan-diff.ts';
import {
  applyDiffOps,
  type AppliedOp,
  type LabelHandle,
} from '../lib/apply-diff.ts';
import { applyLinearUrlsToPlan } from '../lib/plan-writeback.ts';

// `linear-loom tasks generate <slug>` — the load-bearing verb.
//
// Flow:
//   1. Read marker, resolve auth + git, read PLAN.md from disk.
//   2. Parse PLAN.md.
//   3. Fetch Linear state (Milestones, Issues, Sub-Issues with the
//      loom-project:<slug> label) + the label's Linear ID.
//   4. Compute diff (create/update/rekey/archive ops).
//   5. Default behavior: dry-run — print the summary + ops.
//   6. With --apply: apply create/update/rekey ops. Archives are
//      gated by --prune (§ 12.4); in-flight archives gated additionally
//      by --prune --force.
//
// --team-id=<id> is required (Linear's IssueCreate needs a teamId).
// Future polish: extend the marker to carry teamId so this flag can
// default; v1 keeps it explicit.

export interface TasksContext {
  client?: LinearClient;
  resolveAuthFn?: typeof resolveAuth;
  projectsRoot?: string;
  markerIO?: MarkerIO;
  gitRunner?: GitRunner;
  repoRoot?: string;
  readFileFn?: (path: string) => string;
  writeFileFn?: (path: string, contents: string) => void;
  now?: () => string;
}

export interface DispatchResult {
  stdout?: string;
  stderr?: string;
  exitCode: number;
}

interface LabelLookupResult {
  issueLabels: { nodes: Array<{ id: string; name: string }> };
}

const LABEL_LOOKUP_QUERY = `
  query LinearLoomTasksLabelLookup($name: String!) {
    issueLabels(filter: { name: { eq: $name } }) {
      nodes { id name }
    }
  }
`;

export async function tasksGenerate(
  rest: string[],
  ctx: TasksContext = {},
): Promise<DispatchResult> {
  const { values, positionals } = parseArgs({
    args: rest,
    options: {
      'team-id': { type: 'string' as const },
      'plan-file': { type: 'string' as const },
      apply: { type: 'boolean' as const },
      prune: { type: 'boolean' as const },
      force: { type: 'boolean' as const },
      pretty: { type: 'boolean' as const },
    },
    allowPositionals: true,
    strict: false,
  });

  const slug = positionals[0];
  if (typeof slug !== 'string' || slug.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-slug',
        'tasks generate requires a positional <slug> argument.',
        { namespace: 'tasks', verb: 'generate' },
      ),
    );
  }

  const teamId = values['team-id'];
  if (typeof teamId !== 'string' || teamId.trim() === '') {
    return errToResult(
      new LinearLoomError(
        'missing-team-id',
        'tasks generate requires --team-id=<linear-team-id> (Linear IssueCreate needs a teamId; future marker schema will cache it).',
        { namespace: 'tasks', verb: 'generate' },
      ),
    );
  }

  const projectsRoot = ctx.projectsRoot ?? 'projects';
  const target = markerPath(slug.trim(), projectsRoot);

  let marker: LinearMarker;
  try {
    marker = readMarker(target, ctx.markerIO);
  } catch (err) {
    return errToResult(err);
  }

  let authResolution;
  try {
    authResolution = (ctx.resolveAuthFn ?? resolveAuth)();
  } catch (err) {
    return errToResult(err);
  }

  const client =
    ctx.client ?? new LinearClient({ apiKey: authResolution.apiKey });
  const gitRunner = ctx.gitRunner ?? defaultGitRunner;
  const repoRoot = ctx.repoRoot ?? process.cwd();
  const reader = ctx.readFileFn ?? defaultRead;
  const now = ctx.now ?? defaultNow;
  const syncedAt = now();

  let branch: string;
  let github;
  try {
    branch = gitRunner.currentBranch(repoRoot);
    github = gitRunner.githubRemote(repoRoot);
  } catch (err) {
    return errToResult(err);
  }

  const planFilePath =
    values['plan-file'] ?? join(projectsRoot, slug.trim(), 'PLAN.md');
  let planMarkdown: string;
  try {
    planMarkdown = reader(planFilePath);
  } catch (err) {
    return errToResult(
      new LinearLoomError(
        'plan-file-unreadable',
        `Cannot read PLAN.md at ${planFilePath}: ${(err as Error).message}`,
        { namespace: 'tasks', verb: 'generate' },
      ),
    );
  }

  let plan;
  try {
    plan = parsePlan(planMarkdown);
  } catch (err) {
    return errToResult(err);
  }

  // Fetch Linear state + label ID in parallel.
  let linearState: LinearState;
  let label: LabelHandle;
  try {
    const [stateResult, labelResult] = await Promise.all([
      fetchLinearState({
        client,
        linearProjectId: marker.linear_project_id,
        labelName: marker.label,
      }),
      client.query<LabelLookupResult>(LABEL_LOOKUP_QUERY, {
        name: marker.label,
      }),
    ]);
    linearState = stateResult;
    const labelNode = labelResult.issueLabels.nodes.find(
      (n) => n.name === marker.label,
    );
    if (labelNode === undefined) {
      throw new LinearLoomError(
        'label-not-found',
        `loom-project label "${marker.label}" not found in Linear. Run linear-loom configure or linear-loom project create to bootstrap it.`,
        { namespace: 'tasks', verb: 'generate' },
      );
    }
    label = { id: labelNode.id, name: labelNode.name };
  } catch (err) {
    return errToResult(err);
  }

  // § 13: the Sub-Issue `**Source**:` line points at the PLAN.md
  // section that defined the Task. Each node carries its 1-based
  // source line, so we compose a per-node anchored URL rather than
  // a single file-root URL.
  const planUrlBase = `github.com/${github.org}/${github.repo}/tree/${branch}/projects/${marker.slug}/PLAN.md`;
  const sourceUrlFor = (node: FlatNode): string => `${planUrlBase}#L${node.line}`;

  const composeTitleFn = (node: FlatNode, planSlug: string): string => {
    if (node.kind === 'phase') {
      return `${planSlug} · Phase ${node.number ?? '?'} — ${node.prose}`;
    }
    if (node.kind === 'batch') {
      return `${planSlug} · Batch ${node.composed_key} — ${node.prose}`;
    }
    return node.prose;
  };
  const composeBodyFn = (node: FlatNode): string => {
    const body = node.body !== undefined && node.body !== '' ? node.body : node.prose;
    return composeLinearDescription(
      {
        composed_key: node.composed_key,
        source_url: sourceUrlFor(node),
        synced_at: syncedAt,
      },
      body,
    );
  };

  const ops = computeDiff({
    plan,
    linear: linearState,
    slug: marker.slug,
    composeTitle: composeTitleFn,
    composeBody: composeBodyFn,
  });

  const summary = summarizeDiff(ops);
  const archivePartition = partitionArchiveOps(ops);

  const applyRequested = values.apply === true;
  if (!applyRequested) {
    return {
      stdout: emit(
        {
          slug: marker.slug,
          mode: 'dry-run',
          summary,
          archive_partition: {
            safe_to_archive: archivePartition.safe_to_archive.length,
            in_flight: archivePartition.in_flight.length,
          },
          ops,
          hint: 'Re-run with --apply to apply create/update/rekey ops. Archives are additionally gated by --prune (and --prune --force for in-flight items).',
        },
        values.pretty === true,
      ),
      exitCode: 0,
    };
  }

  // --apply: build the effective op list. By default, exclude
  // archives; --prune includes safe archives; --prune --force also
  // includes in-flight archives.
  const opsToApply = buildApplySet({
    ops,
    archivePartition,
    prune: values.prune === true,
    force: values.force === true,
  });

  // Pre-fill the composed_key → linear_id map from the existing
  // Linear state so update/rekey/archive ops can resolve their
  // target IDs, and so child creates can resolve their parent IDs
  // when the parent already exists in Linear.
  const composedKeyToLinearId = new Map<string, string>();
  for (const [key, node] of linearState.by_composed_key) {
    composedKeyToLinearId.set(key, node.linear_id);
  }

  let applied: AppliedOp[];
  try {
    applied = await applyDiffOps(opsToApply, {
      client,
      team_id: teamId.trim(),
      linear_project_id: marker.linear_project_id,
      label,
      composed_key_to_linear_id: composedKeyToLinearId,
    });
  } catch (err) {
    return errToResult(err);
  }

  // § 13 (PLAN.md side of the bidirectional cross-reference): build
  // the composed_key → linear_url map from this run's applied ops.
  // Only creates and updates carry a URL; archives do not (the
  // PLAN.md line is gone in the source anyway). Milestones (Phases)
  // have no Linear URL of their own — applyDiffOps reports an empty
  // linear_url for those, and the writeback simply skips them.
  const urlsByComposedKey = new Map<string, string>();
  for (const op of applied) {
    if (op.linear_url !== undefined && op.linear_url !== '') {
      urlsByComposedKey.set(op.composed_key, op.linear_url);
    }
  }

  const writeback = applyLinearUrlsToPlan(planMarkdown, urlsByComposedKey);
  if (writeback.updated_lines > 0) {
    const writer = ctx.writeFileFn ?? defaultWrite;
    try {
      writer(planFilePath, writeback.text);
    } catch (err) {
      return errToResult(
        new LinearLoomError(
          'plan-writeback-failed',
          `Cannot write PLAN.md at ${planFilePath}: ${(err as Error).message}`,
          { namespace: 'tasks', verb: 'generate' },
        ),
      );
    }
  }

  return {
    stdout: emit(
      {
        slug: marker.slug,
        mode: 'apply',
        summary,
        archive_partition: {
          safe_to_archive: archivePartition.safe_to_archive.length,
          in_flight: archivePartition.in_flight.length,
        },
        applied,
        deferred_archives: {
          safe_to_archive:
            values.prune === true ? 0 : archivePartition.safe_to_archive.length,
          in_flight:
            values.prune === true && values.force === true
              ? 0
              : archivePartition.in_flight.length,
        },
        plan_writeback: { updated_lines: writeback.updated_lines },
      },
      values.pretty === true,
    ),
    exitCode: 0,
  };
}

interface BuildApplySetArgs {
  ops: DiffOp[];
  archivePartition: ReturnType<typeof partitionArchiveOps>;
  prune: boolean;
  force: boolean;
}

function buildApplySet(args: BuildApplySetArgs): DiffOp[] {
  // Always include non-archive ops.
  const out: DiffOp[] = args.ops.filter((o) => o.kind !== 'archive');
  if (args.prune === true) {
    out.push(...args.archivePartition.safe_to_archive);
    if (args.force === true) {
      out.push(...args.archivePartition.in_flight);
    }
  }
  return out;
}

export const TASKS_VERBS: Record<
  string,
  (rest: string[], ctx?: TasksContext) => Promise<DispatchResult>
> = {
  generate: tasksGenerate,
};

function defaultRead(path: string): string {
  return readFileSync(path, 'utf8');
}

function defaultWrite(path: string, contents: string): void {
  writeFileSync(path, contents, 'utf8');
}

function defaultNow(): string {
  return new Date().toISOString();
}

function emit(value: unknown, pretty: boolean): string {
  return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

function errToResult(err: unknown): DispatchResult {
  if (err instanceof LinearLoomError) {
    return {
      stderr: `${JSON.stringify(err.toPayload())}\n`,
      exitCode: 1,
    };
  }
  throw err;
}
