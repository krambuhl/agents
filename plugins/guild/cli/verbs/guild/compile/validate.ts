import type { AxesData, Finding, ValidationResult } from './types.ts';

// validate: AxesData → ValidationResult ({ ok: true } | { ok: false, errors: Finding[] }).
//
// Pure function. Runs the coherence lints from PLAN.md § Exit
// requirements over the typed AxesData and surfaces every finding it
// detects with a kebab-case code + localized message + location
// string. Does NOT short-circuit on the first error — the downstream
// pipeline benefits from seeing every issue at once.
//
// Lints implemented:
//   - domain-phase-unknown        domain.phases references a phase not in axis.phase.*
//   - personality-phase-unknown   personality.phases references a phase not in axis.phase.*
//   - recipe-phase-unknown        recipe.phase not in axis.phase.*
//   - recipe-personality-unknown  recipe.personality not in axis.personality.*
//   - recipe-domain-unknown       recipe.domains[i] not in axis.domain.*
//   - recipe-cell-underivable     (recipe.domain, recipe.personality) at recipe.phase fails cross-product
//   - singleton-phase-unknown     singleton.phase not in axis.phase.*
//   - singleton-personality-unknown singleton.personality not in axis.personality.*
//   - singleton-cell-underivable  singleton.phase not in singleton.personality's phases
//   - retained-collides-with-derived-cell retained.name matches a domain or singleton name
//   - phase-default-personality-unknown axis.phase.X.default_personality not in axis.personality.*
//
// Deferred lint (PLAN's "etc."): "personality declares fit at a phase
// with writes=false while requesting Write" — not well-defined in the
// current axes.toml data model (personalities don't declare tool needs
// explicitly). Re-introduce when the data model carries an explicit
// per-personality capability declaration.

function flag(
  errors: Finding[],
  code: string,
  message: string,
  location: string,
): void {
  errors.push({ code, message, location });
}

export function validate(data: AxesData): ValidationResult {
  const errors: Finding[] = [];

  const phaseNames = new Set(Object.keys(data.phases));
  const personalityNames = new Set(Object.keys(data.personalities));
  const domainNames = new Set(Object.keys(data.domains));
  const singletonNames = new Set(data.singletons.map((s) => s.name));

  // Domain coherence: phases all reference known axis.phase.
  for (const [name, domain] of Object.entries(data.domains)) {
    domain.phases.forEach((p: string, i: number) => {
      if (!phaseNames.has(p)) {
        flag(
          errors,
          'domain-phase-unknown',
          `domain "${name}" declares phase "${p}" which is not in axis.phase.*`,
          `axis.domain.${name}.phases[${i}]`,
        );
      }
    });
  }

  // Personality coherence: phases all reference known axis.phase.
  for (const [name, personality] of Object.entries(data.personalities)) {
    personality.phases.forEach((p: string, i: number) => {
      if (!phaseNames.has(p)) {
        flag(
          errors,
          'personality-phase-unknown',
          `personality "${name}" declares phase "${p}" which is not in axis.phase.*`,
          `axis.personality.${name}.phases[${i}]`,
        );
      }
    });
  }

  // Recipe coherence: phase / personality / domains references + cross-product derivability.
  data.recipes.forEach((recipe, ri) => {
    const location = `recipes[${ri}].${recipe.name}`;
    const phaseOk = phaseNames.has(recipe.phase);
    if (!phaseOk) {
      flag(
        errors,
        'recipe-phase-unknown',
        `recipe "${recipe.name}" references phase "${recipe.phase}" which is not in axis.phase.*`,
        `${location}.phase`,
      );
    }
    const personalityOk = personalityNames.has(recipe.personality);
    if (!personalityOk) {
      flag(
        errors,
        'recipe-personality-unknown',
        `recipe "${recipe.name}" references personality "${recipe.personality}" which is not in axis.personality.*`,
        `${location}.personality`,
      );
    } else if (phaseOk) {
      const pPhases = new Set(data.personalities[recipe.personality]!.phases);
      if (!pPhases.has(recipe.phase)) {
        flag(
          errors,
          'recipe-cell-underivable',
          `recipe "${recipe.name}": personality "${recipe.personality}".phases must include "${recipe.phase}" (got ${JSON.stringify([...pPhases])})`,
          `${location}`,
        );
      }
    }
    recipe.domains.forEach((d: string, di: number) => {
      if (!domainNames.has(d)) {
        flag(
          errors,
          'recipe-domain-unknown',
          `recipe "${recipe.name}" references domain "${d}" which is not in axis.domain.*`,
          `${location}.domains[${di}]`,
        );
        return;
      }
      if (!phaseOk) return;
      const dPhases = new Set(data.domains[d]!.phases);
      if (!dPhases.has(recipe.phase)) {
        flag(
          errors,
          'recipe-cell-underivable',
          `recipe "${recipe.name}": domain "${d}".phases must include "${recipe.phase}" (got ${JSON.stringify([...dPhases])})`,
          `${location}.domains[${di}]`,
        );
      }
    });
  });

  // Singleton coherence.
  data.singletons.forEach((sing, si) => {
    const location = `singletons[${si}].${sing.name}`;
    const phaseOk = phaseNames.has(sing.phase);
    if (!phaseOk) {
      flag(
        errors,
        'singleton-phase-unknown',
        `singleton "${sing.name}" references phase "${sing.phase}" which is not in axis.phase.*`,
        `${location}.phase`,
      );
    }
    const personalityOk = personalityNames.has(sing.personality);
    if (!personalityOk) {
      flag(
        errors,
        'singleton-personality-unknown',
        `singleton "${sing.name}" references personality "${sing.personality}" which is not in axis.personality.*`,
        `${location}.personality`,
      );
    } else if (phaseOk) {
      const pPhases = new Set(data.personalities[sing.personality]!.phases);
      if (!pPhases.has(sing.phase)) {
        flag(
          errors,
          'singleton-cell-underivable',
          `singleton "${sing.name}": personality "${sing.personality}".phases must include "${sing.phase}" (got ${JSON.stringify([...pPhases])})`,
          `${location}`,
        );
      }
    }
  });

  // Retained collision.
  data.retained.forEach((r, ri) => {
    const location = `retained[${ri}].${r.name}`;
    if (domainNames.has(r.name)) {
      flag(
        errors,
        'retained-collides-with-derived-cell',
        `retained "${r.name}" collides with a derived domain cell (codegen would emit evaluator-${r.name} or whiteboard-${r.name})`,
        location,
      );
    }
    if (singletonNames.has(r.name)) {
      flag(
        errors,
        'retained-collides-with-derived-cell',
        `retained "${r.name}" collides with a singleton of the same name`,
        location,
      );
    }
  });

  // Phase default_personality references.
  for (const [name, phase] of Object.entries(data.phases)) {
    if (!personalityNames.has(phase.default_personality)) {
      flag(
        errors,
        'phase-default-personality-unknown',
        `phase "${name}" default_personality "${phase.default_personality}" is not in axis.personality.*`,
        `axis.phase.${name}.default_personality`,
      );
    }
  }

  if (errors.length === 0) return { ok: true };
  return { ok: false, errors };
}
