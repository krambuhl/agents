#!/usr/bin/env node
//
// THROWAWAY: Phase 1.1 U1 of guild-matrix-precompile.
//
// Converts plugins/guild/{panel.manifest.toml, tools-map.toml} + the 5
// personality fragments' ## Disposition sections into the declarative
// plugins/guild/axes.toml shape per PLAN.md § Phase 1.1.
//
// Idempotent: re-running produces a byte-identical axes.toml. The
// committed axes.toml is the seed; this script ships only so the
// conversion logic is auditable. Phase 2.2 (delete-and-replace) will
// remove this script along with panel.manifest.toml + tools-map.toml,
// leaving axes.toml as the long-term source.
//
// Anonymous [[combinations]] in panel.manifest.toml convert into named
// [[recipes]] in axes.toml — PLAN.md § Phase 1.1 lists only [[recipes]]
// / [[singletons]] / [[retained]] as the panel-set top-level sections,
// so combinations must fold into recipes. Naming convention is
// substrate-meaningful but pragmatic — these names are auditable in
// later phases:
//   - "reviewer-default"     ← the 8-domain skeptic + reviewer combo
//   - "planner-performance"  ← methodical + planner + [performance, substrate]
//   - "planner-react"        ← synthesizer + planner + [react, test-unit, test-integration]
//   - "planner-a11y"         ← generative + planner + [a11y]
//   - "design-systems"       ← (existing) generative + planner + [composition, abstraction, tokens, naming]
//
// Run with: `node plugins/guild/scripts/convert-to-axes.ts`

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseToml,
  type TomlTable,
  type TomlValue,
  isTomlTable,
} from '../cli/lib/toml.ts';

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)));

// ---------- Axis-value lists (ordered) ----------

const DOMAINS = [
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
] as const;

const PERSONALITIES = [
  'generative',
  'methodical',
  'pragmatist',
  'skeptic',
  'synthesizer',
] as const;

const PHASES = ['researcher', 'planner', 'reviewer', 'implementer'] as const;

type Phase = (typeof PHASES)[number];

const DEFAULT_PERSONALITY: Record<Phase, string> = {
  reviewer: 'skeptic',
  planner: 'synthesizer',
  researcher: 'methodical',
  implementer: 'pragmatist',
};

const DEFAULT_PERSONALITY_RATIONALE: Record<Phase, string> = {
  reviewer:
    'matches existing panel.manifest.toml — every reviewer combination is skeptic-led',
  planner:
    "reconcile competing constraints into one coherent plan maps to synthesizer's disposition",
  researcher:
    "leave nothing unexamined maps to methodical's exhaustive evidence-gathering disposition",
  implementer:
    "simplest thing that works and reads well maps to pragmatist's disposition",
};

// ---------- Read source files ----------

const panelManifest = parseToml(
  readFileSync(join(pluginRoot, 'panel.manifest.toml'), 'utf8'),
);
const toolsMap = parseToml(
  readFileSync(join(pluginRoot, 'tools-map.toml'), 'utf8'),
);

// ---------- TOML traversal helpers ----------

function getTable(
  t: TomlValue | undefined,
  key: string,
): TomlTable | undefined {
  if (!isTomlTable(t)) return undefined;
  const v = t[key];
  return isTomlTable(v) ? v : undefined;
}

function getArray(t: TomlValue | undefined, key: string): TomlValue[] {
  if (!isTomlTable(t)) return [];
  const v = t[key];
  return Array.isArray(v) ? v : [];
}

function getString(
  t: TomlValue | undefined,
  key: string,
): string | undefined {
  if (!isTomlTable(t)) return undefined;
  const v = t[key];
  return typeof v === 'string' ? v : undefined;
}

function getBool(t: TomlValue | undefined, key: string): boolean {
  if (!isTomlTable(t)) return false;
  const v = t[key];
  return typeof v === 'boolean' && v;
}

function getStringArray(t: TomlValue | undefined, key: string): string[] {
  return getArray(t, key).filter((v: TomlValue): v is string => typeof v === 'string');
}

// ---------- Derive per-axis-value data ----------

function derivePhasesForDomain(domain: string): string[] {
  const phases = new Set<string>();
  for (const combo of getArray(panelManifest, 'combinations')) {
    if (getStringArray(combo, 'domains').includes(domain)) {
      const phase = getString(combo, 'phase');
      if (phase) phases.add(phase);
    }
  }
  for (const recipe of getArray(panelManifest, 'recipes')) {
    if (getStringArray(recipe, 'domains').includes(domain)) {
      const phase = getString(recipe, 'phase');
      if (phase) phases.add(phase);
    }
  }
  return PHASES.filter((p: string) => phases.has(p));
}

function derivePhasesForPersonality(personality: string): string[] {
  const phases = new Set<string>();
  for (const combo of getArray(panelManifest, 'combinations')) {
    if (getString(combo, 'personality') === personality) {
      const phase = getString(combo, 'phase');
      if (phase) phases.add(phase);
    }
  }
  for (const recipe of getArray(panelManifest, 'recipes')) {
    if (getString(recipe, 'personality') === personality) {
      const phase = getString(recipe, 'phase');
      if (phase) phases.add(phase);
    }
  }
  for (const sing of getArray(panelManifest, 'singletons')) {
    if (getString(sing, 'personality') === personality) {
      const phase = getString(sing, 'phase');
      if (phase) phases.add(phase);
    }
  }
  return PHASES.filter((p: string) => phases.has(p));
}

function getDomainGrants(domain: string): string[] {
  const domainTable = getTable(getTable(toolsMap, 'domain'), domain);
  return getStringArray(domainTable, 'grants');
}

function getPhasePosture(phase: string): { base_tools: string[]; writes: boolean } {
  const phaseTable = getTable(getTable(toolsMap, 'phase'), phase);
  return {
    base_tools: getStringArray(phaseTable, 'base'),
    writes: getBool(phaseTable, 'writes'),
  };
}

function extractDisposition(personality: string): string {
  const path = join(pluginRoot, 'agents', 'personalities', `${personality}.md`);
  const content = readFileSync(path, 'utf8');
  const lines = content.split('\n');
  const headIdx = lines.findIndex((l: string) => l.trim() === '## Disposition');
  if (headIdx === -1) {
    throw new Error(`No "## Disposition" heading in ${personality}.md`);
  }
  const para: string[] = [];
  for (let i = headIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) break;
    const trimmed = line.trim();
    if (trimmed === '' && para.length > 0) break;
    if (trimmed === '') continue;
    if (trimmed.startsWith('- ') || trimmed.startsWith('## ')) break;
    para.push(trimmed);
  }
  return para.join(' ');
}

// ---------- TOML serialization helpers ----------

function tomlString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function tomlStringArray(arr: string[]): string {
  return `[${arr.map(tomlString).join(', ')}]`;
}

// ---------- Combination-to-recipe naming ----------

// Anonymous [[combinations]] in panel.manifest.toml become named
// [[recipes]] in axes.toml. The map below is the authoring decision
// for U1; operator can rename in later phases.
function combinationToRecipeName(combo: TomlTable): string | undefined {
  const phase = getString(combo, 'phase');
  const personality = getString(combo, 'personality');
  const domains = getStringArray(combo, 'domains');
  if (!phase || !personality) return undefined;
  if (phase === 'reviewer' && personality === 'skeptic') return 'reviewer-default';
  if (phase === 'planner' && personality === 'methodical') return 'planner-performance';
  if (phase === 'planner' && personality === 'synthesizer') return 'planner-react';
  if (phase === 'planner' && personality === 'generative' && domains.length === 1 && domains[0] === 'a11y')
    return 'planner-a11y';
  return undefined;
}

// ---------- Build axes.toml ----------

const sections: string[] = [];

sections.push(`schema_version = 1\n`);

sections.push(
  `# axes.toml — declarative cross-product source for guild's antagonist\n` +
  `# panel. Replaces panel.manifest.toml + tools-map.toml; generated by\n` +
  `# scripts/convert-to-axes.ts (Phase 1.1 U1 of guild-matrix-precompile)\n` +
  `# and seed-committed. Phase 1.2's pipeline reads this file; Phase 2.2\n` +
  `# deletes the conversion script + the legacy TOMLs and this becomes\n` +
  `# the long-term source.\n`,
);

// axis.domain
sections.push(
  `# ---------- axis: domain (12) ----------\n` +
  `# Each domain declares which phases it occupies plus the Bash tool\n` +
  `# grants it adds at verification phases (reviewer + implementer).\n` +
  `# Empty tool_grants = phase base only.\n`,
);
for (const domain of DOMAINS) {
  const phases = derivePhasesForDomain(domain);
  const grants = getDomainGrants(domain);
  sections.push(
    `[axis.domain.${domain}]\n` +
      `phases = ${tomlStringArray(phases)}\n` +
      `tool_grants = ${tomlStringArray(grants)}\n`,
  );
}

// axis.personality
sections.push(
  `# ---------- axis: personality (5) ----------\n` +
  `# Each personality declares which phases the voice currently has\n` +
  `# at-least-one cell at, plus the disposition excerpt (first\n` +
  `# paragraph of the fragment's ## Disposition section) for LLM\n` +
  `# fusion input. pragmatist.phases is empty because no current\n` +
  `# combination/recipe/singleton names pragmatist; the personality\n` +
  `# is authored but not yet instantiated (the fragment's ## Phase\n` +
  `# modulation describes all four phases). axis.phase.implementer's\n` +
  `# default_personality references pragmatist forward-looking — when\n` +
  `# implementer cells get added later, pragmatist will be the\n` +
  `# default.\n`,
);
for (const personality of PERSONALITIES) {
  const phases = derivePhasesForPersonality(personality);
  const disposition = extractDisposition(personality);
  sections.push(
    `[axis.personality.${personality}]\n` +
      `phases = ${tomlStringArray(phases)}\n` +
      `disposition = ${tomlString(disposition)}\n`,
  );
}

// axis.phase
sections.push(
  `# ---------- axis: phase (4) ----------\n` +
  `# Each phase declares its base tool floor, write capability, and\n` +
  `# default_personality (forward-looking metadata — the personality\n` +
  `# that leads a hypothetical recipe at this phase if not explicitly\n` +
  `# named). Rationale for each default is the trailing comment.\n`,
);
for (const phase of PHASES) {
  const { base_tools, writes } = getPhasePosture(phase);
  const def = DEFAULT_PERSONALITY[phase];
  const rationale = DEFAULT_PERSONALITY_RATIONALE[phase];
  sections.push(
    `[axis.phase.${phase}]\n` +
      `base_tools = ${tomlStringArray(base_tools)}\n` +
      `writes = ${writes}\n` +
      `default_personality = ${tomlString(def)}  # ${rationale}\n`,
  );
}

// recipes — converted from anonymous combinations + the existing
// design-systems recipe, in deterministic order.
sections.push(
  `# ---------- recipes (5) ----------\n` +
  `# Each recipe names a curated subset of (phase, domain,\n` +
  `# personality) cells for guild-spawn. Recipes replace the\n` +
  `# anonymous [[combinations]] table from panel.manifest.toml +\n` +
  `# preserve the existing design-systems recipe. Cells must be\n` +
  `# derivable from the cross-product (axis.phase exists; phase ∈\n` +
  `# axis.domain.<d>.phases and axis.personality.<p>.phases). The\n` +
  `# Phase-1.1 U1 naming is in the script header; later phases may\n` +
  `# rename.\n`,
);

// Recipes from anonymous combinations.
for (const combo of getArray(panelManifest, 'combinations')) {
  if (!isTomlTable(combo)) continue;
  const name = combinationToRecipeName(combo);
  if (!name) continue;
  const phase = getString(combo, 'phase');
  const personality = getString(combo, 'personality');
  const domains = getStringArray(combo, 'domains');
  if (!phase || !personality) continue;
  sections.push(
    `[[recipes]]\n` +
      `name = ${tomlString(name)}\n` +
      `phase = ${tomlString(phase)}\n` +
      `personality = ${tomlString(personality)}\n` +
      `domains = ${tomlStringArray(domains)}\n`,
  );
}

// Existing named recipes from panel.manifest.toml.
for (const recipe of getArray(panelManifest, 'recipes')) {
  if (!isTomlTable(recipe)) continue;
  const name = getString(recipe, 'name');
  const phase = getString(recipe, 'phase');
  const personality = getString(recipe, 'personality');
  const domains = getStringArray(recipe, 'domains');
  if (!name || !phase || !personality) continue;
  sections.push(
    `[[recipes]]\n` +
      `name = ${tomlString(name)}\n` +
      `phase = ${tomlString(phase)}\n` +
      `personality = ${tomlString(personality)}\n` +
      `domains = ${tomlStringArray(domains)}\n`,
  );
}

// singletons
sections.push(
  `# ---------- singletons (1) ----------\n` +
  `# A singleton is a (phase, personality) pair with NO domain — the\n` +
  `# domain-agnostic agent. whiteboard-skeptic is the skeptic at\n` +
  `# planner that pressure-tests whatever brief it receives, taking\n` +
  `# the brief's domain at dispatch rather than baking one in.\n`,
);
for (const sing of getArray(panelManifest, 'singletons')) {
  if (!isTomlTable(sing)) continue;
  const phase = getString(sing, 'phase');
  const personality = getString(sing, 'personality');
  const name = getString(sing, 'name');
  if (!phase || !personality || !name) continue;
  sections.push(
    `[[singletons]]\n` +
      `name = ${tomlString(name)}\n` +
      `phase = ${tomlString(phase)}\n` +
      `personality = ${tomlString(personality)}\n`,
  );
}

// retained — convert from `[retained] hand_authored = [...]` to array-of-tables.
sections.push(
  `# ---------- retained (1) ----------\n` +
  `# Hand-authored agents codegen never touches. contract-fit is the\n` +
  `# always-on baseline reviewer — a panel-composition role, not a\n` +
  `# personality x domain combination — the one principled exception\n` +
  `# to the cross-product. evaluator-base and whiteboard-base are\n` +
  `# documentation roots inlined into every generated body by\n` +
  `# codegen; they are not separately retained at the axes-level.\n`,
);
const retainedTable = getTable(panelManifest, 'retained');
const retainedNames = getStringArray(retainedTable, 'hand_authored');
for (const name of retainedNames) {
  sections.push(`[[retained]]\nname = ${tomlString(name)}\n`);
}

// ---------- Write output ----------

const output = sections.join('\n');
writeFileSync(join(pluginRoot, 'modes', 'axes.toml'), output);
process.stdout.write(`wrote ${join(pluginRoot, 'modes', 'axes.toml')} (${output.length} bytes)\n`);
