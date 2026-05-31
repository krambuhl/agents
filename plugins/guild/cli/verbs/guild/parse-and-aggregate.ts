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

type Verdict = 'approved' | 'flagged' | 'flagged-conflict';

// A recusal is an evaluator declaring its domain non-applicable to the
// artifact (e.g. react against a pure-CLI unit). It is NOT a finding —
// it does not gate the verdict — but it is substrate signal: the panel's
// non-applicability rate is recusals / spawns. Surfaced as its own list so
// the caller (guild-validate) can emit an `evaluator-recused` event per entry.
type Recusal = {
  evaluator: string;
  reason: string;
};

type Result = {
  verdict: Verdict;
  blocking_findings: Finding[];
  advisory_findings: Finding[];
  cli_runs: CliRun[];
  conflicts: Conflict[];
  recusals: Recusal[];
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

function parseEvaluatorOutput(
  _agent: string,
  output: string,
): {
  findings: ParsedReason[];
  cliRuns: CliRun[];
  parseFailure: boolean;
  recusal: string | null;
} {
  const verdictMatch = output.match(
    /^[\s>]*VERDICT:\s*(approved|flagged|flagged-conflict|recused)\s*$/m,
  );
  if (!verdictMatch) {
    return {
      findings: [
        {
          advisory: false,
          code: 'parse-failure',
          evidence:
            'no VERDICT: line found in output (expected `VERDICT: approved`, `flagged`, or `recused`)',
        },
      ],
      cliRuns: [],
      parseFailure: true,
      recusal: null,
    };
  }
  const verdict = verdictMatch[1];
  if (verdict === 'recused') {
    return {
      findings: [],
      cliRuns: [],
      parseFailure: false,
      recusal: findRecusalReason(output),
    };
  }
  if (verdict === 'approved') {
    // Surface any advisory notes the evaluator attached to its approval.
    // Bullets under the Advisory section are advisory by construction (the
    // section IS the advisory channel), so force the flag regardless of an
    // explicit `ADVISORY:` prefix. No section → no findings (unchanged).
    const advisoryFindings = extractBullets(findAdvisoryBlock(output)).map(
      (bullet) => ({ ...parseReason(bullet), advisory: true }),
    );
    return {
      findings: advisoryFindings,
      cliRuns: [],
      parseFailure: false,
      recusal: null,
    };
  }

  const reasonsBlock = findReasonsBlock(output);
  const reasonBullets = extractBullets(reasonsBlock);
  const remediesBlock = findRemediesBlock(output);
  const remedyBullets = extractBullets(remediesBlock);

  const findings = reasonBullets.map((reason) => parseReason(reason));
  // Pair remedies to reasons by index; any extra remedies are dropped,
  // missing remedies become empty strings.
  for (let i = 0; i < findings.length; i++) {
    (findings[i] as ParsedReason & { remedy?: string }).remedy =
      remedyBullets[i] ?? '';
  }

  return { findings, cliRuns: [], parseFailure: false, recusal: null };
}

function aggregate(entries: AgentOutput[]): Result {
  const blocking: Finding[] = [];
  const advisory: Finding[] = [];
  const cliRuns: CliRun[] = [];
  const recusals: Recusal[] = [];
  for (const entry of entries) {
    const { findings, cliRuns: runs, recusal } = parseEvaluatorOutput(
      entry.agent,
      entry.output,
    );
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
    if (recusal !== null) {
      recusals.push({ evaluator: entry.agent, reason: recusal });
    }
    cliRuns.push(...runs);
  }
  // v1: conflict detection is a documented no-op. See guild-validate
  // SKILL.md § "Conflict detection (v1: future-work)".
  const conflicts: Conflict[] = [];
  let verdict: Verdict;
  if (conflicts.length > 0) verdict = 'flagged-conflict';
  else if (blocking.length > 0) verdict = 'flagged';
  else verdict = 'approved';
  return {
    verdict,
    blocking_findings: blocking,
    advisory_findings: advisory,
    cli_runs: cliRuns,
    conflicts,
    recusals,
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
