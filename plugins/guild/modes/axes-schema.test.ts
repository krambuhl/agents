import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  parseToml,
  type TomlTable,
  type TomlValue,
  isTomlTable,
} from '../cli/lib/toml.ts';

// Schema validator for plugins/guild/axes.toml. Codifies the
// cross-product validity + collision invariants from PLAN.md
// § Phase 1.1 exit criterion 6.
//
// Pairs with the seed conversion script at scripts/convert-to-axes.ts
// and the long-term axes.toml that becomes authoritative after
// Phase 2.2. Drift in either the schema or the seed fails this test
// with a localized message.

const pluginRoot = dirname(fileURLToPath(import.meta.url));

const AXES_PATH = join(pluginRoot, 'axes.toml');
const AXES_RAW = readFileSync(AXES_PATH, 'utf8');
const AXES = parseToml(AXES_RAW);

const CANONICAL_DOMAINS = [
  'a11y',
  'abstraction',
  'composition',
  'css-architecture',
  'naming',
  'nextjs',
  'performance',
  'react',
  'substrate',
  'test-integration',
  'test-unit',
  'tokens',
];

const CANONICAL_PERSONALITIES = [
  'generative',
  'methodical',
  'pragmatist',
  'skeptic',
  'synthesizer',
];

const CANONICAL_PHASES = ['researcher', 'planner', 'reviewer', 'implementer', 'fixer'];

function getTable(
  t: TomlValue | undefined,
  key: string,
): TomlTable | undefined {
  if (!isTomlTable(t)) return undefined;
  const v = t[key];
  return isTomlTable(v) ? v : undefined;
}

function getStringArray(t: TomlValue | undefined, key: string): string[] {
  if (!isTomlTable(t)) return [];
  const v = t[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x: TomlValue): x is string => typeof x === 'string');
}

function getString(
  t: TomlValue | undefined,
  key: string,
): string | undefined {
  if (!isTomlTable(t)) return undefined;
  const v = t[key];
  return typeof v === 'string' ? v : undefined;
}

function getArrayOfTables(t: TomlValue | undefined, key: string): TomlTable[] {
  if (!isTomlTable(t)) return [];
  const v = t[key];
  if (!Array.isArray(v)) return [];
  return v.filter(isTomlTable);
}

describe('axes-schema: parses + schema_version', () => {
  it('axes.toml parses as TOML', () => {
    // Reaching this point means parseToml succeeded; assertion is the
    // mere existence of AXES as a Table.
    expect(isTomlTable(AXES)).toBe(true);
  });

  it('schema_version is 1', () => {
    expect(AXES.schema_version).toBe(1);
  });
});

describe('axes-schema: axis tables present', () => {
  for (const d of CANONICAL_DOMAINS) {
    it(`axis.domain.${d} exists`, () => {
      const t = getTable(getTable(AXES, 'axis'), 'domain');
      expect(
        isTomlTable(t?.[d]),
        `axis.domain.${d}: missing or not a table`,
      ).toBe(true);
    });
  }
  for (const p of CANONICAL_PERSONALITIES) {
    it(`axis.personality.${p} exists`, () => {
      const t = getTable(getTable(AXES, 'axis'), 'personality');
      expect(
        isTomlTable(t?.[p]),
        `axis.personality.${p}: missing or not a table`,
      ).toBe(true);
    });
  }
  for (const phase of CANONICAL_PHASES) {
    it(`axis.phase.${phase} exists`, () => {
      const t = getTable(getTable(AXES, 'axis'), 'phase');
      expect(
        isTomlTable(t?.[phase]),
        `axis.phase.${phase}: missing or not a table`,
      ).toBe(true);
    });
  }
});

describe('axes-schema: domain entries declare phases + tool_grants', () => {
  for (const d of CANONICAL_DOMAINS) {
    it(`axis.domain.${d} has phases array referencing valid phases`, () => {
      const t = getTable(getTable(getTable(AXES, 'axis'), 'domain'), d);
      const phases = getStringArray(t, 'phases');
      for (const p of phases) {
        expect(
          CANONICAL_PHASES.includes(p),
          `axis.domain.${d}.phases includes unknown phase "${p}"`,
        ).toBe(true);
      }
    });

    it(`axis.domain.${d} has tool_grants array of strings`, () => {
      const t = getTable(getTable(getTable(AXES, 'axis'), 'domain'), d);
      // Asserting type by extraction: getStringArray drops non-strings;
      // compare against the raw array length to catch a mixed-type
      // array (string + number, etc.).
      const raw = (t as TomlTable | undefined)?.tool_grants;
      const grants = getStringArray(t, 'tool_grants');
      expect(
        Array.isArray(raw) && raw.length === grants.length,
        `axis.domain.${d}.tool_grants: must be string-only array`,
      ).toBe(true);
    });
  }
});

describe('axes-schema: personality entries declare phases + disposition', () => {
  for (const p of CANONICAL_PERSONALITIES) {
    it(`axis.personality.${p} has phases array referencing valid phases`, () => {
      const t = getTable(getTable(getTable(AXES, 'axis'), 'personality'), p);
      const phases = getStringArray(t, 'phases');
      for (const phase of phases) {
        expect(
          CANONICAL_PHASES.includes(phase),
          `axis.personality.${p}.phases includes unknown phase "${phase}"`,
        ).toBe(true);
      }
    });

    it(`axis.personality.${p} has non-empty disposition`, () => {
      const t = getTable(getTable(getTable(AXES, 'axis'), 'personality'), p);
      const disposition = getString(t, 'disposition') ?? '';
      expect(
        disposition.length,
        `axis.personality.${p}.disposition: must be non-empty string`,
      ).toBeGreaterThan(0);
    });
  }
});

describe('axes-schema: phase entries declare base_tools, writes, default_personality', () => {
  for (const phase of CANONICAL_PHASES) {
    it(`axis.phase.${phase}.base_tools is a non-empty string array`, () => {
      const t = getTable(getTable(getTable(AXES, 'axis'), 'phase'), phase);
      const baseTools = getStringArray(t, 'base_tools');
      expect(
        baseTools.length,
        `axis.phase.${phase}.base_tools: must be non-empty string array`,
      ).toBeGreaterThan(0);
    });

    it(`axis.phase.${phase}.writes is a boolean`, () => {
      const t = getTable(getTable(getTable(AXES, 'axis'), 'phase'), phase);
      expect(
        typeof t?.writes === 'boolean',
        `axis.phase.${phase}.writes: must be boolean`,
      ).toBe(true);
    });

    // default_personality is METADATA — must name an existing
    // personality, but is NOT required to have the phase in that
    // personality's phases list. Forward-looking dispatch hint;
    // pragmatist.phases is empty today yet implementer's default is
    // pragmatist.
    it(`axis.phase.${phase}.default_personality names an existing personality`, () => {
      const t = getTable(getTable(getTable(AXES, 'axis'), 'phase'), phase);
      const def = getString(t, 'default_personality');
      expect(
        def !== undefined && CANONICAL_PERSONALITIES.includes(def),
        `axis.phase.${phase}.default_personality: must name an existing personality (got "${def ?? '<missing>'}")`,
      ).toBe(true);
    });
  }
});

describe('axes-schema: recipes are cross-product-derivable', () => {
  const recipes = getArrayOfTables(AXES, 'recipes');

  it('there is at least one recipe', () => {
    expect(
      recipes.length,
      'axes.toml: must contain at least one [[recipes]] entry',
    ).toBeGreaterThan(0);
  });

  for (const recipe of recipes) {
    const name = getString(recipe, 'name') ?? '<unnamed>';
    const phase = getString(recipe, 'phase');
    const personality = getString(recipe, 'personality');
    const domains = getStringArray(recipe, 'domains');

    it(`recipe "${name}" phase is a valid axis.phase`, () => {
      expect(
        phase !== undefined && CANONICAL_PHASES.includes(phase),
        `recipe "${name}".phase: must reference an existing axis.phase (got "${phase ?? '<missing>'}")`,
      ).toBe(true);
    });

    it(`recipe "${name}" personality is a valid axis.personality and includes the recipe phase`, () => {
      expect(
        personality !== undefined && CANONICAL_PERSONALITIES.includes(personality),
        `recipe "${name}".personality: must reference an existing axis.personality (got "${personality ?? '<missing>'}")`,
      ).toBe(true);
      const ptable = getTable(
        getTable(getTable(AXES, 'axis'), 'personality'),
        personality!,
      );
      const pphases = getStringArray(ptable, 'phases');
      expect(
        phase !== undefined && pphases.includes(phase),
        `recipe "${name}": personality "${personality}".phases must include "${phase}" (got ${JSON.stringify(pphases)})`,
      ).toBe(true);
    });

    for (const d of domains) {
      it(`recipe "${name}" domain "${d}" exists and includes the recipe phase`, () => {
        expect(
          CANONICAL_DOMAINS.includes(d),
          `recipe "${name}".domains: includes unknown domain "${d}"`,
        ).toBe(true);
        const dtable = getTable(getTable(getTable(AXES, 'axis'), 'domain'), d);
        const dphases = getStringArray(dtable, 'phases');
        expect(
          phase !== undefined && dphases.includes(phase),
          `recipe "${name}": domain "${d}".phases must include "${phase}" (got ${JSON.stringify(dphases)})`,
        ).toBe(true);
      });
    }
  }
});

describe('axes-schema: singletons are cross-product-derivable on personality+phase', () => {
  const singletons = getArrayOfTables(AXES, 'singletons');

  for (const s of singletons) {
    const name = getString(s, 'name') ?? '<unnamed>';
    const phase = getString(s, 'phase');
    const personality = getString(s, 'personality');

    it(`singleton "${name}" phase is a valid axis.phase`, () => {
      expect(
        phase !== undefined && CANONICAL_PHASES.includes(phase),
        `singleton "${name}".phase: must reference an existing axis.phase (got "${phase ?? '<missing>'}")`,
      ).toBe(true);
    });

    it(`singleton "${name}" personality includes the phase`, () => {
      expect(
        personality !== undefined && CANONICAL_PERSONALITIES.includes(personality),
        `singleton "${name}".personality: must reference an existing axis.personality (got "${personality ?? '<missing>'}")`,
      ).toBe(true);
      const ptable = getTable(
        getTable(getTable(AXES, 'axis'), 'personality'),
        personality!,
      );
      const pphases = getStringArray(ptable, 'phases');
      expect(
        phase !== undefined && pphases.includes(phase),
        `singleton "${name}": personality "${personality}".phases must include "${phase}" (got ${JSON.stringify(pphases)})`,
      ).toBe(true);
    });
  }
});

describe('axes-schema: retained agents do not collide with derived cell ids', () => {
  const retained = getArrayOfTables(AXES, 'retained');
  const singletons = getArrayOfTables(AXES, 'singletons');
  const singletonNames = new Set<string>();
  for (const s of singletons) {
    const name = getString(s, 'name');
    if (name) singletonNames.add(name);
  }

  it('there is at least one retained entry', () => {
    expect(
      retained.length,
      'axes.toml: must contain at least one [[retained]] entry',
    ).toBeGreaterThan(0);
  });

  for (const r of retained) {
    const name = getString(r, 'name') ?? '<unnamed>';

    it(`retained "${name}" is not a domain name (no evaluator-/whiteboard- prefix collision)`, () => {
      expect(
        !CANONICAL_DOMAINS.includes(name),
        `retained "${name}": collides with a derived domain cell — codegen would emit evaluator-${name} / whiteboard-${name}`,
      ).toBe(true);
    });

    it(`retained "${name}" is not a singleton name`, () => {
      expect(
        !singletonNames.has(name),
        `retained "${name}": collides with a singleton of the same name`,
      ).toBe(true);
    });
  }
});
