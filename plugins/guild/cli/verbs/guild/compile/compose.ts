import { createHash } from 'node:crypto';

import type {
  ComposedAgent,
  ResolvedCell,
  SourceHashes,
} from './types.ts';

// compose v0: ResolvedCell → ComposedAgent.
//
// Per PLAN.md § Phase 1.2 exit criterion 6:
//   "compose v0: concatenate the three fragments with section
//   headers; emit dedup-marker comments where overlap is detected
//   (real dedup lands in M2)."
//
// v0 is a deterministic text-concat fallback. Real LLM-driven fusion
// lands in Phase 2.1 via the /guild-compile skill, gated on the
// committed cache. Until then, every cell's composed body is:
//
//   1. YAML frontmatter (name, role, description, tools, model, maxTurns).
//   2. A provenance comment (do-not-edit; regenerate via guild compile).
//   3. The personality fragment, under a section marker.
//   4. The phase fragment, under a section marker.
//   5. The domain fragment (if any), under a section marker.
//   6. Dedup-candidate comments wherever a ## heading appears in
//      more than one of the fragments — surfacing overlap that
//      Phase 2.1's real dedup will collapse.
//
// SHA-256 source hashes are computed from the raw fragment bodies
// (before composition) so the cache can fingerprint each input. The
// output hash (committed separately as the cache entry's
// output_hash) is computed by emit.

const PHASE_ROLE: Record<string, string> = {
  reviewer: 'evaluator',
  planner: 'whiteboard',
};

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

function extractHeadings(body: string): string[] {
  return body
    .split('\n')
    .filter((line: string) => /^## /.test(line))
    .map((line: string) => line.trimEnd());
}

function dedupMarkers(cell: ResolvedCell): string[] {
  // For every `## ` heading that appears in two or more of the three
  // fragments, surface a dedup-candidate comment naming where the
  // overlap was detected. v0 detection: heading-level only; real
  // body-level dedup arrives in Phase 2.1.
  const buckets: Array<{ source: string; headings: Set<string> }> = [
    { source: 'phase', headings: new Set(extractHeadings(cell.phase_fragment)) },
    { source: 'personality', headings: new Set(extractHeadings(cell.personality_fragment)) },
    { source: 'domain', headings: new Set(extractHeadings(cell.domain_fragment)) },
  ];
  const allHeadings = new Set<string>();
  for (const b of buckets) {
    for (const h of b.headings) allHeadings.add(h);
  }
  const markers: string[] = [];
  for (const h of allHeadings) {
    const sources = buckets
      .filter((b) => b.headings.has(h))
      .map((b) => b.source);
    if (sources.length >= 2) {
      markers.push(
        `<!-- DEDUP candidate: heading "${h}" appears in ${sources.join(' + ')} fragments. Real dedup lands in Phase 2.1. -->`,
      );
    }
  }
  return markers;
}

export function compose(cell: ResolvedCell): ComposedAgent {
  const source_hashes: SourceHashes = {
    phase: sha256(cell.phase_fragment),
    personality: sha256(cell.personality_fragment),
    domain: sha256(cell.domain_fragment),
  };

  const fm = frontmatter(cell);
  const provenance =
    '<!-- COMPOSED by `guild compile` from axes.toml + source fragments. Do not edit by hand; regenerate with `/guild-compile`. -->';
  const dedups = dedupMarkers(cell);

  const sections: string[] = [
    fm,
    '',
    provenance,
  ];
  if (dedups.length > 0) {
    sections.push('');
    sections.push(...dedups);
  }
  sections.push('');
  sections.push('<!-- @section: personality -->');
  sections.push(cell.personality_fragment.trim());
  sections.push('');
  sections.push('<!-- @section: phase -->');
  sections.push(cell.phase_fragment.trim());
  if (cell.domain && cell.domain_fragment.length > 0) {
    sections.push('');
    sections.push('<!-- @section: domain -->');
    sections.push(cell.domain_fragment.trim());
  }
  // Trailing newline so emit's file write ends cleanly.
  const composed_body = `${sections.join('\n')}\n`;

  return {
    ...cell,
    composed_body,
    source_hashes,
  };
}
