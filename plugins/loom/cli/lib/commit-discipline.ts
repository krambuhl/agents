// Commit-discipline lint primitive for the (d) "no state-only commits" rule.
//
// Phase 6's first exit criterion: an ev-loop unit folds its `manifest.toml`
// state mutations into the SAME commit as the code — it never makes a commit
// that touches only machine state. This module is the pure detector behind
// that rule. The "loop AVOIDS producing one" property is structurally
// guaranteed by the loop committing code + state together; this primitive is
// the deterministic check that a given set of commits respects the rule, and
// the seam the real-git test exercises against actual `git log` output.

// A commit reduced to the set of files it changed — the unit the lint
// reasons over (sha is opaque; only the file set matters).
export type CommitFiles = {
  sha: string;
  files: string[];
};

// True when a path is a machine-state file under loom's control. Post-M1 that
// is the single consolidated `manifest.toml` per project — the file the (d)
// discipline says must ride a feature commit, never a commit of its own.
// Human artifacts (PLAN.md, INTERVIEW.md), code, docs, and the rarer
// PR-response files are NOT state for this purpose: they can legitimately
// stand alone in a commit.
export function isManifestStatePath(path: string): boolean {
  return /(^|\/)projects\/[^/]+\/manifest\.toml$/.test(path);
}

// Flag commits whose every changed file is a state path — a "state-only
// commit", the papercut (d) eliminates. The `isStatePath` predicate is a
// parameter (defaulting to the manifest matcher) so the state set is explicit
// and the detector is testable against arbitrary path rules.
//
// A commit with no files (an empty or pure-merge commit under `--name-only`)
// is NOT flagged: `every` is vacuously true on an empty set, but an empty
// commit carries no state mutation to fold, so it is not the antipattern this
// guards. The explicit length check encodes that intent.
export function findStateOnlyCommits(
  commits: CommitFiles[],
  isStatePath: (path: string) => boolean = isManifestStatePath,
): string[] {
  return commits
    .filter((c) => c.files.length > 0 && c.files.every(isStatePath))
    .map((c) => c.sha);
}

// The pretty-format string the parser below is paired with. Exported so the
// producer (`git log --name-only --format=<this>`) and the consumer
// (`parseGitLogNameOnly`) cannot drift: a custom `COMMIT:` sentinel marks
// commit boundaries unambiguously, since a real filename can never collide
// with the prefixed full sha line.
export const GIT_LOG_NAME_ONLY_FORMAT = 'COMMIT:%H';

// Parse `git log --name-only --format=COMMIT:%H` output into CommitFiles[].
// Each commit emits a `COMMIT:<sha>` line followed (after git's blank line)
// by one `--name-only` path per changed file. Blank lines are skipped; any
// line that is not a COMMIT boundary is a file path for the current commit.
export function parseGitLogNameOnly(output: string): CommitFiles[] {
  const commits: CommitFiles[] = [];
  let current: CommitFiles | null = null;
  for (const raw of output.split('\n')) {
    const line = raw.trim();
    if (line === '') continue;
    if (line.startsWith('COMMIT:')) {
      current = { sha: line.slice('COMMIT:'.length), files: [] };
      commits.push(current);
    } else if (current !== null) {
      current.files.push(line);
    }
  }
  return commits;
}
