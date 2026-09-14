import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

/**
 * Behavioral tests for the commons hook scripts. `plugin-hooks.test.ts`
 * proves the wiring (hooks.json parses, scripts exist and are executable);
 * this proves the scripts do what the skills promise: every writing-judge
 * run is logged, and a call that ships text under the engineer's name is
 * blocked until a judge run in the same session covers it, one loop per
 * shipped text.
 *
 * The scripts need jq. Locally the suite is skipped without it, since the
 * hooks degrade the same way at runtime. In CI a missing jq is a failure,
 * so coverage cannot vanish silently when the runner image changes.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS = join(REPO_ROOT, 'plugins', 'commons', 'hooks');
const LOG_SCRIPT = join(HOOKS, 'log-skill-activation.sh');
const GATE_SCRIPT = join(HOOKS, 'require-judge.sh');

const hasJq = spawnSync('jq', ['--version']).status === 0;
if (!hasJq && process.env.CI) throw new Error('jq is required to test the commons hooks in CI');
const describeIfJq = hasJq ? describe : describe.skip;

let dir: string;
let log: string;

function run(script: string, event: object, env: Record<string, string> = {}) {
  const res = spawnSync('bash', [script], {
    input: JSON.stringify(event),
    env: { ...process.env, SKILL_LOG: log, WRITE_AS_ME_GATE: 'on', ...env },
    encoding: 'utf8',
  });
  return { code: res.status, stderr: res.stderr };
}

const gate = (event: object, env?: Record<string, string>) => run(GATE_SCRIPT, event, env).code;
const logIt = (event: object) => run(LOG_SCRIPT, event).code;

function entries(): Array<Record<string, unknown>> {
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

const judgeRun = (session = 's1', tool = 'Agent', subagent = 'commons:writing-judge') => ({
  hook_event_name: 'PostToolUse',
  session_id: session,
  tool_name: tool,
  tool_input: { subagent_type: subagent, prompt: 'judge this' },
});

const bash = (command: string, session = 's1') => ({ session_id: session, tool_name: 'Bash', tool_input: { command } });
const edit = (file_path: string, old_string: string, new_string: string) => ({
  session_id: 's1',
  tool_name: 'Edit',
  tool_input: { file_path, old_string, new_string },
});
const write = (file_path: string, content: string) => ({ session_id: 's1', tool_name: 'Write', tool_input: { file_path, content } });
const mcp = (tool_name: string, tool_input: object = {}) => ({ session_id: 's1', tool_name, tool_input });

describeIfJq('commons hooks: activation log', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'commons-hooks-'));
    log = join(dir, 'log.jsonl');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('logs a skill activation with the namespace stripped', () => {
    expect(logIt({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Skill', tool_input: { skill: 'commons:write-as-me' } })).toBe(0);
    expect(entries()).toMatchObject([{ session: 's1', skill: 'write-as-me', via: 'PostToolUse' }]);
  });

  test('logs a writing-judge run from Agent or Task, qualified or bare, and ignores other subagents', () => {
    expect(logIt(judgeRun('s1', 'Agent', 'commons:writing-judge'))).toBe(0);
    expect(logIt(judgeRun('s1', 'Task', 'writing-judge'))).toBe(0);
    expect(logIt(judgeRun('s1', 'Agent', 'Explore'))).toBe(0);
    expect(entries().map((e) => e.skill)).toEqual(['writing-judge', 'writing-judge']);
  });

  test('logs a typed /name from the prompt', () => {
    expect(logIt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: '/pr-comments 42' })).toBe(0);
    expect(entries()).toMatchObject([{ skill: 'pr-comments', via: 'UserPromptSubmit' }]);
  });
});

describeIfJq('commons hooks: write-as-me gate, what ships text', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'commons-hooks-'));
    log = join(dir, 'log.jsonl');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('reads and plain code changes pass', () => {
    for (const cmd of [
      'git status && git diff',
      'git push -u origin main',
      'git log --grep commit',
      'gh pr view 12 --json number',
      'gh pr checks 12',
      'gh api repos/o/r/pulls/1/comments',
      'gh api -X GET repos/o/r/pulls/1/comments -F per_page=100',
      "gh api repos/o/r/issues/1/comments --paginate --jq '.[].body' -F per_page=100",
      "gh api graphql -f query='query { repository(owner:\"o\", name:\"r\") { pullRequest(number:1) { reviewThreads(first:100) { nodes { isResolved comments(first:10) { nodes { body } } } } } } }'",
      'gh api -X DELETE repos/o/r/issues/comments/5',
      'gh pr review 1 --approve',
      'gh pr merge 1 --squash',
      'git commit --amend --no-edit',
      'git commit-tree HEAD^{tree} -p HEAD',
    ]) {
      expect(gate(bash(cmd)), cmd).toBe(0);
    }
    expect(gate(mcp('mcp__github__pull_request_read'))).toBe(0);
    expect(gate(mcp('mcp__github__pull_request_review_write', { method: 'create' }))).toBe(0);
    expect(gate({ session_id: 's1', tool_name: 'Read', tool_input: { file_path: 'x.ts' } })).toBe(0);
  });

  test('shipping calls are blocked with a message that names the fix and not the off switch', () => {
    const blocked = run(GATE_SCRIPT, bash('git add -A && git commit -m x'));
    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toMatch(/write-as-me/);
    expect(blocked.stderr).toMatch(/writing-judge/);
    expect(blocked.stderr).not.toMatch(/WRITE_AS_ME_GATE/);
    for (const cmd of [
      'git commit -m x',
      'git -C /repo commit -m x',
      'git -c user.name=x commit -m x',
      "bash -c 'git commit -m x'",
      'env GIT_AUTHOR_NAME=x git commit -m y',
      'command git commit -m x',
      '\\git commit -m x',
      'git   commit -m x',
      'for p in 1 2; do gh pr comment $p --body hi; done',
      'if true; then gh pr comment 1 --body hi; fi',
      'xargs -I{} gh pr comment {} --body hi',
      'git merge feature -m "merge feature"',
      'git tag -a v1 -m "release"',
      'gh pr create --title t --body b',
      'gh pr edit 1 --body b',
      'gh pr comment 1 --body-file f.md',
      'gh pr review 1 --comment -b "looks off"',
      'gh pr review 1 --approve --body "ship it"',
      'gh pr merge 1 --squash --subject "s" --body "b"',
      'gh pr close 1 --comment "closing"',
      'gh issue comment 1 --body hi',
      'gh issue create --title t --body b',
      'gh release create v1 --notes x',
      'gh stack submit',
      'gs stack submit',
      'gh api -X POST repos/o/r/issues/1/comments -f body=hi',
      'gh api -X PATCH repos/o/r/pulls/comments/5 -f body=hi',
      'gh api repos/o/r/issues/1/comments -f body=hi',
      'gh api repos/o/r/pulls/1/reviews --input review.json',
      "gh api graphql -f query='mutation { addComment(input:{subjectId:\"x\", body:\"hi\"}) { clientMutationId } }'",
    ]) {
      expect(gate(bash(cmd)), cmd).toBe(2);
    }
    for (const tool of [
      'mcp__github__create_pull_request',
      'mcp__github__update_pull_request',
      'mcp__github__add_issue_comment',
      'mcp__github__add_reply_to_pull_request_comment',
      'mcp__github__add_comment_to_pending_review',
      'mcp__github__push_files',
      'mcp__github__create_or_update_file',
      'mcp__github__issue_write',
      'mcp__github__merge_pull_request',
    ]) {
      expect(gate(mcp(tool)), tool).toBe(2);
    }
    expect(gate(mcp('mcp__github__pull_request_review_write', { method: 'submit_pending', body: 'lgtm' }))).toBe(2);
  });

  test('an edit that adds a line-leading comment to a source file ships text; other edits do not', () => {
    expect(gate(edit('src/a.ts', 'x = 1', 'x = 2'))).toBe(0);
    expect(gate(edit('src/a.ts', '// keep\nx = 1', '// keep\nx = 2'))).toBe(0);
    expect(gate(edit('src/a.ts', 'x = 1', '// why\nx = 1'))).toBe(2);
    expect(gate(edit('src/a.ts', 'x = 1', '/* why */\nx = 1'))).toBe(2);
    expect(gate(edit('src/a.py', 'x = 1', '# why\nx = 1'))).toBe(2);
    expect(gate(edit('q.sql', 'select 1', '-- why\nselect 1'))).toBe(2);
    expect(gate(edit('notes.md', 'a', '# heading\nb'))).toBe(0);
    expect(gate(edit('Makefile', 'a', '# why\nb'))).toBe(0);
    expect(gate({ session_id: 's1', tool_name: 'MultiEdit', tool_input: { file_path: 'a.ts', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: '// why\nc' }] } })).toBe(2);
    expect(gate({ session_id: 's1', tool_name: 'MultiEdit', tool_input: { edits: [{ old_string: 'c', new_string: '// why\nc' }] } })).toBe(0);
  });

  test('language syntax that only looks like a comment does not ship text', () => {
    expect(gate(edit('a.c', 'int x;', '#include <stdio.h>\nint x;'))).toBe(0);
    expect(gate(edit('a.rs', 'struct A;', '#[derive(Debug)]\nstruct A;'))).toBe(0);
    expect(gate(edit('a.css', 'a {}', '* { box-sizing: border-box; }\n#main { color: red; }\na {}'))).toBe(0);
    expect(gate(edit('a.yml', 'a: 1', '---\na: 1'))).toBe(0);
    expect(gate(edit('a.ts', 'x', 'const y = a\n  * b;\nfunction *gen() {}'))).toBe(0);
    expect(gate(edit('a.sh', 'cmd', 'cmd \\\n  --flag value'))).toBe(0);
    expect(gate(write('run.sh', '#!/bin/bash\necho hi'))).toBe(0);
  });

  test('a Write over an existing file only counts comments that are new', () => {
    const file = join(dir, 'existing.ts');
    writeFileSync(file, '// existing comment\nexport const a = 1;\n');
    expect(gate(write(file, '// existing comment\nexport const a = 2;\n'))).toBe(0);
    expect(gate(write(file, '// existing comment\n// new comment\nexport const a = 2;\n'))).toBe(2);
    expect(gate(write(join(dir, 'fresh.py'), '# adds up\nx = 1'))).toBe(2);
  });
});

describeIfJq('commons hooks: write-as-me gate, judge tokens', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'commons-hooks-'));
    log = join(dir, 'log.jsonl');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('one judge loop covers one shipped text, then the next text needs its own', () => {
    logIt(judgeRun());
    logIt(judgeRun()); // a second round of the same loop
    expect(gate(bash('git commit -m first'))).toBe(0);
    expect(entries().filter((e) => e.skill === 'judge-consumed')).toMatchObject([{ count: 2 }]);
    expect(gate(bash('git commit -m second'))).toBe(2);
    logIt(judgeRun());
    expect(gate(bash('git commit -m second'))).toBe(0);
  });

  test('a read never spends a judge token', () => {
    logIt(judgeRun());
    expect(gate(bash('gh api -X GET repos/o/r/pulls/1/comments -F per_page=100'))).toBe(0);
    expect(gate(bash("gh api graphql -f query='query { x { comments { body } } }'"))).toBe(0);
    expect(entries().filter((e) => e.skill === 'judge-consumed')).toHaveLength(0);
    expect(gate(bash('gh pr comment 1 --body hi'))).toBe(0);
  });

  test('judge runs are scoped to the session', () => {
    logIt(judgeRun('s1'));
    expect(gate(bash('git commit -m x', 's2'))).toBe(2);
    expect(gate(bash('git commit -m x', 's1'))).toBe(0);
  });

  test('legacy consume records without a count, and corrupt lines, do not fail the gate open', () => {
    writeFileSync(
      log,
      [
        JSON.stringify({ session: 's1', skill: 'writing-judge' }),
        JSON.stringify({ session: 's1', skill: 'judge-consumed' }),
        'not json at all',
        JSON.stringify({ session: 's1', skill: 'writing-judge' }),
        JSON.stringify({ session: 's1', skill: 'judge-consumed', count: '1' }),
      ].join('\n') + '\n',
    );
    expect(gate(bash('git commit -m x'))).toBe(2);
    logIt(judgeRun());
    expect(gate(bash('git commit -m x'))).toBe(0);
  });

  test('the off switch accepts the usual spellings', () => {
    for (const v of ['off', '0', 'false', 'no']) {
      expect(gate(bash('git commit -m x'), { WRITE_AS_ME_GATE: v }), v).toBe(0);
    }
    expect(gate(bash('git commit -m x'), { WRITE_AS_ME_GATE: 'on' })).toBe(2);
  });
});
