import {
  parseToml,
  type TomlTable,
  type TomlValue,
  isTomlTable,
} from '../../../lib/toml.ts';
import {
  AxesParseError,
  type AxesData,
  type AxisDomain,
  type AxisPersonality,
  type AxisPhase,
  type Recipe,
  type Retained,
  type Singleton,
} from './types.ts';

// parse: axes.toml content string → typed AxesData.
//
// Pure function. Throws TomlParseError (from the underlying parser)
// on malformed TOML syntax; throws AxesParseError on structural
// mismatch against the AxesData shape (missing top-level sections,
// wrong schema_version, malformed axis-value entries).
//
// Does NOT enforce coherence between axis-values (no "recipe phase
// must exist" check, no cross-product validation) — that is the
// validate stage's job. parse's contract is: produce a typed view
// of the raw TOML or fail loud.

function asTable(value: TomlValue | undefined, location: string): TomlTable {
  if (!isTomlTable(value)) {
    throw new AxesParseError(`${location}: expected table`);
  }
  return value;
}

function asStringArray(
  value: TomlValue | undefined,
  location: string,
): string[] {
  if (!Array.isArray(value)) {
    throw new AxesParseError(`${location}: expected array of strings`);
  }
  for (const item of value) {
    if (typeof item !== 'string') {
      throw new AxesParseError(
        `${location}: array must contain only strings (got ${typeof item})`,
      );
    }
  }
  return value as string[];
}

function asString(value: TomlValue | undefined, location: string): string {
  if (typeof value !== 'string') {
    throw new AxesParseError(`${location}: expected string`);
  }
  return value;
}

function asBoolean(value: TomlValue | undefined, location: string): boolean {
  if (typeof value !== 'boolean') {
    throw new AxesParseError(`${location}: expected boolean`);
  }
  return value;
}

function asArrayOfTables(
  value: TomlValue | undefined,
  location: string,
): TomlTable[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new AxesParseError(`${location}: expected array of tables`);
  }
  return value.map((t: TomlValue, i: number) => asTable(t, `${location}[${i}]`));
}

function parseDomain(t: TomlTable, name: string): AxisDomain {
  return {
    name,
    phases: asStringArray(t.phases, `axis.domain.${name}.phases`),
    tool_grants: asStringArray(
      t.tool_grants,
      `axis.domain.${name}.tool_grants`,
    ),
  };
}

function parsePersonality(t: TomlTable, name: string): AxisPersonality {
  return {
    name,
    phases: asStringArray(t.phases, `axis.personality.${name}.phases`),
    disposition: asString(t.disposition, `axis.personality.${name}.disposition`),
  };
}

function parsePhase(t: TomlTable, name: string): AxisPhase {
  return {
    name,
    base_tools: asStringArray(t.base_tools, `axis.phase.${name}.base_tools`),
    writes: asBoolean(t.writes, `axis.phase.${name}.writes`),
    default_personality: asString(
      t.default_personality,
      `axis.phase.${name}.default_personality`,
    ),
  };
}

function parseRecipe(t: TomlTable, index: number): Recipe {
  const location = `recipes[${index}]`;
  return {
    name: asString(t.name, `${location}.name`),
    phase: asString(t.phase, `${location}.phase`),
    personality: asString(t.personality, `${location}.personality`),
    domains: asStringArray(t.domains, `${location}.domains`),
  };
}

function parseSingleton(t: TomlTable, index: number): Singleton {
  const location = `singletons[${index}]`;
  return {
    name: asString(t.name, `${location}.name`),
    phase: asString(t.phase, `${location}.phase`),
    personality: asString(t.personality, `${location}.personality`),
  };
}

function parseRetained(t: TomlTable, index: number): Retained {
  const location = `retained[${index}]`;
  return {
    name: asString(t.name, `${location}.name`),
  };
}

export function parse(tomlContent: string): AxesData {
  const root = parseToml(tomlContent);

  const schemaVersion = root.schema_version;
  if (typeof schemaVersion !== 'number') {
    throw new AxesParseError(
      `schema_version: expected number, got ${typeof schemaVersion}`,
    );
  }
  if (schemaVersion !== 1) {
    throw new AxesParseError(
      `schema_version: expected 1, got ${schemaVersion}`,
    );
  }

  const axis = asTable(root.axis, 'axis');
  const axisDomain = asTable(axis.domain, 'axis.domain');
  const axisPersonality = asTable(axis.personality, 'axis.personality');
  const axisPhase = asTable(axis.phase, 'axis.phase');

  const domains: Record<string, AxisDomain> = {};
  for (const [name, entry] of Object.entries(axisDomain)) {
    domains[name] = parseDomain(
      asTable(entry, `axis.domain.${name}`),
      name,
    );
  }

  const personalities: Record<string, AxisPersonality> = {};
  for (const [name, entry] of Object.entries(axisPersonality)) {
    personalities[name] = parsePersonality(
      asTable(entry, `axis.personality.${name}`),
      name,
    );
  }

  const phases: Record<string, AxisPhase> = {};
  for (const [name, entry] of Object.entries(axisPhase)) {
    phases[name] = parsePhase(asTable(entry, `axis.phase.${name}`), name);
  }

  const recipes = asArrayOfTables(root.recipes, 'recipes').map(
    (t: TomlTable, i: number) => parseRecipe(t, i),
  );
  const singletons = asArrayOfTables(root.singletons, 'singletons').map(
    (t: TomlTable, i: number) => parseSingleton(t, i),
  );
  const retained = asArrayOfTables(root.retained, 'retained').map(
    (t: TomlTable, i: number) => parseRetained(t, i),
  );

  return {
    schema_version: schemaVersion,
    domains,
    personalities,
    phases,
    recipes,
    singletons,
    retained,
  };
}
