import { test, expect } from 'vitest';
import { parseAndAggregateVerb } from './parse-and-aggregate.ts';
import type { GuildCliContext } from './index.ts';

function ctx(stdin: string): GuildCliContext {
  return { cwd: '/tmp', stdin };
}

function approvedOutput(): string {
  return `Some pre-amble that the evaluator might emit.

VERDICT: approved

Summary: everything checked out.
`;
}

function flaggedOutput(reasons: string[], remedies: string[] = []): string {
  const reasonLines = reasons.map((r) => `- ${r}`).join('\n');
  const remedyLines =
    remedies.length > 0
      ? `\nSuggested remedies:\n${remedies.map((r) => `- ${r}`).join('\n')}\n`
      : '';
  return `VERDICT: flagged

Reasons:
${reasonLines}
${remedyLines}`;
}

function approvedWithAdvisory(advisories: string[]): string {
  return `VERDICT: approved

Summary: looks good, with notes.

Advisory notes:
${advisories.map((a) => `- ${a}`).join('\n')}
`;
}

function approvedWithChecks(): string {
  return `VERDICT: approved

Summary: verified.

Checks:
- criterion 1: met (evidence: x)
- Disqualifiers: none fired
`;
}

test('empty stdin fails informatively', () => {
  const res = parseAndAggregateVerb([], ctx(''));
  expect(res.exitCode).toBe(1);
  expect(res.stderr).toMatch(/empty input on stdin/);
});

test('non-JSON input fails with parse error', () => {
  const res = parseAndAggregateVerb([], ctx('{not json'));
  expect(res.exitCode).toBe(1);
  expect(res.stderr).toMatch(/JSON parse error/);
});

test('non-array input fails with shape error', () => {
  const res = parseAndAggregateVerb([], ctx('{"agent": "x", "output": "y"}'));
  expect(res.exitCode).toBe(1);
  expect(res.stderr).toMatch(/must be a JSON array/);
});

test('entry missing agent field fails', () => {
  const res = parseAndAggregateVerb([], ctx('[{"output": "x"}]'));
  expect(res.exitCode).toBe(1);
  expect(res.stderr).toMatch(/entry \[0\] must have a string `agent` field/);
});

test('entry missing output field fails', () => {
  const res = parseAndAggregateVerb([], ctx('[{"agent": "x"}]'));
  expect(res.exitCode).toBe(1);
  expect(res.stderr).toMatch(/entry \[0\] must have a string `output` field/);
});

test('single approved evaluator → verdict approved, all empty', () => {
  const input = JSON.stringify([
    { agent: 'evaluator-contract-fit', output: approvedOutput() },
  ]);
  const res = parseAndAggregateVerb([], ctx(input));
  expect(res.exitCode).toBe(0);
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('approved');
  expect(result.blocking_findings).toEqual([]);
  expect(result.advisory_findings).toEqual([]);
  expect(result.cli_runs).toEqual([]);
  expect(result.conflicts).toEqual([]);
});

test('approved evaluator with an Advisory notes section → verdict approved, advisory surfaced', () => {
  const output = approvedWithAdvisory([
    'naming-overloaded: `FileReader` is a common type name; watch for collisions',
  ]);
  const input = JSON.stringify([{ agent: 'evaluator-naming', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  expect(res.exitCode).toBe(0);
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('approved');
  expect(result.blocking_findings).toEqual([]);
  expect(result.advisory_findings.length).toBe(1);
  expect(result.advisory_findings[0].code).toBe('naming-overloaded');
  expect(result.advisory_findings[0].evidence).toMatch(/common type name/);
});

test('approved with multiple un-prefixed advisory bullets → all surfaced as advisory', () => {
  const output = approvedWithAdvisory([
    'the stderr disjunct is redundant but harmless',
    'consider a per-file independence test later',
  ]);
  const input = JSON.stringify([{ agent: 'evaluator-x', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('approved');
  expect(result.advisory_findings.length).toBe(2);
  expect(result.advisory_findings.every((f: { code: string }) => f.code === 'criterion-unmet')).toBe(true);
  expect(result.blocking_findings).toEqual([]);
});

test('approved advisory section: a prefixed bullet and an un-prefixed bullet are parsed independently', () => {
  // Per-bullet code extraction must not bleed across siblings: one bullet
  // with a kebab-code prefix keeps its code; a bare bullet beside it falls
  // back to criterion-unmet. (Surfaced as an advisory by this very feature
  // during its own review.)
  const output = approvedWithAdvisory([
    'naming-overloaded: a common type name',
    'just a plain prose note with no code',
  ]);
  const input = JSON.stringify([{ agent: 'evaluator-x', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('approved');
  expect(result.advisory_findings.map((f: { code: string }) => f.code)).toEqual([
    'naming-overloaded',
    'criterion-unmet',
  ]);
});

test('approved with a Checks section (bullets) → Checks are NOT mistaken for advisories', () => {
  const input = JSON.stringify([{ agent: 'evaluator-x', output: approvedWithChecks() }]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('approved');
  expect(result.advisory_findings).toEqual([]);
});

test('single flagged evaluator with one reason → blocking finding emitted', () => {
  const output = flaggedOutput(['criterion-unmet: the test for X failed because Y']);
  const input = JSON.stringify([{ agent: 'evaluator-contract-fit', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  expect(res.exitCode).toBe(0);
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('flagged');
  expect(result.blocking_findings.length).toBe(1);
  expect(result.blocking_findings[0].evaluator).toBe('evaluator-contract-fit');
  expect(result.blocking_findings[0].code).toBe('criterion-unmet');
  expect(result.blocking_findings[0].evidence).toMatch(/the test for X failed because Y/);
  expect(result.advisory_findings.length).toBe(0);
});

test('reason with explicit BLOCKING: prefix routes to blocking', () => {
  const output = flaggedOutput(['BLOCKING: rules-violation: lint failed on src/foo.ts']);
  const input = JSON.stringify([{ agent: 'evaluator-x', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  expect(res.exitCode).toBe(0);
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('flagged');
  expect(result.blocking_findings.length).toBe(1);
  expect(result.blocking_findings[0].code).toBe('rules-violation');
});

test('reason with explicit ADVISORY: prefix routes to advisory (verdict approved if no blocking)', () => {
  const output = flaggedOutput(['ADVISORY: scope-creep: unrelated whitespace change']);
  const input = JSON.stringify([{ agent: 'evaluator-x', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  expect(res.exitCode).toBe(0);
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('approved');
  expect(result.advisory_findings.length).toBe(1);
  expect(result.advisory_findings[0].code).toBe('scope-creep');
  expect(result.blocking_findings.length).toBe(0);
});

test('reason without code prefix defaults to criterion-unmet', () => {
  const output = flaggedOutput(['the artifact does not satisfy the contract because of reasons']);
  const input = JSON.stringify([{ agent: 'evaluator-x', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  expect(res.exitCode).toBe(0);
  const result = JSON.parse(res.stdout as string);
  expect(result.blocking_findings[0].code).toBe('criterion-unmet');
  expect(result.blocking_findings[0].evidence).toMatch(/the artifact does not satisfy/);
});

test('reason with backtick-wrapped code and parenthetical context extracted correctly', () => {
  const output = flaggedOutput([
    '`disqualifier-fired` ("Hardcoded CONVENTIONS data without runtime read attempt"): autoload.ts never reads CONVENTIONS.md',
  ]);
  const input = JSON.stringify([{ agent: 'evaluator-x', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  expect(res.exitCode).toBe(0);
  const result = JSON.parse(res.stdout as string);
  expect(result.blocking_findings[0].code).toBe('disqualifier-fired');
  expect(result.blocking_findings[0].evidence).toMatch(/autoload\.ts never reads CONVENTIONS\.md/);
});

test('missing VERDICT line → parse-failure blocking finding', () => {
  const input = JSON.stringify([
    { agent: 'evaluator-x', output: 'this output has no verdict line at all' },
  ]);
  const res = parseAndAggregateVerb([], ctx(input));
  expect(res.exitCode).toBe(0);
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('flagged');
  expect(result.blocking_findings.length).toBe(1);
  expect(result.blocking_findings[0].code).toBe('parse-failure');
});

test('multiple evaluators mixed (one approved, one flagged) → aggregated correctly', () => {
  const input = JSON.stringify([
    { agent: 'evaluator-a', output: approvedOutput() },
    {
      agent: 'evaluator-b',
      output: flaggedOutput(['criterion-unmet: a thing'], ['fix the thing']),
    },
  ]);
  const res = parseAndAggregateVerb([], ctx(input));
  expect(res.exitCode).toBe(0);
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('flagged');
  expect(result.blocking_findings.length).toBe(1);
  expect(result.blocking_findings[0].evaluator).toBe('evaluator-b');
  expect(result.blocking_findings[0].remedy).toBe('fix the thing');
});

test('suggested remedies pair with reasons by index', () => {
  const output = flaggedOutput(
    ['criterion-unmet: first reason', 'criterion-unmet: second reason'],
    ['remedy for first', 'remedy for second'],
  );
  const input = JSON.stringify([{ agent: 'evaluator-x', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  expect(res.exitCode).toBe(0);
  const result = JSON.parse(res.stdout as string);
  expect(result.blocking_findings.length).toBe(2);
  expect(result.blocking_findings[0].remedy).toBe('remedy for first');
  expect(result.blocking_findings[1].remedy).toBe('remedy for second');
});

test('output shape locked: all six fields present even when result is approved', () => {
  const input = JSON.stringify([{ agent: 'x', output: approvedOutput() }]);
  const res = parseAndAggregateVerb([], ctx(input));
  expect(res.exitCode).toBe(0);
  const result = JSON.parse(res.stdout as string);
  expect(result).toHaveProperty('verdict');
  expect(result).toHaveProperty('blocking_findings');
  expect(result).toHaveProperty('advisory_findings');
  expect(result).toHaveProperty('cli_runs');
  expect(result).toHaveProperty('conflicts');
  expect(result).toHaveProperty('agent_signals');
  // One signal per agent — even a plainly-gated one, so a consumer can read
  // every agent's confidence. No Confidence line → null.
  expect(result.agent_signals).toEqual([
    { agent: 'x', confidence: null, outcome: 'gated', reason: null },
  ]);
});

test('single recused evaluator → verdict approved, recusal surfaced as an agent_signal, no findings', () => {
  const output = `VERDICT: recused

Reason: no JSX artifacts in this unit — react rubric does not apply.
`;
  const input = JSON.stringify([{ agent: 'evaluator-react', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  expect(res.exitCode).toBe(0);
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('approved');
  expect(result.blocking_findings).toEqual([]);
  expect(result.advisory_findings).toEqual([]);
  expect(result.agent_signals).toHaveLength(1);
  expect(result.agent_signals[0].agent).toBe('evaluator-react');
  expect(result.agent_signals[0].outcome).toBe('recused');
  expect(result.agent_signals[0].reason).toMatch(/no JSX artifacts/);
});

test('recused with a Reasons: bullet block extracts the first bullet', () => {
  const output = `VERDICT: recused

Reasons:
- domain non-applicable: no CSS modules in scope
`;
  const input = JSON.stringify([{ agent: 'evaluator-tokens', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse((res.stdout as string));
  expect(result.agent_signals[0].outcome).toBe('recused');
  expect(result.agent_signals[0].reason).toBe('domain non-applicable: no CSS modules in scope');
});

test('recused with no reason → null reason, still surfaced as a recused signal', () => {
  const input = JSON.stringify([{ agent: 'evaluator-a11y', output: 'VERDICT: recused' }]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse(res.stdout as string);
  expect(result.agent_signals).toHaveLength(1);
  expect(result.agent_signals[0].outcome).toBe('recused');
  expect(result.agent_signals[0].reason).toBeNull();
});

test('mixed panel: recused + flagged → recused signal and blocking both surface, verdict flagged', () => {
  const recused = `VERDICT: recused\n\nReason: not applicable here.`;
  const input = JSON.stringify([
    { agent: 'evaluator-react', output: recused },
    { agent: 'evaluator-contract-fit', output: flaggedOutput(['criterion-unmet: a thing']) },
  ]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('flagged');
  expect(result.blocking_findings).toHaveLength(1);
  // Both agents get a signal; the react one is recused.
  expect(result.agent_signals).toHaveLength(2);
  const react = result.agent_signals.find(
    (s: { agent: string }) => s.agent === 'evaluator-react',
  );
  expect(react.outcome).toBe('recused');
});

test('recused does NOT gate: recused + approved → verdict approved', () => {
  const recused = `VERDICT: recused\n\nReason: n/a`;
  const input = JSON.stringify([
    { agent: 'evaluator-react', output: recused },
    { agent: 'evaluator-contract-fit', output: approvedOutput() },
  ]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('approved');
  expect(result.agent_signals).toHaveLength(2);
  expect(
    result.agent_signals.filter(
      (s: { outcome: string }) => s.outcome === 'recused',
    ),
  ).toHaveLength(1);
});

// --- Confidence signal (Unit 2) ---

test('confidence enum parsed per agent (high/medium/low), case-insensitive', () => {
  const mk = (level: string) =>
    `VERDICT: approved\nConfidence: ${level}\n\nSummary: ok.`;
  const input = JSON.stringify([
    { agent: 'a', output: mk('high') },
    { agent: 'b', output: mk('Medium') },
    { agent: 'c', output: mk('LOW') },
  ]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse(res.stdout as string);
  expect(
    result.agent_signals.map((s: { confidence: string | null }) => s.confidence),
  ).toEqual(['high', 'medium', 'low']);
});

test('confidence absent → null', () => {
  const input = JSON.stringify([{ agent: 'a', output: approvedOutput() }]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse(res.stdout as string);
  expect(result.agent_signals[0].confidence).toBeNull();
});

test('confidence rides on a flagged agent too (outcome stays gated)', () => {
  const output = `VERDICT: flagged\nConfidence: low\n\nReasons:\n- criterion-unmet: a thing`;
  const input = JSON.stringify([{ agent: 'a', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('flagged');
  expect(result.agent_signals[0].confidence).toBe('low');
  expect(result.agent_signals[0].outcome).toBe('gated');
});

// --- operator-judgment-required (Unit 2) ---

test('reviewer operator-judgment-required → operator-judgment outcome, reason from Escalation, no findings', () => {
  const output = `VERDICT: operator-judgment-required
Confidence: medium

Escalation: two acceptance criteria conflict and the contract does not say which wins.`;
  const input = JSON.stringify([{ agent: 'evaluator-contract-fit', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('operator-judgment-required');
  expect(result.blocking_findings).toEqual([]);
  expect(result.agent_signals[0].outcome).toBe('operator-judgment');
  expect(result.agent_signals[0].confidence).toBe('medium');
  expect(result.agent_signals[0].reason).toMatch(/two acceptance criteria conflict/);
});

test('a bare Escalation line escalates even without the verdict token (write-phase wire format)', () => {
  const output = `Escalation: dependency this unit cannot satisfy without an operator decision.`;
  const input = JSON.stringify([{ agent: 'implementer-x', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('operator-judgment-required');
  expect(result.agent_signals[0].outcome).toBe('operator-judgment');
  expect(result.agent_signals[0].reason).toMatch(/dependency this unit cannot satisfy/);
  // No Confidence line on this write-phase shape → confidence stays null.
  expect(result.agent_signals[0].confidence).toBeNull();
});

test('Escalation dominates a contradictory verdict line', () => {
  const output = `VERDICT: approved\n\nEscalation: I am not actually sure — a human should decide.`;
  const input = JSON.stringify([{ agent: 'a', output }]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('operator-judgment-required');
  expect(result.agent_signals[0].outcome).toBe('operator-judgment');
  // The verdict line said approved but carried no Confidence line → null.
  expect(result.agent_signals[0].confidence).toBeNull();
});

test('precedence: operator-judgment-required outranks flagged (blocking still surfaces)', () => {
  const escalated = `VERDICT: operator-judgment-required\n\nEscalation: cannot decide.`;
  const flagged = flaggedOutput(['criterion-unmet: a real blocking thing']);
  const input = JSON.stringify([
    { agent: 'evaluator-a', output: flagged },
    { agent: 'evaluator-b', output: escalated },
  ]);
  const res = parseAndAggregateVerb([], ctx(input));
  const result = JSON.parse(res.stdout as string);
  expect(result.verdict).toBe('operator-judgment-required');
  expect(result.blocking_findings).toHaveLength(1);
});

test('schema round-trips: every Result field present and JSON-stable for a mixed panel', () => {
  const input = JSON.stringify([
    { agent: 'evaluator-a', output: `VERDICT: approved\nConfidence: high\n\nSummary: ok.` },
    { agent: 'evaluator-b', output: `VERDICT: recused\n\nReason: n/a` },
    { agent: 'evaluator-c', output: `VERDICT: operator-judgment-required\n\nEscalation: human needed.` },
  ]);
  const res = parseAndAggregateVerb([], ctx(input));
  expect(res.exitCode).toBe(0);
  const result = JSON.parse(res.stdout as string);
  // Round-trip: re-stringify and re-parse yields the same object.
  expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  expect(Object.keys(result).sort()).toEqual([
    'advisory_findings',
    'agent_signals',
    'blocking_findings',
    'cli_runs',
    'conflicts',
    'verdict',
  ]);
  expect(result.agent_signals).toHaveLength(3);
  expect(result.verdict).toBe('operator-judgment-required');
});
