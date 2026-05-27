// guild generate — compile the 3-axis source (personality x domain x
// phase) into scoped agent files.
//
// This verb is a pure CRUD-shaped fold, not an orchestration. It reads
// source input and writes one agent file per emitted agent:
//   - panel.manifest.toml — the NEEDED agents to emit, across three
//     section shapes: [[combinations]] (personality x domains @ phase),
//     [[recipes]] (the same shape, a named multi-domain co-dispatch), and
//     [[singletons]] (a personality @ phase with NO domain — the named
//     exception for the domain-agnostic whiteboard-skeptic).
//   - tools-map.toml      — the least-privilege tool fold
//     (phase.base UNION domain.grants; a domainless singleton is base-only).
//   - the source fragments — personality-base + the phase, domain, and
//     personality mode files, inlined reference-free into each agent.
//
// It does NOT derive the panel, run a smoke test, or git-add its output.
// Panel derivation is derive-panel's job; staging is the loop's job; the
// freshness/smoke tests are separate targets. Keep this a fold.
//
// Two modes:
//   - default        — fold the CORE manifest (--source-dir, the plugin)
//                       into agents/generated/.
//   - --project-dir   — the off-rails escape hatch. Fold a PROJECT-LOCAL
//                       manifest's agents, resolving domain fragments from
//                       the project first (core as fallback) while base /
//                       phase / personality / tools-map still come from
//                       core. A consumer adds a project-local domain
//                       without copying core fragments. Emits only the
//                       project's agents, not the core panel.
//
// [retained] (contract-fit) is never generated.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import {
  isTomlTable,
  parseToml,
  type TomlTable,
  TomlParseError,
} from '../../lib/toml.ts';
import type { DispatchResult, GuildVerbHandler } from './index.ts';

class GenerateError extends Error {}

// phase -> generated-name prefix. Reviewer combinations replace the
// baked evaluator-* agents; planner combinations replace the baked
// whiteboard-* engineers. The name equals the baked name on the
// reviewer side exactly (evaluator-a11y); on the planner side the
// descriptive-suffixed baked names (whiteboard-react-architect, ...)
// are renamed to <prefix>-<domain> by design — caller migration is a
// Phase 7 concern, tracked in the equivalence snapshot.
const PHASE_PREFIX: Record<string, string> = {
  reviewer: 'evaluator',
  planner: 'whiteboard',
};

const PHASE_ROLE: Record<string, string> = {
  reviewer: 'evaluator',
  planner: 'whiteboard-engineer',
};

// maxTurns is a phase-determined fact: only reviewer-phase agents carry
// it (the tight antagonist-panel budget). Read off the phase, never a
// per-combination flag.
const PHASE_MAX_TURNS: Record<string, number> = {
  reviewer: 5,
};

export type Combination = {
  phase: string;
  personality: string;
  domains: string[];
};

export type Singleton = {
  phase: string;
  personality: string;
  name: string;
};

export type AgentPlan = {
  name: string;
  role: string;
  phase: string;
  personality: string;
  // undefined for singletons (the domain-agnostic skeptic): no domain
  // fragment is inlined and tools resolve to the phase base alone.
  domain?: string;
  tools: string[];
  maxTurns?: number;
  description: string;
};

// ---------- Tools fold ----------

function phaseBase(toolsMap: TomlTable, phase: string): string[] | undefined {
  const section = toolsMap.phase;
  if (!isTomlTable(section)) return undefined;
  const row = section[phase];
  if (!isTomlTable(row)) return undefined;
  const base = row.base;
  if (!Array.isArray(base) || !base.every((t) => typeof t === 'string')) {
    throw new GenerateError(`tools-map [phase.${phase}].base is malformed`);
  }
  return base as string[];
}

function domainGrants(toolsMap: TomlTable, domain: string): string[] {
  const section = toolsMap.domain;
  if (!isTomlTable(section)) return [];
  const row = section[domain];
  // Absent [domain.<d>] row means "phase base only" — a default, not an
  // error. The grep-only and design-phase domains hit this path.
  if (!isTomlTable(row)) return [];
  const grants = row.grants;
  if (grants === undefined) return [];
  if (!Array.isArray(grants) || !grants.every((t) => typeof t === 'string')) {
    throw new GenerateError(`tools-map [domain.${domain}].grants is malformed`);
  }
  return grants as string[];
}

// Domain grants apply ONLY at the phases that run verification. Per the
// tools-map.toml contract: "domain grants apply only at the phases that
// run verification (reviewer, implementer); researcher and planner get
// the phase base alone." So a planner agent on a granted domain (e.g.
// whiteboard-react) is still base-only — matching the baked whiteboard-*
// agents, which all carry exactly Read, Glob, Grep.
const VERIFICATION_PHASES = new Set(['reviewer', 'implementer']);

// agent.tools = phase.base [UNION domain.grants only at a verification
// phase], deduped, canonical order (phase base in tools-map order, then
// domain grants in tools-map order). A domainless agent (singleton), and
// any planner/researcher agent, is phase base only. FAIL LOUD when the
// phase has no tools-map row — never emit a permissive empty tools line.
export function resolveTools(
  phase: string,
  domain: string | undefined,
  toolsMap: TomlTable,
): string[] {
  const base = phaseBase(toolsMap, phase);
  if (base === undefined) {
    throw new GenerateError(
      `no [phase.${phase}] row in tools-map.toml (an agent references phase '${phase}'); refusing to emit a permissive empty tools line`,
    );
  }
  const grants =
    domain !== undefined && VERIFICATION_PHASES.has(phase)
      ? domainGrants(toolsMap, domain)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tool of [...base, ...grants]) {
    if (!seen.has(tool)) {
      seen.add(tool);
      out.push(tool);
    }
  }
  return out;
}

// ---------- Naming + frontmatter synthesis ----------

export function nameFor(phase: string, domain: string): string {
  const prefix = PHASE_PREFIX[phase];
  if (prefix === undefined) {
    throw new GenerateError(
      `no agent-name prefix for phase '${phase}' (generate emits reviewer/planner agents only)`,
    );
  }
  return `${prefix}-${domain}`;
}

function roleFor(phase: string): string {
  const role = PHASE_ROLE[phase];
  if (role === undefined) {
    throw new GenerateError(`no role for phase '${phase}'`);
  }
  return role;
}

// Deterministic synthesized description. The equivalence contract that
// gates Phase 7 deletion is name + tools, NOT description — so this is a
// templated one-liner derived from the axes, not parsed from fragment
// prose (parsing prose would make the fold a scalpel rather than a cat).
// Kept colon-free; emitted as a double-quoted YAML scalar.
function synthesizeDescription(
  personality: string,
  domain: string | undefined,
  phase: string,
): string {
  if (domain === undefined) {
    return `${personality} ${phase} whiteboard engineer — domain-agnostic ${personality} perspective that takes the brief's domain at dispatch (generated from the ${personality} personality x ${phase} phase via guild generate, no domain inlined).`;
  }
  const provenance = `generated from the ${personality} personality x ${domain} domain x ${phase} phase via guild generate`;
  if (phase === 'reviewer') {
    return `${personality} ${domain} evaluator — antagonist-panel reviewer applying the ${domain} antipattern catalog (${provenance}).`;
  }
  return `${personality} ${domain} whiteboard engineer — design-phase ${domain} perspective (${provenance}).`;
}

// Provenance banner written as the first body line of every generated
// file. It cannot precede the frontmatter — the agent loader requires
// the YAML block at line 1 — so it sits just below the closing `---`.
const GENERATED_BANNER =
  '<!-- GENERATED by `guild generate` from panel.manifest.toml + tools-map.toml. Do not edit by hand; regenerate with `guild generate`. -->';

function renderFrontmatter(plan: AgentPlan): string {
  const lines = [
    '---',
    `name: ${plan.name}`,
    `role: ${plan.role}`,
    `description: "${plan.description}"`,
    `tools: ${plan.tools.join(', ')}`,
    'model: inherit',
  ];
  if (plan.maxTurns !== undefined) lines.push(`maxTurns: ${plan.maxTurns}`);
  lines.push('---');
  return lines.join('\n');
}

// Strip a leading YAML frontmatter block, if present. The personality
// fragments carry frontmatter (they live under agents/); the phase and
// domain mode fragments do not. Only the body is inlined.
export function stripFrontmatter(content: string): string {
  const lines = content.split('\n');
  if (lines[0]?.trim() !== '---') return content;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return lines.slice(i + 1).join('\n');
    }
  }
  return content;
}

// Inline the fragment bodies in the Phase-4 composition order:
// personality-base -> phase -> domain -> personality (personality
// innermost as the modulating voice). A singleton omits the domain
// fragment. A plain concatenation — the fragments are reference-free,
// so no dispatch-time read survives.
export function composeBody(fragments: string[]): string {
  return `${fragments.map((f) => stripFrontmatter(f).trim()).join('\n\n')}\n`;
}

// ---------- Planning ----------

// [[combinations]] and [[recipes]] share a shape: a personality applied
// to a list of domains at a phase. A recipe carries an extra `name`
// (its co-dispatch label, consumed at dispatch time, not at codegen);
// for file emission it folds identically to a combination.
function readCombinationLike(manifest: TomlTable, key: string): Combination[] {
  const raw = manifest[key];
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new GenerateError(`panel.manifest.toml: ${key} is not an array`);
  }
  return raw.map((entry, i) => {
    if (!isTomlTable(entry)) {
      throw new GenerateError(`${key}[${i}] is not a table`);
    }
    const { phase, personality, domains } = entry;
    if (typeof phase !== 'string') {
      throw new GenerateError(`${key}[${i}] has no string 'phase'`);
    }
    if (typeof personality !== 'string') {
      throw new GenerateError(`${key}[${i}] has no string 'personality'`);
    }
    if (!Array.isArray(domains) || !domains.every((d) => typeof d === 'string')) {
      throw new GenerateError(`${key}[${i}] has no string[] 'domains'`);
    }
    return { phase, personality, domains: domains as string[] };
  });
}

// [[singletons]] — the named exception for a domain-agnostic agent (the
// whiteboard-skeptic). An explicit `name` is required: a singleton is
// declared, never a silently empty `domains = []`.
function readSingletons(manifest: TomlTable): Singleton[] {
  const raw = manifest.singletons;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new GenerateError('panel.manifest.toml: singletons is not an array');
  }
  return raw.map((entry, i) => {
    if (!isTomlTable(entry)) {
      throw new GenerateError(`singletons[${i}] is not a table`);
    }
    const { phase, personality, name } = entry;
    if (typeof phase !== 'string') {
      throw new GenerateError(`singletons[${i}] has no string 'phase'`);
    }
    if (typeof personality !== 'string') {
      throw new GenerateError(`singletons[${i}] has no string 'personality'`);
    }
    if (typeof name !== 'string') {
      throw new GenerateError(`singletons[${i}] has no string 'name'`);
    }
    return { phase, personality, name };
  });
}

// Fan combinations + recipes into per-domain plans and singletons into
// domainless plans, resolving each plan's tools (fail-loud here, before
// any fragment is read), then sort by name for deterministic
// enumeration. Duplicate names are an error (two agents claiming the
// same generated file).
export function planAgents(
  manifest: TomlTable,
  toolsMap: TomlTable,
): AgentPlan[] {
  const plans: AgentPlan[] = [];

  for (const combo of [
    ...readCombinationLike(manifest, 'combinations'),
    ...readCombinationLike(manifest, 'recipes'),
  ]) {
    for (const domain of combo.domains) {
      plans.push({
        name: nameFor(combo.phase, domain),
        role: roleFor(combo.phase),
        phase: combo.phase,
        personality: combo.personality,
        domain,
        tools: resolveTools(combo.phase, domain, toolsMap),
        maxTurns: PHASE_MAX_TURNS[combo.phase],
        description: synthesizeDescription(combo.personality, domain, combo.phase),
      });
    }
  }

  for (const singleton of readSingletons(manifest)) {
    plans.push({
      name: singleton.name,
      role: roleFor(singleton.phase),
      phase: singleton.phase,
      personality: singleton.personality,
      domain: undefined,
      tools: resolveTools(singleton.phase, undefined, toolsMap),
      maxTurns: PHASE_MAX_TURNS[singleton.phase],
      description: synthesizeDescription(
        singleton.personality,
        undefined,
        singleton.phase,
      ),
    });
  }

  plans.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const seen = new Set<string>();
  for (const plan of plans) {
    if (seen.has(plan.name)) {
      throw new GenerateError(`duplicate generated agent name '${plan.name}'`);
    }
    seen.add(plan.name);
  }
  return plans;
}

// ---------- Verb ----------

function fail(reason: string): DispatchResult {
  return { stderr: `guild-generate-error: ${reason}`, exitCode: 1 };
}

// The plugin root (plugins/guild), resolved from this file's own
// location rather than process.cwd() — the source fragments are part of
// the plugin and sit at a fixed offset from this verb, so module-
// relative resolution is robust to where the CLI is invoked from
// (including from inside an installed marketplace copy).
function defaultSourceDir(): string {
  // this file: plugins/guild/cli/verbs/guild/generate.ts
  return resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
}

function readFragment(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new GenerateError(`source fragment not found: ${path}`);
    }
    throw err;
  }
}

// Resolve a domain fragment: the project's own domains/ first (the
// off-rails escape hatch), then core modes/domains/. readFragment fails
// loud if neither has it.
function domainFragmentPath(
  domain: string,
  sourceDir: string,
  projectDir: string | undefined,
): string {
  if (projectDir !== undefined) {
    const projectPath = join(projectDir, 'domains', `${domain}.md`);
    if (existsSync(projectPath)) return projectPath;
  }
  return join(sourceDir, 'modes', 'domains', `${domain}.md`);
}

export const generateVerb: GuildVerbHandler = (rest) => {
  let values: { 'source-dir'?: string; 'project-dir'?: string; out?: string };
  try {
    ({ values } = parseArgs({
      args: rest,
      options: {
        'source-dir': { type: 'string' },
        'project-dir': { type: 'string' },
        out: { type: 'string' },
      },
      allowPositionals: false,
      strict: true,
    }));
  } catch (err) {
    return fail(`bad args: ${(err as Error).message}`);
  }

  // Core fragments + tools-map always come from --source-dir (the
  // plugin). --project-dir, when present, supplies the manifest to fold
  // and project-local domain fragments; it emits only the project's
  // agents, not the core panel.
  const sourceDir = values['source-dir'] ?? defaultSourceDir();
  const projectDir = values['project-dir'];
  const manifestDir = projectDir ?? sourceDir;
  const outDir = values.out ?? join(manifestDir, 'agents', 'generated');

  try {
    const manifest = parseToml(
      readFileSync(join(manifestDir, 'panel.manifest.toml'), 'utf8'),
    );
    const toolsMap = parseToml(
      readFileSync(join(sourceDir, 'tools-map.toml'), 'utf8'),
    );

    // Plan first — this resolves every agent's tools and fails loud on a
    // missing phase row before a single file is written.
    const plans = planAgents(manifest, toolsMap);

    mkdirSync(outDir, { recursive: true });
    const personalityBase = readFragment(
      join(sourceDir, 'agents', 'personalities', 'personality-base.md'),
    );

    const emitted: string[] = [];
    for (const plan of plans) {
      const phaseFrag = readFragment(
        join(sourceDir, 'modes', 'phases', `${plan.phase}.md`),
      );
      const personalityFrag = readFragment(
        join(sourceDir, 'agents', 'personalities', `${plan.personality}.md`),
      );
      const fragments = [personalityBase, phaseFrag];
      if (plan.domain !== undefined) {
        fragments.push(
          readFragment(domainFragmentPath(plan.domain, sourceDir, projectDir)),
        );
      }
      fragments.push(personalityFrag);
      writeFileSync(
        join(outDir, `${plan.name}.md`),
        `${renderFrontmatter(plan)}\n\n${GENERATED_BANNER}\n\n${composeBody(fragments)}`,
      );
      emitted.push(`${plan.name}.md`);
    }

    return {
      stdout: JSON.stringify({ emitted, out: outDir, count: emitted.length }),
      exitCode: 0,
    };
  } catch (err) {
    if (err instanceof GenerateError) return fail(err.message);
    if (err instanceof TomlParseError) return fail(`toml parse: ${err.message}`);
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return fail(`source file not found: ${e.path}`);
    throw err;
  }
};
