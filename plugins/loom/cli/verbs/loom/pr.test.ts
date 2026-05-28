import { test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prDiscover, prOpen, prUpdate, prComments, prRespond } from './pr.ts';
import { manifestPath, readManifestFile, writeManifest } from '../../lib/manifest-toml.ts';
import type { Checkin } from '../../lib/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(__dirname, '..', '..', 'fixtures');

let projectsRoot: string;
const TEST_BRANCH = 'loom-cli/test-branch';

function setupProjectWithCheckins(checkinNumbers: string[]): string {
  const projectPath = join(projectsRoot, '2026-05-15-test-loom');
  mkdirSync(projectPath);
  const base = readManifestFile(join(FIXTURES, 'manifest-basic.toml')).manifest;
  const template = JSON.parse(
    readFileSync(join(FIXTURES, 'checkin-basic.json'), 'utf8'),
  ) as Checkin;
  const checkins = checkinNumbers.map((n) => ({
    ...template,
    number: n,
    branch: TEST_BRANCH,
  }));
  writeManifest(manifestPath(projectPath), { ...base, checkins });
  return projectPath;
}

beforeEach(() => {
  projectsRoot = mkdtempSync(join(tmpdir(), 'loom-verbs-pr-'));
});

afterEach(() => {
  rmSync(projectsRoot, { recursive: true, force: true });
});

test('prDiscover: no existing PR returns marker_state=new', () => {
  setupProjectWithCheckins(['01', '02']);
  // Stub gh to return "no PR" (gh exits 1 when no PR matches)
  const ghRunner = () => {
    throw new Error('no pull requests found');
  };
  const result = prDiscover(
    ['test-loom', '--branch=loom-cli/test-branch'],
    { projectsRoot, ghRunner },
  );
  expect(result.exitCode).toBe(0);
  const out = JSON.parse(result.stdout as string);
  expect(out.marker_state).toBe('new');
  expect(out.checkins).toEqual([1, 2]);
  expect(out.pr).toBeNull();
});

test('prDiscover: PR body marker matches disk → fresh, surfaces gh state', () => {
  setupProjectWithCheckins(['01', '02']);
  const ghRunner = () =>
    JSON.stringify({
      number: 42,
      url: 'https://github.com/x/y/pull/42',
      body: '<!-- loom-pr-checkins: 01,02 -->\n\n## Body',
      state: 'MERGED',
    });
  const result = prDiscover(
    ['test-loom', '--branch=loom-cli/test-branch'],
    { projectsRoot, ghRunner },
  );
  expect(result.exitCode).toBe(0);
  const out = JSON.parse(result.stdout as string);
  expect(out.marker_state).toBe('fresh');
  expect(out.pr.number).toBe(42);
  // gh merge state surfaces — orientation's open/merged signal under (d).
  expect(out.pr.state).toBe('MERGED');
});

test('prDiscover: invokes `gh pr view <branch>` positionally with state field', () => {
  // Pins the gh invocation. `gh pr view` takes the branch as a POSITIONAL;
  // `--head` is a `gh pr list` flag and `gh pr view --head` errors out — a
  // regression to it would make discover silently report "no PR" (the catch
  // swallows the gh error). The mock here returns valid JSON, so only an
  // assertion on the args themselves catches the mistake fixtures otherwise
  // mask.
  setupProjectWithCheckins(['01']);
  const ghCalls: string[][] = [];
  const ghRunner = (args: string[]) => {
    ghCalls.push(args);
    return JSON.stringify({
      number: 7,
      url: 'https://github.com/x/y/pull/7',
      body: '<!-- loom-pr-checkins: 01 -->\n\n## Body',
      state: 'OPEN',
    });
  };
  const result = prDiscover(
    ['test-loom', '--branch=feature/x'],
    { projectsRoot, ghRunner },
  );
  expect(result.exitCode).toBe(0);
  const args = ghCalls[0] as string[];
  expect(args.slice(0, 2)).toEqual(['pr', 'view']);
  expect(args).toContain('feature/x');
  expect(args).not.toContain('--head');
  // state is requested from gh so orientation can read open/merged.
  const jsonIdx = args.indexOf('--json');
  expect(args[jsonIdx + 1]).toContain('state');
});

test('prDiscover: PR marker is subset of disk → stale', () => {
  setupProjectWithCheckins(['01', '02', '03']);
  const ghRunner = () =>
    JSON.stringify({
      number: 42,
      url: 'https://github.com/x/y/pull/42',
      body: '<!-- loom-pr-checkins: 01,02 -->\n\n## Body',
    });
  const result = prDiscover(
    ['test-loom', '--branch=loom-cli/test-branch'],
    { projectsRoot, ghRunner },
  );
  expect(result.exitCode).toBe(0);
  const out = JSON.parse(result.stdout as string);
  expect(out.marker_state).toBe('stale');
});

test('prDiscover: PR marker is superset → drift', () => {
  setupProjectWithCheckins(['01']);
  const ghRunner = () =>
    JSON.stringify({
      number: 42,
      url: 'https://github.com/x/y/pull/42',
      body: '<!-- loom-pr-checkins: 01,02,03 -->\n\n## Body',
    });
  const result = prDiscover(
    ['test-loom', '--branch=loom-cli/test-branch'],
    { projectsRoot, ghRunner },
  );
  expect(result.exitCode).toBe(0);
  const out = JSON.parse(result.stdout as string);
  expect(out.marker_state).toBe('drift');
});

test('prDiscover: missing --branch returns missing-args', () => {
  setupProjectWithCheckins(['01']);
  const result = prDiscover(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

// ---------- prOpen tests ----------

test('prOpen: composes gh pr create, parses URL, records no event', () => {
  setupProjectWithCheckins(['01']);
  const projectPath = join(projectsRoot, '2026-05-15-test-loom');
  const bodyFile = join(projectsRoot, 'body.md');
  writeFileSync(bodyFile, '## Summary\nBody contents', 'utf8');

  const ghCalls: string[][] = [];
  const ghRunner = (args: string[]) => {
    ghCalls.push(args);
    return 'https://github.com/owner/repo/pull/77\n';
  };

  const result = prOpen(
    [
      'test-loom',
      '--title=Test PR',
      `--body-file=${bodyFile}`,
      '--branch=loom-cli/test-branch',
    ],
    { projectsRoot, ghRunner },
  );
  expect(result.exitCode).toBe(0);
  const out = JSON.parse(result.stdout as string);
  expect(out.pr).toBe(77);
  expect(out.url).toBe('https://github.com/owner/repo/pull/77');

  // gh invocation should include create + flags
  expect(ghCalls[0]).toContain('pr');
  expect(ghCalls[0]).toContain('create');
  expect(ghCalls[0]).toContain('--title');
  expect(ghCalls[0]).toContain('Test PR');

  // No event recorded: PR state is derived on demand via `loom pr discover`,
  // so `pr open` makes no manifest write. `pr-opened` is gone from the
  // EventName union, so cast through string to assert it is absent at runtime.
  const { manifest } = readManifestFile(manifestPath(projectPath));
  expect(manifest.events.some((e) => (e.event as string) === 'pr-opened')).toBe(false);
});

test('prOpen: gh failure surfaces as gh-failed', () => {
  setupProjectWithCheckins(['01']);
  const bodyFile = join(projectsRoot, 'body.md');
  writeFileSync(bodyFile, '...', 'utf8');
  const ghRunner = () => {
    throw new Error('gh: auth required');
  };
  const result = prOpen(
    ['test-loom', '--title=x', `--body-file=${bodyFile}`],
    { projectsRoot, ghRunner },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('gh-failed');
});

test('prOpen: missing --title returns missing-args', () => {
  setupProjectWithCheckins(['01']);
  const bodyFile = join(projectsRoot, 'body.md');
  writeFileSync(bodyFile, '...', 'utf8');
  const result = prOpen(
    ['test-loom', `--body-file=${bodyFile}`],
    { projectsRoot },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('prOpen: missing --body-file returns missing-args', () => {
  setupProjectWithCheckins(['01']);
  const result = prOpen(['test-loom', '--title=x'], { projectsRoot });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('prOpen: invalid gh URL output returns invalid-pr-url', () => {
  setupProjectWithCheckins(['01']);
  const bodyFile = join(projectsRoot, 'body.md');
  writeFileSync(bodyFile, '...', 'utf8');
  const ghRunner = () => 'not a pr url\n';
  const result = prOpen(
    ['test-loom', '--title=x', `--body-file=${bodyFile}`],
    { projectsRoot, ghRunner },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('invalid-pr-url');
});

// ---------- prUpdate tests ----------

test('prUpdate: composes gh pr edit, records no event', () => {
  setupProjectWithCheckins(['01']);
  const projectPath = join(projectsRoot, '2026-05-15-test-loom');
  const bodyFile = join(projectsRoot, 'body.md');
  writeFileSync(bodyFile, '## Updated body', 'utf8');

  const ghCalls: string[][] = [];
  const ghRunner = (args: string[]) => {
    ghCalls.push(args);
    return '';
  };

  const result = prUpdate(
    ['test-loom', '--pr=42', `--body-file=${bodyFile}`],
    { projectsRoot, ghRunner },
  );
  expect(result.exitCode).toBe(0);
  const out = JSON.parse(result.stdout as string);
  expect(out.pr).toBe(42);

  // gh invocation
  expect(ghCalls[0]).toContain('pr');
  expect(ghCalls[0]).toContain('edit');
  expect(ghCalls[0]).toContain('42');

  // No event recorded: PR body refresh is gh-only (no manifest write).
  // `pr-updated` is gone from EventName; cast through string to assert absence.
  const { manifest } = readManifestFile(manifestPath(projectPath));
  expect(manifest.events.some((e) => (e.event as string) === 'pr-updated')).toBe(false);
});

test('prUpdate: missing --pr returns missing-args', () => {
  setupProjectWithCheckins(['01']);
  const bodyFile = join(projectsRoot, 'body.md');
  writeFileSync(bodyFile, '...', 'utf8');
  const result = prUpdate(
    ['test-loom', `--body-file=${bodyFile}`],
    { projectsRoot },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('prUpdate: gh failure surfaces as gh-failed', () => {
  setupProjectWithCheckins(['01']);
  const bodyFile = join(projectsRoot, 'body.md');
  writeFileSync(bodyFile, '...', 'utf8');
  const ghRunner = () => {
    throw new Error('gh: PR 99 not found');
  };
  const result = prUpdate(
    ['test-loom', '--pr=99', `--body-file=${bodyFile}`],
    { projectsRoot, ghRunner },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('gh-failed');
});

// ---------- prComments tests ----------

test('prComments: fetches via gh and returns structured output', () => {
  setupProjectWithCheckins(['01']);
  const ghRunner = () =>
    JSON.stringify({
      headRefName: 'loom-cli/test-branch',
      comments: [
        { id: 1, author: { login: 'alice' }, body: 'looks good', createdAt: '2026-05-15T10:00:00Z' },
        { id: 2, author: { login: 'bob' }, body: 'one thing', createdAt: '2026-05-15T11:00:00Z' },
      ],
    });
  const result = prComments(['test-loom', '--pr=42'], { projectsRoot, ghRunner });
  expect(result.exitCode).toBe(0);
  const out = JSON.parse(result.stdout as string);
  expect(out.pr).toBe(42);
  expect(out.branch).toBe('loom-cli/test-branch');
  expect(out.comments).toHaveLength(2);
});

test('prComments: missing --pr returns missing-args', () => {
  setupProjectWithCheckins(['01']);
  const result = prComments(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('prComments: gh failure surfaces as gh-failed', () => {
  setupProjectWithCheckins(['01']);
  const ghRunner = () => { throw new Error('gh: not found'); };
  const result = prComments(['test-loom', '--pr=99'], { projectsRoot, ghRunner });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('gh-failed');
});

// ---------- prRespond tests ----------

test('prRespond: writes one file per response under checkins/<branch>/responses/', () => {
  setupProjectWithCheckins(['01']);
  const responsesFile = join(projectsRoot, 'responses.json');
  writeFileSync(
    responsesFile,
    JSON.stringify({
      pr: 42,
      branch: 'loom-cli/test-branch',
      responses: [
        { comment_id: 1, body: 'Acknowledged, will fix' },
        { comment_id: 2, body: 'Disagree — see X' },
      ],
    }),
    'utf8',
  );
  const result = prRespond(
    ['test-loom', `--responses-file=${responsesFile}`],
    { projectsRoot },
  );
  expect(result.exitCode).toBe(0);
  const out = JSON.parse(result.stdout as string);
  expect(out.paths).toHaveLength(2);
  // Both files exist
  expect(out.paths[0]).toContain('checkins/loom-cli/test-branch/responses');
  // Re-read first file
  const written = JSON.parse(readFileSync(out.paths[0], 'utf8'));
  expect(written.comment_id).toBe(1);
  expect(written.body).toBe('Acknowledged, will fix');
});

test('prRespond: advances to next number when responses already exist', () => {
  setupProjectWithCheckins(['01']);
  const responsesFile = join(projectsRoot, 'responses.json');
  // First batch
  writeFileSync(
    responsesFile,
    JSON.stringify({
      pr: 42,
      branch: 'loom-cli/test-branch',
      responses: [{ comment_id: 1, body: 'first' }],
    }),
    'utf8',
  );
  const first = prRespond(
    ['test-loom', `--responses-file=${responsesFile}`],
    { projectsRoot },
  );
  expect(first.exitCode).toBe(0);
  expect((JSON.parse(first.stdout as string).paths[0] as string)).toContain('response-01.json');

  // Second batch — should pick up from 02
  writeFileSync(
    responsesFile,
    JSON.stringify({
      pr: 42,
      branch: 'loom-cli/test-branch',
      responses: [{ comment_id: 2, body: 'second' }],
    }),
    'utf8',
  );
  const second = prRespond(
    ['test-loom', `--responses-file=${responsesFile}`],
    { projectsRoot },
  );
  expect(second.exitCode).toBe(0);
  expect((JSON.parse(second.stdout as string).paths[0] as string)).toContain('response-02.json');
});

test('prRespond: missing --responses-file returns missing-args', () => {
  setupProjectWithCheckins(['01']);
  const result = prRespond(['test-loom'], { projectsRoot });
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('missing-args');
});

test('prRespond: malformed responses-file returns invalid-responses-file', () => {
  setupProjectWithCheckins(['01']);
  const responsesFile = join(projectsRoot, 'bad-responses.json');
  writeFileSync(responsesFile, JSON.stringify({ pr: 42 }), 'utf8'); // no branch, no responses
  const result = prRespond(
    ['test-loom', `--responses-file=${responsesFile}`],
    { projectsRoot },
  );
  expect(result.exitCode).toBe(1);
  expect(JSON.parse(result.stderr as string).error).toBe('invalid-responses-file');
});
