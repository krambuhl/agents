import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
 * The scripts need jq. If it is missing the suite is skipped rather than
 * failed, since the hooks themselves degrade the same way at runtime.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const HOOKS = join(REPO_ROOT, 'plugins', 'commons', 'hooks');
const LOG_SCRIPT = join(HOOKS, 'log-skill-activation.sh');
const GATE_SCRIPT = join(HOOKS, 'require-judge.sh');

const hasJq = spawnSync('jq', ['--version']).status === 0;
const describeIfJq = hasJq ? describe : describe.skip;

let dir: string;
let log: string;

function run(script: string, event: object, env: Record<string, string> = {}) {
  const res = spawnSync('bash', [script], {
    input: JSON.stringify(event),
    env: { ...process.env, SKILL_LOG: log, ...env },
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

const judgeRun = (session = 's1') => ({
  hook_event_name: 'PostToolUse',
  session_id: session,
  tool_name: 'Agent',
  tool_input: { subagent_type: 'commons:writing-judge', prompt: 'judge this' },
});

const bash = (command: string, session = 's1') => ({
  session_id: session,
  tool_name: 'Bash',
  tool_input: { command },
});

describeIfJq('commons hooks: activation log', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'commons-hooks-'));
    log = join(dir, 'log.jsonl');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('logs a skill activation with the namespace stripped', () => {
    expect(
      logIt({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Skill', tool_input: { skill: 'commons:write-as-me' } }),
    ).toBe(0);
    expect(entries()).toMatchObject([{ session: 's1', skill: 'write-as-me', via: 'PostToolUse' }]);
  });

  test('logs a writing-judge subagent run and ignores other subagents', () => {
    expect(logIt(judgeRun())).toBe(0);
    expect(
      logIt({ hook_event_name: 'PostToolUse', session_id: 's1', tool_name: 'Agent', tool_input: { subagent_type: 'Explore', prompt: 'x' } }),
    ).toBe(0);
    expect(entries().map((e) => e.skill)).toEqual(['writing-judge']);
  });

  test('logs a typed /name from the prompt', () => {
    expect(logIt({ hook_event_name: 'UserPromptSubmit', session_id: 's1', prompt: '/pr-comments 42' })).toBe(0);
    expect(entries()).toMatchObject([{ skill: 'pr-comments', via: 'UserPromptSubmit' }]);
  });
});

describeIfJq('commons hooks: write-as-me gate', () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'commons-hooks-'));
    log = join(dir, 'log.jsonl');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test('lets non-shipping calls through without a judge run', () => {
    expect(gate(bash('git status && git diff'))).toBe(0);
    expect(gate(bash('gh api repos/o/r/pulls/1/comments'))).toBe(0);
    expect(gate(bash('gh pr view 12 --json number'))).toBe(0);
    expect(gate({ session_id: 's1', tool_name: 'Read', tool_input: { file_path: 'x.ts' } })).toBe(0);
    expect(gate({ session_id: 's1', tool_name: 'mcp__github__pull_request_read', tool_input: {} })).toBe(0);
  });

  test('blocks shipping calls until a judge run exists, with a message that names the fix', () => {
    const blocked = run(GATE_SCRIPT, bash('git add -A && git commit -m x'));
    expect(blocked.code).toBe(2);
    expect(blocked.stderr).toMatch(/write-as-me/);
    expect(blocked.stderr).toMatch(/writing-judge/);
    expect(gate(bash('gh pr create --title t --body b'))).toBe(2);
    expect(gate(bash('gh pr comment 1 --body hi'))).toBe(2);
    expect(gate(bash('gh stack submit'))).toBe(2);
    expect(gate(bash('gh api -X POST repos/o/r/issues/1/comments -f body=hi'))).toBe(2);
    expect(gate({ session_id: 's1', tool_name: 'mcp__github__create_pull_request', tool_input: {} })).toBe(2);
    expect(gate({ session_id: 's1', tool_name: 'mcp__github__add_issue_comment', tool_input: {} })).toBe(2);
  });

  test('one judge loop covers one shipped text, then the next text needs its own', () => {
    logIt(judgeRun());
    logIt(judgeRun()); // a second round of the same loop
    expect(gate(bash('git commit -m first'))).toBe(0);
    expect(entries().filter((e) => e.skill === 'judge-consumed')).toHaveLength(1);
    expect(gate(bash('git commit -m second'))).toBe(2);
    logIt(judgeRun());
    expect(gate(bash('git commit -m second'))).toBe(0);
  });

  test('judge runs are scoped to the session', () => {
    logIt(judgeRun('s1'));
    expect(gate(bash('git commit -m x', 's2'))).toBe(2);
    expect(gate(bash('git commit -m x', 's1'))).toBe(0);
  });

  test('an edit that adds comment lines to a source file ships text; other edits do not', () => {
    const edit = (file_path: string, old_string: string, new_string: string) => ({
      session_id: 's1',
      tool_name: 'Edit',
      tool_input: { file_path, old_string, new_string },
    });
    expect(gate(edit('src/a.ts', 'x = 1', 'x = 2'))).toBe(0);
    expect(gate(edit('src/a.ts', '// keep\nx = 1', '// keep\nx = 2'))).toBe(0);
    expect(gate(edit('src/a.ts', 'x = 1', '// why\nx = 1'))).toBe(2);
    expect(gate(edit('notes.md', 'a', '# heading\nb'))).toBe(0);
    expect(gate({ session_id: 's1', tool_name: 'Write', tool_input: { file_path: 'run.sh', content: '#!/bin/bash\necho hi' } })).toBe(0);
    expect(gate({ session_id: 's1', tool_name: 'Write', tool_input: { file_path: 'a.py', content: '# adds up\nx = 1' } })).toBe(2);
  });

  test('WRITE_AS_ME_GATE=off disables the gate', () => {
    expect(gate(bash('git commit -m x'), { WRITE_AS_ME_GATE: 'off' })).toBe(0);
  });
});
