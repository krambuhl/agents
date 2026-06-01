// phase-prefix — the single source of truth for the axes.toml phase axis →
// agent-name / cell-id prefix mapping. `reviewer` keeps its historical
// prefix (evaluator); every other phase prefixes with its own name, so the
// phase token, the agent surface, and the loom verb read the same word
// (`plan`, `research`, `implementer`, `fixer`).
//
// Both the compile pipeline (derive.ts → cell ids) and the runtime recipe
// resolver (recipe.ts → agent names) read this. It was previously two
// hand-synced copies — when one changed the other had to be remembered —
// so this module collapses them to one. Each consumer keeps its own
// lookup wrapper so it can throw its own domain-specific error
// (DeriveError vs RecipeReadError) and preserve error provenance.

export const PHASE_PREFIX: Record<string, string> = {
  reviewer: 'evaluator',
  plan: 'plan',
  research: 'research',
  implementer: 'implementer',
  fixer: 'fixer',
};
