import { LinearLoomError } from './errors.ts';

// Minimal GraphQL client for Linear's API.
//
// Linear's API is GraphQL only; the endpoint is
// https://api.linear.app/graphql and the Authorization header takes
// the personal API key verbatim (no Bearer prefix). The client is
// dependency-injected — production calls construct it with the real
// `fetch`; tests inject a stubbed FetchFn.
//
// Retry policy (DESIGN.md § 15): exponential backoff on 429 and 5xx.
// 4xx other than 429 surface as immediate LinearLoomError. Network
// errors get the same backoff. Defaults are conservative — Phase 5
// can revisit when real volume informs the tuning.

export const LINEAR_GRAPHQL_ENDPOINT = 'https://api.linear.app/graphql';

export type FetchFn = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

export type SleepFn = (ms: number) => Promise<void>;

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 4,
  baseDelayMs: 500,
};

export interface LinearClientOptions {
  apiKey: string;
  fetchFn?: FetchFn;
  sleepFn?: SleepFn;
  endpoint?: string;
  retry?: RetryPolicy;
}

export interface GraphqlResponse<T> {
  data?: T;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

export class LinearClient {
  private readonly apiKey: string;
  private readonly fetchFn: FetchFn;
  private readonly sleepFn: SleepFn;
  private readonly endpoint: string;
  private readonly retry: RetryPolicy;

  constructor(options: LinearClientOptions) {
    if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
      throw new LinearLoomError(
        'missing-auth',
        'LinearClient requires a non-empty apiKey.',
      );
    }
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchFn);
    this.sleepFn = options.sleepFn ?? defaultSleep;
    this.endpoint = options.endpoint ?? LINEAR_GRAPHQL_ENDPOINT;
    this.retry = options.retry ?? DEFAULT_RETRY;
  }

  async query<T>(
    graphqlQuery: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const body = JSON.stringify({ query: graphqlQuery, variables: variables ?? {} });
    const headers = {
      'Content-Type': 'application/json',
      Authorization: this.apiKey,
    };

    let lastError: LinearLoomError | undefined;
    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt++) {
      let response: Awaited<ReturnType<FetchFn>>;
      try {
        response = await this.fetchFn(this.endpoint, {
          method: 'POST',
          headers,
          body,
        });
      } catch (err) {
        lastError = new LinearLoomError(
          'network-error',
          `Linear API request failed on attempt ${attempt}: ${(err as Error).message}`,
        );
        if (attempt < this.retry.maxAttempts) {
          await this.sleepFn(this.backoffMs(attempt));
          continue;
        }
        throw lastError;
      }

      if (response.status === 429 || response.status >= 500) {
        lastError = new LinearLoomError(
          response.status === 429 ? 'rate-limited' : 'server-error',
          `Linear API returned ${response.status} on attempt ${attempt}.`,
        );
        if (attempt < this.retry.maxAttempts) {
          await this.sleepFn(this.backoffMs(attempt));
          continue;
        }
        throw lastError;
      }

      if (!response.ok) {
        const text = await response.text();
        throw new LinearLoomError(
          response.status === 401 || response.status === 403
            ? 'auth-refused'
            : 'request-failed',
          `Linear API returned ${response.status}: ${text}`,
        );
      }

      const parsed = (await response.json()) as GraphqlResponse<T>;
      if (parsed.errors !== undefined && parsed.errors.length > 0) {
        const messages = parsed.errors.map((e) => e.message).join('; ');
        throw new LinearLoomError('graphql-error', messages);
      }
      if (parsed.data === undefined) {
        throw new LinearLoomError(
          'graphql-empty',
          'Linear API response had no data field.',
        );
      }
      return parsed.data;
    }

    throw (
      lastError ??
      new LinearLoomError(
        'retry-exhausted',
        `Linear API retry budget exhausted after ${this.retry.maxAttempts} attempts.`,
      )
    );
  }

  private backoffMs(attempt: number): number {
    return this.retry.baseDelayMs * 2 ** (attempt - 1);
  }
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
