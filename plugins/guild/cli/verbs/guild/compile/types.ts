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
