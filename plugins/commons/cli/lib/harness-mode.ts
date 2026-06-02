// Harness-mode probe seam — the single, inert place a future harness
// permission / auto-accept signal would wire into the substrate.
//
// Why this exists, and why it does nothing today: the guild-offload
// posture (docs/AGENT-CONVENTIONS.md § Guild-offload posture) is armed by
// the loop's own `--mode=auto` flag, NOT by the harness's permission
// mode. Coupling to the harness was the originally-intended trigger, but
// Claude Code does not expose its permission / auto-accept mode to a
// running skill — confirmed absent: no env var, GitHub issue #6227
// ("Expose Active Permission Mode to Hooks") closed not-planned, and the
// statusline payload carries no mode field. So this probe ships INERT: it
// returns `'unknown'` unconditionally and gates nothing. No caller should
// branch behavior on its result today.
//
// The seam is here so that IF such a signal ever lands, exactly one
// function body changes — the `HarnessMode` union and every caller stay
// put. See the single wire-in point marked below.

/** The harness's permission / auto-accept posture, as the substrate would
 *  consume it. `'unknown'` is the only value reachable today (the signal
 *  is absent); `'auto'` / `'default'` are the shape a future wire-in would
 *  return, declared now so callers can be written against the full union
 *  before the signal exists. */
export type HarnessMode = 'auto' | 'default' | 'unknown';

/** Probe the harness's permission mode.
 *
 *  INERT TODAY: always returns `'unknown'`. The harness exposes no
 *  permission-mode signal to a running skill (see file header), so there
 *  is nothing to read. Do not gate behavior on this return — the
 *  guild-offload posture arms on the loop's `--mode=auto` flag, not on
 *  this probe.
 *
 *  Wire-in point: when a harness signal becomes available, read it at the
 *  marked line below and map it onto `HarnessMode`. That single edit
 *  lights up every caller; nothing else in the seam changes. */
export function probeHarnessMode(): HarnessMode {
  // --- wire-in point: the single place a future harness signal attaches ---
  // Until such a signal exists the probe is absent-by-default: it cannot
  // observe the harness, so it reports `'unknown'`.
  return 'unknown';
}
