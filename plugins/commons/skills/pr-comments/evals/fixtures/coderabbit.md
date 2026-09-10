pr #418: retry transient fetch failures in the net client

review comment from coderabbitai[bot] on src/net/client.ts line 9

> **Potential issue:** `fetchWithRetry` retries on every thrown error, including `AbortError` when the caller cancels the request. A cancelled request will be retried up to 3 times against the caller's intent.
>
> Consider rethrowing immediately when `err instanceof DOMException && err.name === 'AbortError'`.

state: the finding is correct. the fix is pushed as commit 4c7d0e9: abort errors are rethrown before the retry loop continues, and a test covers a cancelled request making exactly one attempt.
