// Structured error class for the linear-loom substrate.
//
// Errors thrown by lib functions carry a `code` (stable kebab-case
// identifier), a `message` (human-readable line), and optionally
// `candidates` (for disambiguation errors) plus `namespace` / `verb`
// (so the CLI's stderr envelope can name the call site). Verb
// handlers catch these and forward to stderr + non-zero exit per the
// structured error shape established in cli/linear-loom.ts (the
// help-text + unknown-namespace path the Phase 2 scaffold shipped).

export interface LinearLoomErrorOptions {
  candidates?: string[];
  namespace?: string;
  verb?: string;
}

export class LinearLoomError extends Error {
  code: string;
  candidates: string[] | undefined;
  namespace: string | undefined;
  verb: string | undefined;

  constructor(code: string, message: string, options?: LinearLoomErrorOptions) {
    super(`${code}: ${message}`);
    this.name = 'LinearLoomError';
    this.code = code;
    this.candidates = options?.candidates;
    this.namespace = options?.namespace;
    this.verb = options?.verb;
  }

  toPayload(): {
    error: string;
    message: string;
    namespace?: string;
    verb?: string;
    candidates?: string[];
  } {
    const payload: {
      error: string;
      message: string;
      namespace?: string;
      verb?: string;
      candidates?: string[];
    } = {
      error: this.code,
      message: this.message,
    };
    if (this.namespace !== undefined) payload.namespace = this.namespace;
    if (this.verb !== undefined) payload.verb = this.verb;
    if (this.candidates !== undefined) payload.candidates = this.candidates;
    return payload;
  }
}
