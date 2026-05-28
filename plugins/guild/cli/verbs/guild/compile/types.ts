// Shared types for the compile pipeline stages
// (parse → validate → derive → resolve → compose → emit).
//
// parse produces AxesData; validate, derive, resolve consume it.
// Downstream stage outputs (ResolvedCell, ComposedAgent) get their
// types added by their owning units.

export interface AxisDomain {
  name: string;
  phases: string[];
  tool_grants: string[];
}

export interface AxisPersonality {
  name: string;
  phases: string[];
  disposition: string;
}

export interface AxisPhase {
  name: string;
  base_tools: string[];
  writes: boolean;
  default_personality: string;
}

export interface Recipe {
  name: string;
  phase: string;
  personality: string;
  domains: string[];
}

export interface Singleton {
  name: string;
  phase: string;
  personality: string;
}

export interface Retained {
  name: string;
}

export interface AxesData {
  schema_version: number;
  domains: Record<string, AxisDomain>;
  personalities: Record<string, AxisPersonality>;
  phases: Record<string, AxisPhase>;
  recipes: Recipe[];
  singletons: Singleton[];
  retained: Retained[];
}

// Validation result + finding shape.
// Findings carry a kebab-case code (the lint name), a human-readable
// message that names the offending entry, and a location string for
// the offender (e.g. "axis.domain.foo.phases[1]" or "recipe[reviewer-default].domains[3]").

export interface Finding {
  code: string;
  message: string;
  location: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; errors: Finding[] };

// Thrown by parse when axes.toml is structurally unparseable as the
// AxesData shape (separate from TomlParseError which the TOML parser
// itself throws on malformed TOML syntax).
export class AxesParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AxesParseError';
  }
}

// Cell — the unit of emission. derive produces an ordered array;
// resolve / compose / emit operate on one at a time.
//
//   source:
//     "recipe"    — derived from a [[recipes]] entry × domain
//     "singleton" — derived from a [[singletons]] entry (no domain)
//
//   id — the file name codegen would emit (without `.md` suffix).
//        For recipe-derived cells: <phase-prefix>-<domain>
//        For singletons: singleton.name (already pre-shaped, e.g.
//        "whiteboard-skeptic").
//
//   phase-prefix mapping (PLAN's existing convention; reviewer +
//   planner only today):
//     reviewer  → "evaluator"
//     planner   → "whiteboard"
//   Other phases throw a DeriveError on derivation today — PLAN
//   doesn't yet name a prefix for implementer / researcher.

export interface Cell {
  id: string;
  phase: string;
  personality: string;
  domain: string | null;
  source: 'recipe' | 'singleton';
  source_name: string;
}

// ResolvedCell — Cell + the resolved source fragments + the tool
// fold. resolve produces this for every Cell; compose + emit operate
// on it.
//
// For singletons (no domain): domain_fragment is empty string,
// tool_grants don't apply (tools = phase.base_tools).

export interface ResolvedCell extends Cell {
  phase_fragment: string;
  personality_fragment: string;
  domain_fragment: string;
  tools: string[];
}

export class DeriveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DeriveError';
  }
}

export class ResolveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolveError';
  }
}

// ComposedAgent — ResolvedCell + the v0 composed body (frontmatter +
// concatenated fragments with section markers + dedup-candidate
// comments) + the SHA-256 source hashes that feed the cache entry.
//
// compose produces this for every ResolvedCell; emit writes the body
// to disk + records the cache entry.

export interface SourceHashes {
  phase: string;
  personality: string;
  domain: string;
}

export interface ComposedAgent extends ResolvedCell {
  composed_body: string;
  source_hashes: SourceHashes;
}

// Cache entry written to .cache.toml per cell. fused_at is an ISO
// timestamp; output_hash is SHA-256 of composed_body. prompt_hash is
// SHA-256 of the fusion-prompt template content (Phase 2.1 U3 wires
// the real prompt; U2 ships the plumbing with empty-string as the
// pre-U3 default sentinel). Changing prompt_hash invalidates every
// cell's cache entry, since the fused output is a function of the
// prompt.
export interface CacheEntry {
  cell_id: string;
  source_hashes: SourceHashes;
  output_hash: string;
  prompt_hash: string;
  fused_at: string;
}

// EmitResult — what emit produces back to the orchestrator:
// the list of written file paths + the cache entries written.

export interface EmitResult {
  written_files: string[];
  cache_entries: CacheEntry[];
}

export class ComposeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ComposeError';
  }
}

export class EmitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmitError';
  }
}
