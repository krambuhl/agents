// Structured error class for the jelly-loom substrate.
//
// Mirrors loom's LoomError: a stable kebab-case `code`, a
// human-readable `message`, and an optional `candidates` list. Verb
// handlers (U3+) catch these and forward to stderr + non-zero exit
// per the substrate's `<code>: <reason>` stderr convention. jelly-loom
// declares its own error class (rather than importing loom's) to keep
// the plugin standalone — the parallel-plugin posture from PLAN.md.

export class JellyError extends Error {
  code: string;
  candidates: string[] | undefined;
  constructor(code: string, message: string, candidates?: string[]) {
    // Prefix the human-readable reason with the structured code so
    // `error.message` matches the `<code>: <reason>` stderr convention.
    // `error.code` stays the canonical structured field.
    super(`${code}: ${message}`);
    this.name = 'JellyError';
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
