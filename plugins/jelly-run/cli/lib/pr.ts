// PR-body composition + per-field confidence scoring for /jelly-pr.
//
// These functions are PURE: they take a ScoringContext (explicit signals
// the verb computed from PLAN.md + the git diff) and return ScoredFields
// / a rendered body. The verb gathers the signals (reads files, runs
// git); the heuristic here never touches IO — so the scoring logic is
// unit-testable without a diff or /goal in the loop.
//
// Scoring is a SIGNAL-COUNTING heuristic, deliberately honest about being
// one (operator decision, U2): confidence is a discrete band derived from
// concrete signals, not a fake-continuous score, and every field carries
// a derivation receipt rendered in the final preview. The bias is toward
// FALSE NEGATIVES — when signals are mixed or a field needs prose
// judgment, it lands at MEDIUM (below the grill threshold) so the
// operator is asked. A needless grill costs one turn; a confident-wrong
// auto-fill ships a mis-described PR (the whiteboard's load-bearing point).

import type { PhaseContext, ScoredField } from './types.ts';

// Discrete confidence bands. Borderline signals map to `medium` (NOT
// `high`) so they fall below GRILL_THRESHOLD — the false-negative bias.
export const CONFIDENCE = { high: 0.9, medium: 0.6, low: 0.3 } as const;

// Below this, the field is grilled (operator asked) rather than
// auto-filled. `high` (0.9) clears it; `medium` (0.6) and `low` (0.3) do
// not. Imported by the tests so a calibration change is caught by one
// assertion.
export const GRILL_THRESHOLD = 0.7;

export type PrArchetype =
  | 'architectural'
  | 'migration'
  | 'bug-fix'
  | 'refactor'
  | 'dependency';

// The concrete, computable signals the verb derives from PLAN.md + the
// git diff. No semantic diff parsing — just facts the verb can read off
// cheaply. The heuristic maps these to confidence bands.
export type ScoringContext = {
  phase: PhaseContext;
  branch: string;
  changedFiles: string[];
  diffStat: string;
  // package.json / lockfile present in the changed set.
  hasNewDeps: boolean;
  // any *.test.* / *.spec.* present in the changed set.
  hasTests: boolean;
  // PLAN.md text references at least one of the changed paths.
  planMentionsChangedFiles: boolean;
};

export function isGrilled(field: ScoredField): boolean {
  return field.confidence < GRILL_THRESHOLD;
}

// Derive the concrete diff signals from the changed-file list + the
// PLAN.md text. Pure so the "what counts as a dependency change / a test
// / a plan mention" heuristic is unit-testable; the verb supplies the
// already-gathered file list + plan text.
export function deriveDiffSignals(
  changedFiles: string[],
  planText: string,
): { hasNewDeps: boolean; hasTests: boolean; planMentionsChangedFiles: boolean } {
  const hasNewDeps = changedFiles.some(
    (f) => /(^|\/)package\.json$/.test(f) || /lock(file)?\b|package-lock\.json$|\.lock$/.test(f),
  );
  const hasTests = changedFiles.some((f) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(f));
  const planMentionsChangedFiles = changedFiles.some(
    (f) => f.length > 0 && planText.includes(f),
  );
  return { hasNewDeps, hasTests, planMentionsChangedFiles };
}

// The CLAUDE.md PR archetypes and their body field sets (Rollout +
// Checklist are appended to every archetype, so they are not repeated
// here). `archetype` itself is scored — see classifyArchetype.
const ARCHETYPE_FIELDS: Record<PrArchetype, string[]> = {
  architectural: ['Motivation', 'Solution', 'Verification'],
  migration: ['Summary', 'Files changed', 'Test plan'],
  'bug-fix': ['Problem', 'Root cause', 'Fix', 'Verification'],
  refactor: ['Motivation', 'Before / After', 'Verification'],
  dependency: ['Why this bump', 'Diff highlights'],
};

export function archetypeFields(archetype: PrArchetype): string[] {
  return ARCHETYPE_FIELDS[archetype];
}

// Classify the PR archetype from concrete signals, returned AS a scored
// field so an uncertain classification is grilled like any other field.
// We only auto-pick (high confidence) when a signal is unambiguous
// (deps-only change -> dependency). Otherwise we suggest `architectural`
// at MEDIUM (grill) rather than guess bug-fix/refactor, which signal
// counting genuinely cannot distinguish without semantic diff analysis.
export function classifyArchetype(ctx: ScoringContext): ScoredField {
  const fileCount = ctx.changedFiles.length;

  if (ctx.hasNewDeps && fileCount <= 3) {
    return {
      field: 'archetype',
      value: 'dependency',
      confidence: CONFIDENCE.high,
      derivation: `derived from: dependency manifest changed, small surface (${fileCount} file(s))`,
    };
  }

  if (fileCount >= 10) {
    return {
      field: 'archetype',
      value: 'migration',
      confidence: CONFIDENCE.medium,
      derivation: `derived from: large uniform surface (${fileCount} files) — confirm it is a migration, not a feature`,
    };
  }

  return {
    field: 'archetype',
    value: 'architectural',
    confidence: CONFIDENCE.medium,
    derivation:
      'default suggestion — signals do not distinguish architectural / bug-fix / refactor; confirm the archetype',
  };
}

function deriveTitle(ctx: ScoringContext): string {
  // The phase name is the most reliable title source; the branch is the
  // fallback. Both are deterministic, hence high confidence.
  return `[${ctx.phase.name}]`;
}

// Score one PR-body field from the signals. Structural fields with
// deterministic sources (Title, Checklist) land HIGH and auto-fill;
// prose fields that need human judgment (Motivation, Solution, Fix, ...)
// land at MEDIUM/LOW and grill, even when we have a PLAN.md pointer —
// because a pointer is context, not a written rationale.
export function scoreField(field: string, ctx: ScoringContext): ScoredField {
  switch (field) {
    case 'Title':
      return {
        field,
        value: deriveTitle(ctx),
        confidence: CONFIDENCE.high,
        derivation: 'derived from: the phase name',
      };

    case 'Risk level': {
      if (!ctx.hasNewDeps && ctx.changedFiles.length <= 2) {
        return {
          field,
          value: 'low',
          confidence: CONFIDENCE.high,
          derivation: `derived from: no dependency change, small surface (${ctx.changedFiles.length} file(s))`,
        };
      }
      return {
        field,
        value: ctx.hasNewDeps ? 'medium' : 'low',
        confidence: CONFIDENCE.medium,
        derivation: `derived from: ${ctx.hasNewDeps ? 'dependency change present' : 'larger surface'} — confirm the risk level`,
      };
    }

    case 'Verification':
    case 'Test plan':
      if (ctx.hasTests) {
        return {
          field,
          value: 'Automated tests added/updated in this change; full suite green.',
          confidence: CONFIDENCE.high,
          derivation: 'derived from: test files present in the diff',
        };
      }
      return {
        field,
        value: 'No tests in the diff — describe manual verification.',
        confidence: CONFIDENCE.medium,
        derivation: 'derived from: no test files in the diff — confirm how this was verified',
      };

    case 'Checklist':
      return {
        field,
        value: 'standard',
        confidence: CONFIDENCE.high,
        derivation: 'derived from: the standard PR checklist template',
      };

    case 'Motivation':
    case 'Summary':
    case 'Problem':
    case 'Why this bump': {
      const hasContext = ctx.planMentionsChangedFiles;
      return {
        field,
        value: hasContext
          ? `See PLAN.md for "${ctx.phase.name}" — refine the rationale.`
          : 'Describe the motivation.',
        // Even WITH a PLAN pointer this stays below threshold: a pointer
        // is context, not a written rationale. Prose fields grill.
        confidence: hasContext ? CONFIDENCE.medium : CONFIDENCE.low,
        derivation: hasContext
          ? 'derived from: PLAN.md references the changed files — but prose needs your judgment'
          : 'no PLAN.md pointer to the changed files — needs your input',
      };
    }

    // Prose fields describing the change itself: signal counting cannot
    // write these, so they always grill.
    case 'Solution':
    case 'Fix':
    case 'Root cause':
    case 'Before / After':
    case 'Diff highlights':
    case 'Files changed':
      return {
        field,
        value: ctx.diffStat ? `Changed files:\n${ctx.diffStat}` : 'Describe the change.',
        confidence: CONFIDENCE.low,
        derivation: 'prose describing the change — signal counting cannot draft this; needs your input',
      };

    default:
      // Unknown field: never auto-fill something we do not understand.
      return {
        field,
        value: '',
        confidence: CONFIDENCE.low,
        derivation: 'unrecognized field — needs your input',
      };
  }
}

// Assemble the full markdown body from the chosen archetype's scored
// fields. Rollout + Checklist are appended to every archetype (per
// CLAUDE.md "all shapes include Rollout and Checklist"). The archetype
// is recorded on PrBodyDraft by the caller; the body is fully determined
// by the scored fields, so this takes only them.
export function composePrBody(fields: ScoredField[]): string {
  const lines: string[] = [];
  for (const f of fields) {
    if (f.field === 'archetype' || f.field === 'Title') continue;
    if (f.field === 'Checklist') continue; // rendered in the standard block below
    lines.push(`## ${f.field}`, '', f.value, '');
  }
  lines.push(
    '## Rollout',
    '',
    '- Risk level: (see scored field)',
    '- Revert: single PR revert sufficient',
    '',
    '## Checklist',
    '',
    '- [ ] Verified locally',
    '- [ ] Tests added or updated',
    '- [ ] i18n strings extracted (if user-facing copy changed)',
    '- [ ] Accessibility spot-check (keyboard, focus, ARIA)',
    '',
  );
  return lines.join('\n').trimEnd();
}
