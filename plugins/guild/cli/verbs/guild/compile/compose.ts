import { createHash } from 'node:crypto';

import type {
  ComposedAgent,
  ResolvedCell,
  SourceHashes,
} from './types.ts';

// compose: ResolvedCell → ComposedAgent.
//
// Per PLAN.md § Phase 2.1 exit criterion 3:
//   "compose dedup is real: overlapping guidance between personality
//    + domain fragments is collapsed in the input bundle before
//    fusion sees it, so the LLM operates on minimal non-redundant
//    source material."
//
// U2 implements identical-line dedup (mechanical, deterministic):
// any non-blank line (after trim) appearing verbatim in 2+ fragments
// is emitted only in the FIRST-OCCURRING axis section (phase >
// personality > domain) and dropped from later sections. Semantic
// overlap (different wording, same idea) stays — that's what U3's
// LLM fusion is for.
//
// Each cell's composed body is:
//
//   1. YAML frontmatter (name, role, description, tools, model, maxTurns).
//   2. A provenance comment (do-not-edit; regenerate via guild compile).
//   3. Per axis (personality, phase, domain):
//      a. A `<!-- DEDUP: dropped N line(s) ... -->` annotation when
//         dedup pulled lines out of this axis (omitted when N=0).
//         The annotation names the other axes that contributed each
//         shared line — fusion uses it as context.
//      b. `<!-- @section: <axis> -->` section marker.
//      c. The (possibly deduped) fragment body.
//
// Empty axes after dedup still emit their @section marker so the
// bundle shape is uniform; the dropped-N annotation tells fusion
// the section was emptied.
//
// SHA-256 source hashes are computed from the RAW fragment bodies
// (before dedup) so the cache fingerprint is independent of dedup
// behavior. The output hash (committed separately as the cache
// entry's output_hash) is computed by emit.

const PHASE_ROLE: Record<string, string> = {
  reviewer: 'evaluator',
  plan: 'plan',
};

const AXIS_ORDER = ['phase', 'personality', 'domain'] as const;
type Axis = (typeof AXIS_ORDER)[number];

function roleForPhase(phase: string): string {
  return PHASE_ROLE[phase] ?? phase;
}

function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

function frontmatter(cell: ResolvedCell): string {
  const role = roleForPhase(cell.phase);
  const description = cell.domain
    ? `${cell.personality} ${cell.domain} ${role} — composed from the ${cell.personality} personality x ${cell.domain} domain x ${cell.phase} phase via guild compile.`
    : `${cell.personality} ${role} — composed from the ${cell.personality} personality at the ${cell.phase} phase (no domain) via guild compile.`;
  return [
    '---',
    `name: ${cell.id}`,
    `role: ${role}`,
    `description: ${JSON.stringify(description)}`,
    `tools: ${cell.tools.join(', ')}`,
    'model: inherit',
    'maxTurns: 5',
    '---',
  ].join('\n');
}

interface DedupResult {
  bodies: Record<Axis, string>;
  drops: Record<Axis, { count: number; sharedWith: Axis[] }>;
}

function dedupFragments(cell: ResolvedCell): DedupResult {
  // First-occurrence wins by axis order (phase > personality > domain).
  // A line is "shared" if its trimmed text is non-empty and appears
  // verbatim in 2+ fragments. The owning axis keeps it; later axes
  // drop the line and accumulate a sharedWith entry naming the
  // axes that also had it.
  const fragmentsByAxis: Record<Axis, string> = {
    phase: cell.phase_fragment,
    personality: cell.personality_fragment,
    domain: cell.domain_fragment,
  };

  // Build line-presence map: trimmed line → set of axes it appears in.
  const presence = new Map<string, Set<Axis>>();
  for (const axis of AXIS_ORDER) {
    const lines = fragmentsByAxis[axis].split('\n');
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (trimmed.length === 0) continue;
      let set = presence.get(trimmed);
      if (set === undefined) {
        set = new Set();
        presence.set(trimmed, set);
      }
      set.add(axis);
    }
  }

  const bodies: Record<Axis, string> = {
    phase: '',
    personality: '',
    domain: '',
  };
  const drops: Record<Axis, { count: number; sharedWith: Axis[] }> = {
    phase: { count: 0, sharedWith: [] },
    personality: { count: 0, sharedWith: [] },
    domain: { count: 0, sharedWith: [] },
  };
  const droppedByAxis: Record<Axis, Set<Axis>> = {
    phase: new Set(),
    personality: new Set(),
    domain: new Set(),
  };

  for (const axis of AXIS_ORDER) {
    const lines = fragmentsByAxis[axis].split('\n');
    const kept: string[] = [];
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (trimmed.length === 0) {
        kept.push(raw);
        continue;
      }
      const shareSet = presence.get(trimmed)!;
      if (shareSet.size < 2) {
        kept.push(raw);
        continue;
      }
      // Shared line. First-occurring axis in AXIS_ORDER wins.
      const owner = AXIS_ORDER.find((a) => shareSet.has(a))!;
      if (owner === axis) {
        kept.push(raw);
      } else {
        drops[axis].count += 1;
        droppedByAxis[axis].add(owner);
        for (const other of shareSet) {
          if (other !== axis && other !== owner) {
            droppedByAxis[axis].add(other);
          }
        }
      }
    }
    bodies[axis] = kept.join('\n');
  }

  for (const axis of AXIS_ORDER) {
    drops[axis].sharedWith = AXIS_ORDER.filter((a) => droppedByAxis[axis].has(a));
  }

  return { bodies, drops };
}

function dedupAnnotation(
  axis: Axis,
  drop: { count: number; sharedWith: Axis[] },
): string | null {
  if (drop.count === 0) return null;
  const shared = drop.sharedWith.join(', ');
  return `<!-- DEDUP: dropped ${drop.count} line(s) from ${axis} (also present in ${shared}) -->`;
}

export function compose(cell: ResolvedCell): ComposedAgent {
  const source_hashes: SourceHashes = {
    phase: sha256(cell.phase_fragment),
    personality: sha256(cell.personality_fragment),
    domain: sha256(cell.domain_fragment),
  };

  const { bodies, drops } = dedupFragments(cell);

  const fm = frontmatter(cell);
  const provenance =
    '<!-- COMPOSED by `guild compile` from axes.toml + source fragments. Do not edit by hand; regenerate with `/guild-compile`. -->';

  const sections: string[] = [fm, '', provenance];

  // Emit per-axis sections in the bundle order: personality, phase,
  // domain (the order the LLM will see them in). This preserves the
  // v0 ordering; dedup ownership is independent of emission order
  // (ownership is phase > personality > domain by AXIS_ORDER).
  const emitOrder: Axis[] = ['personality', 'phase', 'domain'];
  for (const axis of emitOrder) {
    if (axis === 'domain' && (!cell.domain || cell.domain_fragment.length === 0)) {
      // Singletons (no domain): skip the domain section entirely.
      continue;
    }
    sections.push('');
    const annotation = dedupAnnotation(axis, drops[axis]);
    if (annotation !== null) {
      sections.push(annotation);
    }
    sections.push(`<!-- @section: ${axis} -->`);
    sections.push(bodies[axis].trim());
  }
  // Trailing newline so emit's file write ends cleanly.
  const composed_body = `${sections.join('\n')}\n`;

  return {
    ...cell,
    composed_body,
    source_hashes,
  };
}
