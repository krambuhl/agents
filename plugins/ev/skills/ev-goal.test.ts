import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// ev-goal is the autonomous "human-on-call" driver (ADR-0009): the
// stage-4 sibling of /ev-run that reuses the ev-loop-* bodies but drives
// phase after phase toward a goal predicate, re-entering on the
// PR-activity wake and escalating via AskUserQuestion only when the
// auto-mode panel posture exhausts its budget. These assertions lock the
// load-bearing claims of the SKILL.md so a careless rewrite can't quietly
// turn it into a second router, a forked loop body, or a silent-default
// auto-pilot. \s+ tolerates the SKILL.md soft line-wrapping mid-phrase.

const SKILLS_DIR = dirname(fileURLToPath(import.meta.url));
const EV_GOAL = readFileSync(join(SKILLS_DIR, 'ev-goal', 'SKILL.md'), 'utf8');

describe('ev-goal frontmatter', () => {
  test('is user-invocable and model-invocation-disabled, like the router', () => {
    expect(EV_GOAL).toMatch(/name:\s*ev-goal/);
    expect(EV_GOAL).toMatch(/user-invocable:\s*true/);
    expect(EV_GOAL).toMatch(/disable-model-invocation:\s*true/);
  });

  test('declares the Skill, AskUserQuestion, and loom/guild/griot tools', () => {
    const tools = EV_GOAL.match(/allowed-tools:.*/)?.[0] ?? '';
    expect(tools).toContain('Skill');
    expect(tools).toContain('AskUserQuestion');
    expect(tools).toContain('Bash(loom *)');
  });

  test('the argument hint carries the --until predicate', () => {
    expect(EV_GOAL).toMatch(/argument-hint:.*--until=/);
  });
});

describe('ev-goal reuses the bodies, never forks them', () => {
  test('cites /ev-run sections rather than reimplementing them', () => {
    expect(EV_GOAL).toMatch(/Relationship to \/ev-run/);
    // The next-phase policy is single-sourced in /ev-run § 3 (tolerate
    // the backtick + apostrophe between "ev-run" and the section mark).
    expect(EV_GOAL).toMatch(/ev-run[^\n]{0,6}§ ?3/);
  });

  test('dispatches the existing loop bodies, not new work steps', () => {
    expect(EV_GOAL).toMatch(/ev-loop-interactive/);
    expect(EV_GOAL).toMatch(/ev-loop-confidence/);
    expect(EV_GOAL).toMatch(/[Ss]ame bodies, never forked/);
  });
});

describe('ev-goal control posture', () => {
  test('drives to a goal predicate and archives, instead of parking like /ev-run', () => {
    expect(EV_GOAL).toMatch(/goal predicate/);
    expect(EV_GOAL).toMatch(/all-merged/);
    expect(EV_GOAL).toMatch(/loom-archive/);
  });

  test('re-enters on the PR-activity wake and re-derives PR state via discover', () => {
    expect(EV_GOAL).toMatch(/wake/);
    expect(EV_GOAL).toMatch(/loom pr discover/);
  });

  test('implies auto-mode and escalates only via AskUserQuestion on budget exhaust', () => {
    expect(EV_GOAL).toMatch(/--mode=auto/);
    expect(EV_GOAL).toMatch(/AskUserQuestion/);
    expect(EV_GOAL).toMatch(/budget/);
    // v1 has exactly one escalation channel — no Slack/push round-trip.
    // (the SKILL bolds "only", so don't anchor on a bare word boundary.)
    expect(EV_GOAL).toMatch(/escalation channel in v1/);
  });

  test('escalates rather than silently defaulting on an unresolved decision', () => {
    expect(EV_GOAL).toMatch(/[Ee]scalate, don['’]t guess/);
  });
});

describe('ev-goal emits the goal-loop-* driver events', () => {
  for (const event of [
    'goal-loop-entered',
    'goal-loop-iteration',
    'goal-loop-converged',
    'goal-loop-escalated',
  ]) {
    test(`documents ${event}`, () => {
      expect(EV_GOAL).toContain(event);
    });
  }

  test('emits them through loom events append (bare command)', () => {
    expect(EV_GOAL).toMatch(/loom events append/);
    expect(EV_GOAL).not.toMatch(/bin\/loom events append/);
  });
});
