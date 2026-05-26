// Structured error class for the jelly-run substrate.
//
// Mirrors jelly-loom's JellyError: a stable kebab-case `code`, a
// human-readable `message`, and an optional `candidates` list. Verb
// handlers (U2+) catch these and forward to stderr + non-zero exit per
// the substrate's `<code>: <reason>` stderr convention. jelly-run
// declares its own error class (rather than importing jelly-loom's) to
// keep the plugin standalone — the parallel-plugin posture from PLAN.md.
//
// NOTE: an explicit field + assignment, NOT a parameter-property
// constructor (`constructor(public code: string)`) — Node's strip-only
// TS mode (how the CLI runs via `node *.ts`) rejects parameter
// properties with ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX, and vitest's full
// transform masks it. See the jelly-loom MCP-server finding.

export class JellyRunError extends Error {
  code: string;
  candidates: string[] | undefined;
  constructor(code: string, message: string, candidates?: string[]) {
    // Prefix the human-readable reason with the structured code so
    // `error.message` matches the `<code>: <reason>` stderr convention.
    super(`${code}: ${message}`);
    this.name = 'JellyRunError';
    this.code = code;
    this.candidates = candidates;
  }

  toPayload(): { error: string; message: string; candidates?: string[] } {
    const payload: { error: string; message: string; candidates?: string[] } = {
      error: this.code,
      message: this.message,
    };
    if (this.candidates !== undefined) payload.candidates = this.candidates;
    return payload;
  }
}
