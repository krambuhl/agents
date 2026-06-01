import type { DispatchResult, GuildCliContext } from './index.ts';

type AgentOutput = { agent: string; output: string };

type Finding = {
  evaluator: string;
  code: string;
  evidence: string;
  remedy: string;
};

type CliRun = {
  evaluator: string;
  command: string;
  passed: boolean;
};

type Conflict = {
  scope: string;
  evaluators: string[];
  findings: Finding[];
};

type Verdict =
  | 'approved'
  | 'flagged'
  | 'flagged-conflict'
  | 'operator-judgment-required';

type Confidence = 'high' | 'medium' | 'low';

// Every spawned agent produces exactly one signal, regardless of verdict.
// `outcome` distinguishes a normal gating verdict (`gated`) from the two
// ways an agent declines to gate: `recused` (domain non-applicable) and
// `operator-judgment` (the agent escalated — a human must decide). This
// generalizes the former `recusals` list: a recusal is now one outcome
// among the per-agent signals, and `confidence` rides on every agent so a
// downstream consumer can compare confidence across the
// implement-verify-fix stages (that comparison is a deferred consumer; the
// signal exists here so it can be built without re-touching this verb).
type AgentOutcome = 'gated' | 'recused' | 'operator-judgment';

export type AgentSignal = {
  agent: string;
  confidence: Confidence | null;
  outcome: AgentOutcome;
  // Recusal rationale or escalation reason; null when the agent gated.
  reason: string | null;
};

type Result = {
  verdict: Verdict;
  blocking_findings: Finding[];
  advisory_findings: Finding[];
  cli_runs: CliRun[];
  conflicts: Conflict[];
  agent_signals: AgentSignal[];
};

class ValidationError extends Error {}

function fail(reason: string): DispatchResult {
  return {
    stderr: `parse-and-aggregate-error: ${reason}`,
    exitCode: 1,
  };
}

function sliceFromHeader(
  output: string,
  headerRe: RegExp,
  endRe: RegExp,
): string {
  const headerMatch = output.match(headerRe);
  if (!headerMatch || headerMatch.index === undefined) return '';
  const start = headerMatch.index + headerMatch[0].length;
  const rest = output.slice(start);
  const endMatch = rest.match(endRe);
  const end = endMatch?.index ?? rest.length;
  return rest.slice(0, end);
}

function findReasonsBlock(output: string): string {
  return sliceFromHeader(
    output,
    /^[\s>]*\*?\*?Reasons\*?\*?:?\s*$/im,
    /^[\s>]*\*?\*?(?:Suggested remedies|Verification|## CLI runs|VERDICT)\b/im,
  );
}

function findRemediesBlock(output: string): string {
  return sliceFromHeader(
    output,
    /^[\s>]*\*?\*?Suggested remedies\*?\*?:?\s*$/im,
    /^[\s>]*\*?\*?(?:## CLI runs|VERDICT)\b/im,
  );
}

// An APPROVED evaluator can still carry non-blocking observations under an
// `Advisory notes:` (or `Advisory:`) section — the same shape as the Flagged
// path's Reasons block, but it does not gate the verdict. Previously these
// were silently dropped because an approved verdict short-circuited to zero
// findings; this lets an evaluator approve AND surface a concern without
// having to mislabel its verdict as `flagged`.
function findAdvisoryBlock(output: string): string {
  return sliceFromHeader(
    output,
    /^[\s>]*\*?\*?Advisory(?:\s+notes)?\*?\*?:?\s*$/im,
    /^[\s>]*\*?\*?(?:Reasons|Suggested remedies|Verification|## CLI runs|VERDICT)\b/im,
  );
}

function extractBullets(block: string): string[] {
  return block
    .split('\n')
    .filter((l) => /^\s*[-*]\s+/.test(l))
    .map((l) => l.replace(/^\s*[-*]\s+/, '').trim())
    .filter((l) => l.length > 0);
}

type ParsedReason = { advisory: boolean; code: string; evidence: string };

function parseReason(text: string): ParsedReason {
  let remaining = text;
  let advisory = false;
  const advisoryMatch = remaining.match(/^ADVISORY:\s*(.+)$/);
  const blockingMatch = remaining.match(/^BLOCKING:\s*(.+)$/);
  if (advisoryMatch) {
    advisory = true;
    remaining = advisoryMatch[1];
  } else if (blockingMatch) {
    remaining = blockingMatch[1];
  }
  // Try to extract a code prefix: optional backticks around a kebab-style
  // identifier, optional parenthetical context, then ":".
  const codeMatch = remaining.match(
    /^`?([a-z][a-z0-9-]*[a-z0-9])`?\s*(?:\([^)]*\))?\s*:\s*(.+)$/i,
  );
  if (codeMatch) {
    return { advisory, code: codeMatch[1], evidence: codeMatch[2].trim() };
  }
  return { advisory, code: 'criterion-unmet', evidence: remaining.trim() };
}

// A recused evaluator states its non-applicability rationale; pull it from an
// explicit "Reason(s):" — either inline text after the colon, or the first
// bullet of the block beneath it. Absent a reason, returns '' (the recusal
// still counts; the rationale is just unstated).
function findRecusalReason(output: string): string {
  // Same-line text after "Reason(s):" only — [^\S\n]* is horizontal
  // whitespace, so a bare "Reasons:" header (text on the next line as a
  // bullet) falls through to the bullet extractor below rather than greedily
  // swallowing the bullet line (and its "- " prefix).
  const inline = output.match(/^[\s>]*\*?\*?Reasons?\*?\*?:[^\S\n]*(\S.*)$/im);
  if (inline) return inline[1].trim();
  const block = sliceFromHeader(
    output,
    /^[\s>]*\*?\*?Reasons?\*?\*?:?\s*$/im,
    /^[\s>]*\*?\*?(?:Suggested remedies|Verification|## CLI runs|VERDICT)\b/im,
  );
  const bullets = extractBullets(block);
  return bullets[0] ?? '';
}

// The structured confidence signal: a three-value enum on its own line.
// Case-insensitive on the level word; null when the agent emitted no line.
function findConfidence(output: string): Confidence | null {
  const m = output.match(
    /^[\s>]*\*?\*?Confidence\*?\*?:\s*`?(high|medium|low)`?\b/im,
  );
  return m ? (m[1].toLowerCase() as Confidence) : null;
}

// The universal escalation signal. Same-line text after "Escalation:" —
// [^\S\n]* is horizontal whitespace only, so a bare "Escalation:" header
// with the reason on the next line returns null rather than swallowing it.
function findEscalationReason(output: string): string | null {
  const m = output.match(
    /^[\s>]*\*?\*?Escalation\*?\*?:[^\S\n]*(\S.*)$/im,
  );
  return m ? m[1].trim() : null;
}

// The shared per-agent signal: confidence + how the agent engaged with its
// gate (`gated` / `recused` / `operator-judgment`), independent of any
// findings. Both the reviewer aggregator (this verb) and the plan aggregator
// (`guild plan append`) read it, so recusal and escalation are observed the
// same way at every phase rather than re-parsed two different ways. An agent
// with no recusal/escalation marker — including one that emitted no VERDICT:
// line at all, such as a plan engineer writing prose — is `gated` by default.
export function computeAgentSignal(agent: string, output: string): AgentSignal {
  const confidence = findConfidence(output);
  const escalationReason = findEscalationReason(output);
  const verdict = output.match(
    /^[\s>]*VERDICT:\s*(approved|flagged|flagged-conflict|recused|operator-judgment-required)\s*$/m,
  )?.[1];

  // Escalation dominates. An agent that escalates is punting to the operator
  // regardless of any verdict line it also emitted. The reviewer's canonical
  // shape pairs `VERDICT: operator-judgment-required` with an `Escalation:`
  // line; write-phase agents (a deferred consumer) emit only the line. Either
  // routes to operator-judgment, with the escalation reason as the rationale.
  if (escalationReason !== null || verdict === 'operator-judgment-required') {
    return { agent, confidence, outcome: 'operator-judgment', reason: escalationReason };
  }
  if (verdict === 'recused') {
    return { agent, confidence, outcome: 'recused', reason: findRecusalReason(output) || null };
  }
  return { agent, confidence, outcome: 'gated', reason: null };
}

// Classify the findings an evaluator emitted, given its already-computed
// outcome. Escalation and recusal carry no findings — the signal is the
// message. A gated agent's findings depend on its VERDICT: line.
function classifyFindings(
  output: string,
  outcome: AgentOutcome,
): { findings: ParsedReason[]; parseFailure: boolean } {
  if (outcome === 'operator-judgment' || outcome === 'recused') {
    return { findings: [], parseFailure: false };
  }

  const verdictMatch = output.match(
    /^[\s>]*VERDICT:\s*(approved|flagged|flagged-conflict|recused|operator-judgment-required)\s*$/m,
  );
  if (!verdictMatch) {
    return {
      findings: [
        {
          advisory: false,
          code: 'parse-failure',
          evidence:
            'no VERDICT: line found in output (expected `VERDICT: approved`, `flagged`, `recused`, or `operator-judgment-required`)',
        },
      ],
      parseFailure: true,
    };
  }
  if (verdictMatch[1] === 'approved') {
    // Surface any advisory notes the evaluator attached to its approval.
    // Bullets under the Advisory section are advisory by construction (the
    // section IS the advisory channel), so force the flag regardless of an
    // explicit `ADVISORY:` prefix. No section → no findings (unchanged).
    const advisoryFindings = extractBullets(findAdvisoryBlock(output)).map(
      (bullet) => ({ ...parseReason(bullet), advisory: true }),
    );
    return { findings: advisoryFindings, parseFailure: false };
  }

  // flagged / flagged-conflict: reasons paired with remedies by index; any
  // extra remedies are dropped, missing remedies become empty strings.
  const reasonBullets = extractBullets(findReasonsBlock(output));
  const remedyBullets = extractBullets(findRemediesBlock(output));
  const findings = reasonBullets.map((reason) => parseReason(reason));
  for (let i = 0; i < findings.length; i++) {
    (findings[i] as ParsedReason & { remedy?: string }).remedy =
      remedyBullets[i] ?? '';
  }
  return { findings, parseFailure: false };
}

function aggregate(entries: AgentOutput[]): Result {
  const blocking: Finding[] = [];
  const advisory: Finding[] = [];
  const cliRuns: CliRun[] = [];
  const agentSignals: AgentSignal[] = [];
  for (const entry of entries) {
    const signal = computeAgentSignal(entry.agent, entry.output);
    const { findings } = classifyFindings(entry.output, signal.outcome);
    for (const f of findings as (ParsedReason & { remedy?: string })[]) {
      const finding: Finding = {
        evaluator: entry.agent,
        code: f.code,
        evidence: f.evidence,
        remedy: f.remedy ?? '',
      };
      if (f.advisory) advisory.push(finding);
      else blocking.push(finding);
    }
    // One signal per agent — including gated ones, so a downstream consumer
    // can read every agent's confidence, not just the non-gating ones.
    agentSignals.push(signal);
  }
  // v1: conflict detection is a documented no-op. See guild-validate
  // SKILL.md § "Conflict detection (v1: future-work)".
  const conflicts: Conflict[] = [];
  // Precedence: an explicit escalation is the strongest non-approval signal —
  // if any agent punts to the operator, the panel cannot auto-gate, so
  // operator-judgment-required outranks every other verdict. Blocking
  // findings still surface in the findings list regardless of the headline.
  const hasOperatorJudgment = agentSignals.some(
    (s) => s.outcome === 'operator-judgment',
  );
  let verdict: Verdict;
  if (hasOperatorJudgment) verdict = 'operator-judgment-required';
  else if (conflicts.length > 0) verdict = 'flagged-conflict';
  else if (blocking.length > 0) verdict = 'flagged';
  else verdict = 'approved';
  return {
    verdict,
    blocking_findings: blocking,
    advisory_findings: advisory,
    cli_runs: cliRuns,
    conflicts,
    agent_signals: agentSignals,
  };
}

function validateEntries(raw: unknown): AgentOutput[] {
  if (!Array.isArray(raw)) {
    throw new ValidationError(
      'input must be a JSON array of {agent, output} entries',
    );
  }
  const validated: AgentOutput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i];
    if (typeof e !== 'object' || e === null || Array.isArray(e)) {
      throw new ValidationError(`entry [${i}] must be an object`);
    }
    const obj = e as Record<string, unknown>;
    if (typeof obj.agent !== 'string') {
      throw new ValidationError(`entry [${i}] must have a string \`agent\` field`);
    }
    if (typeof obj.output !== 'string') {
      throw new ValidationError(`entry [${i}] must have a string \`output\` field`);
    }
    validated.push({ agent: obj.agent, output: obj.output });
  }
  return validated;
}

export function parseAndAggregateVerb(
  _rest: string[],
  ctx: GuildCliContext,
): DispatchResult {
  const input = ctx.stdin ?? '';
  if (!input.trim()) {
    return fail('empty input on stdin; expected JSON array of {agent, output} entries');
  }
  let entries: unknown;
  try {
    entries = JSON.parse(input);
  } catch (err) {
    return fail(`JSON parse error: ${(err as Error).message}`);
  }
  let validated: AgentOutput[];
  try {
    validated = validateEntries(entries);
  } catch (err) {
    if (err instanceof ValidationError) return fail(err.message);
    throw err;
  }
  const result = aggregate(validated);
  return { stdout: JSON.stringify(result, null, 2), exitCode: 0 };
}
