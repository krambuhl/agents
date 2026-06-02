import { test, expect } from 'vitest';
import { probeHarnessMode } from './harness-mode.ts';

// The harness exposes no permission-mode signal to a running skill, so the
// probe is absent-by-default. This pins the inert contract: until a wire-in
// lands, callers must never observe anything but 'unknown'. If this test
// ever has to change, a real harness signal was wired in — which is a
// deliberate behavioral change, not an incidental one.
test('probeHarnessMode: returns the inert "unknown" today (no harness signal to read)', () => {
  expect(probeHarnessMode()).toBe('unknown');
});
