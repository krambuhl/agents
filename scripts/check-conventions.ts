#!/usr/bin/env node
/**
 * check-conventions — substrate convention-drift detector.
 *
 * Reads agent definition files and runs registered Convention checks
 * against them. Each Convention is an independent assertion that
 * something the substrate considers load-bearing about an agent's
 * shape is still true. Findings are advisory at MVP: the script
 * prints them to stdout and exits 0 regardless. Operators see the
 * drift and decide; the gate may escalate to blocking once the
 * false-positive rate stabilizes.
 *
 * Companion to scripts/sync-shared.ts — that script enforces
 * file-mirror invariants between commons and consumer plugins
 * (Category 4 generated-from-upstream); this script enforces
 * BEHAVIORAL invariants within agent definitions (Category none —
 * it's a check, not a generator).
 *
 * Extension pattern (the load-bearing affordance for future
 * conventions):
 *
 *   1. Define a new Convention object near the bottom of this file:
 *
 *        const myConvention: Convention = {
 *          name: 'my-convention-name',
 *          appliesTo: (file) => /pattern/.test(file),
 *          check: (file, content) => [...findings],
 *        };
 *
 *   2. Add it to the `CONVENTIONS` array at the bottom.
 *
 *   3. Add a test in scripts/check-conventions.test.ts covering
 *      a positive case (clean input → zero findings) and a negative
 *      case (seeded drift → expected finding).
 *
 *   That's the whole extension surface. No registration file, no
 *   plugin manifest entry, no separate test runner. One file, one
 *   array. The runner walks files × conventions and emits findings;
 *   conventions are independent of one another.
 *
 * Today's registered conventions:
 *
 *   - rubric-body-coherence — for plugins/* /agents/{retained,
 *     generated}/evaluator-*.md, asserts every check-verb noun
 *     phrase in the YAML frontmatter `description` appears
 *     somewhere in the body (case-insensitive substring). Heuristic;
 *     advisory; tier-one drift signal per the testing-strategy
 *     whiteboard contribution that motivated this project.
 *
 * Invocation:
 *
 *   node scripts/check-conventions.ts
 *
 * Output is a per-finding human-readable report on stdout. Exit
 * code is always 0 at MVP (advisory).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export type Severity = 'advisory' | 'blocking';

export type Finding = {
  file: string;
  convention: string;
  severity: Severity;
  message: string;
};

export type Convention = {
  name: string;
  appliesTo: (file: string) => boolean;
  check: (file: string, content: string) => Finding[];
};

/**
 * Walk files × conventions, collect findings, return as a flat
 * array preserving input file order. Pure — no I/O, no printing.
 */
export function runConventions(
  files: ReadonlyArray<{ path: string; content: string }>,
  conventions: ReadonlyArray<Convention>,
): Finding[] {
  const findings: Finding[] = [];
  for (const { path, content } of files) {
    for (const convention of conventions) {
      if (!convention.appliesTo(path)) continue;
      findings.push(...convention.check(path, content));
    }
  }
  return findings;
}

/**
 * Parse YAML frontmatter from a markdown file. Returns the
 * frontmatter as a string (so callers can extract specific keys)
 * plus the body. Frontmatter is the block between two `---` lines
 * at the file start. If no frontmatter, returns empty frontmatter
 * and the whole content as body.
 *
 * Deliberately does NOT parse YAML structurally — the description
 * field in agent frontmatter is multi-line YAML scalar (block
 * scalar `>-` or literal) and we want the rendered text. A
 * lightweight regex extraction is more honest than pulling in a
 * YAML parser for one field.
 */
export function splitFrontmatter(content: string): {
  frontmatter: string;
  body: string;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: '', body: content };
  return { frontmatter: match[1], body: match[2] };
}

/**
 * Extract the `description` field value from a YAML frontmatter
 * string. Handles the common shapes used in this repo:
 *   description: single-line value
 *   description: >-
 *     multi-line folded scalar
 *     more lines
 *   description: |-
 *     multi-line literal scalar
 *     more lines
 * Returns the joined description text with newlines collapsed to
 * spaces (folded-scalar semantics).
 */
export function extractDescription(frontmatter: string): string {
  const lines = frontmatter.split(/\r?\n/);
  const startIdx = lines.findIndex((l) => /^description\s*:/.test(l));
  if (startIdx === -1) return '';
  const startLine = lines[startIdx];
  const inline = startLine.match(/^description\s*:\s*(?!\s*[>|])(.+)$/);
  if (inline) return inline[1].trim();
  // Block scalar (>- or |-): read indented continuation lines.
  const continuation: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break; // next top-level key
    continuation.push(line.trim());
  }
  return continuation.filter((l) => l.length > 0).join(' ');
}

/**
 * Extract noun-phrase targets that follow check-verbs in a
 * description. The check-verbs are the contract-fit-shaped vocabulary
 * we want every evaluator's description to use: verifies, checks,
 * asserts, flags. After each verb, take the noun phrase up to the
 * next sentence-ending punctuation or the end of the string, then
 * split on commas + " and " to get individual targets.
 *
 * A phrase beginning with "whether" is skipped: it's an abstract
 * predicate clause ("checks whether X meets its contract"), not a
 * concrete noun-target, so substring-matching it against the body
 * over-flags. Sibling sentences with concrete targets still extract.
 *
 * Returns deduplicated, lowercased targets. Empty list if no
 * check-verb matches.
 */
export function extractCheckTargets(description: string): string[] {
  const verbs = ['verifies', 'checks', 'asserts', 'flags'];
  // Capture up to sentence-ending punctuation or end-of-string.
  // The captured group then gets split on commas + standalone "and"
  // to fan out list-shaped targets ("X, Y, and Z").
  const pattern = new RegExp(
    `\\b(?:${verbs.join('|')})\\s+([^.;!?\\n]+?)(?=[.;!?\\n]|$)`,
    'gi',
  );
  const targets = new Set<string>();
  for (const match of description.matchAll(pattern)) {
    const phrase = match[1].trim();
    // Predicate clauses ("whether X …") are not concrete check-targets.
    if (/^whether\b/i.test(phrase)) continue;
    const parts = phrase.split(/,\s*(?:and\s+)?|\s+and\s+/);
    for (const part of parts) {
      const cleaned = part.trim().toLowerCase();
      if (cleaned.length >= 3) targets.add(cleaned);
    }
  }
  return Array.from(targets);
}

/**
 * Convention: rubric-body coherence.
 *
 * For each evaluator-*.md in plugins/* /agents/{retained,generated}/,
 * extract check-verb noun-phrase targets from the YAML frontmatter
 * `description`, then verify each target appears (case-insensitive
 * substring) somewhere in the body. Each missing target is one
 * advisory finding.
 *
 * Heuristic by design — the testing-strategy whiteboard's tier-one
 * check is "rubric vs body coherence," and the cheapest reliable
 * signal is "is the language in the rubric reachable from the
 * body?" Exact match would over-flag; semantic match would
 * over-pull (require an LLM); substring match is the honest middle.
 */
const rubricBodyCoherence: Convention = {
  name: 'rubric-body-coherence',
  appliesTo: (file) =>
    /plugins\/[^/]+\/agents\/evaluator-[^/]+\.md$/.test(
      file,
    ),
  check: (file, content) => {
    const { frontmatter, body } = splitFrontmatter(content);
    if (!frontmatter) return [];
    const description = extractDescription(frontmatter);
    if (!description) return [];
    const targets = extractCheckTargets(description);
    const bodyLower = body.toLowerCase();
    const findings: Finding[] = [];
    for (const target of targets) {
      if (!bodyLower.includes(target)) {
        findings.push({
          file,
          convention: 'rubric-body-coherence',
          severity: 'advisory',
          message: `description mentions "${target}" but body does not reference it`,
        });
      }
    }
    return findings;
  },
};

/**
 * Convention: bullet-pair coherence (whiteboard-*.md).
 *
 * A whiteboard engineer that states what it leans toward should also
 * bound itself — say what it does NOT do — so its scope stays coherent
 * rather than unbounded. This flags a whiteboard agent whose lean-toward
 * content carries no boundary signal anywhere in the file.
 *
 * Lenient by design (whole-file boundedness): the boundary may be inline
 * in an "X over Y" stance bullet, a dedicated "Anti-patterns to avoid"
 * section, or a "Not a …" / "don't" carve-out — any one suffices. Only a
 * file that leans without ANY of these flags. This keeps the live
 * (codegen'd, structurally varied) corpus clean and guards against future
 * genuinely-unbounded agents. Advisory at MVP, matching
 * rubric-body-coherence.
 */
const LEAN_SECTION = /^## Stance\b|^### Good patterns to bias toward\b/m;
const BOUNDARY_SIGNALS: ReadonlyArray<RegExp> = [
  /\b[A-Za-z]+ over [A-Za-z]+\b/, // inline "X over Y" stance
  /to avoid/i, // "Anti-patterns to avoid" boundary section
  /not a |\bdon'?t\b/i, // "Not a …" / "don't" carve-out
];

const bulletPairCoherence: Convention = {
  name: 'bullet-pair-coherence',
  appliesTo: (file) =>
    /plugins\/[^/]+\/agents\/whiteboard-[^/]+\.md$/.test(file),
  check: (file, content) => {
    if (!LEAN_SECTION.test(content)) return [];
    if (BOUNDARY_SIGNALS.some((re) => re.test(content))) return [];
    return [
      {
        file,
        convention: 'bullet-pair-coherence',
        severity: 'advisory',
        message:
          'states what it leans toward but carries no boundary signal — add an "X over Y" stance bullet, an "Anti-patterns to avoid" section, or a "Not a …" carve-out',
      },
    ];
  },
};

/**
 * Registered conventions. Add new ones here.
 */
export const CONVENTIONS: ReadonlyArray<Convention> = [
  rubricBodyCoherence,
  bulletPairCoherence,
];

/**
 * Derive the engineer-domain roster from an agent-file listing: the
 * `<domain>` of each `plugins/.../agents/{whiteboard,evaluator}-<domain>.md`.
 * Deriving from the real listing (rather than a hand-maintained list)
 * means the roster cannot drift from the actual engineer set. Pure —
 * the caller (main) supplies the already-collected paths.
 */
export function deriveAgentRoster(
  paths: ReadonlyArray<string>,
): Set<string> {
  const roster = new Set<string>();
  const re = /plugins\/[^/]+\/agents\/(?:whiteboard|evaluator)-(.+)\.md$/;
  for (const path of paths) {
    const match = path.match(re);
    if (match) roster.add(match[1]);
  }
  return roster;
}

/**
 * Convention factory: sibling-reference resolution (whiteboard-*.md).
 *
 * Whiteboard agents cross-link siblings in their "Cross-domain notes"
 * via `**<name> overlap.**` bullets (e.g. "**performance overlap.**",
 * "**contract-fit overlap.**"). This flags a reference whose <name>
 * resolves to no roster agent — a dangling link, usually from a renamed
 * or dropped engineer.
 *
 * The roster is injected (derived from the agent-file listing in main,
 * never hardcoded) so `check` stays pure and unit-testable with a known
 * roster. Lenient resolution: a reference resolves if ANY whitespace-
 * token of <name> is a roster domain — so "nextjs reviewer overlap"
 * resolves via "nextjs", while hyphenated domains ("css-architecture")
 * stay intact. Advisory at MVP, matching the sibling conventions.
 */
const OVERLAP_REF = /\*\*([^*]+?)\s+overlap\.?\*\*/g;

export function makeSiblingReferenceConvention(
  roster: ReadonlySet<string>,
): Convention {
  return {
    name: 'sibling-reference-resolution',
    appliesTo: (file) =>
      /plugins\/[^/]+\/agents\/whiteboard-[^/]+\.md$/.test(file),
    check: (file, content) => {
      const findings: Finding[] = [];
      for (const match of content.matchAll(OVERLAP_REF)) {
        const name = match[1].trim();
        const tokens = name.split(/\s+/);
        if (tokens.some((token) => roster.has(token))) continue;
        findings.push({
          file,
          convention: 'sibling-reference-resolution',
          severity: 'advisory',
          message: `sibling reference "${name}" resolves to no roster agent (expected a whiteboard-<name> or evaluator-<name>)`,
        });
      }
      return findings;
    },
  };
}

/**
 * Glob-like recursive walk: collect all *.md files under a root.
 * Skips node_modules and dotfile dirs. Returns absolute-ish paths
 * relative to the cwd passed in.
 */
function collectMarkdownFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name.startsWith('.') || name === 'node_modules') continue;
      const full = join(dir, name);
      let s: ReturnType<typeof statSync>;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) stack.push(full);
      else if (s.isFile() && full.endsWith('.md')) out.push(full);
    }
  }
  return out;
}

/**
 * Print a per-file, per-convention report of findings to stdout.
 * Format is human-readable; future readers (operators or scripts)
 * can grep it. No JSON output mode at MVP — keep it scannable.
 */
function printReport(findings: ReadonlyArray<Finding>, cwd: string): void {
  if (findings.length === 0) {
    console.log('check-conventions: no findings across all registered conventions.');
    return;
  }
  const byFile = new Map<string, Finding[]>();
  for (const f of findings) {
    const list = byFile.get(f.file) ?? [];
    list.push(f);
    byFile.set(f.file, list);
  }
  console.log(
    `check-conventions: ${findings.length} finding(s) across ${byFile.size} file(s) (advisory).`,
  );
  console.log('');
  const filesSorted = Array.from(byFile.keys()).sort();
  for (const file of filesSorted) {
    const rel = relative(cwd, file);
    console.log(`  ${rel}`);
    for (const f of byFile.get(file)!) {
      console.log(`    [${f.severity}] ${f.convention}: ${f.message}`);
    }
  }
}

/**
 * CLI entry. Walks the repo's plugin agents, runs registered
 * conventions, prints the report, exits 0 (advisory at MVP).
 */
function main(): void {
  const cwd = process.cwd();
  const pluginsRoot = join(cwd, 'plugins');
  const allMarkdown = collectMarkdownFiles(pluginsRoot);
  const files = allMarkdown.map((path) => ({
    path,
    content: readFileSync(path, 'utf8'),
  }));
  // Roster-dependent conventions are built here (the I/O layer): the
  // roster is derived from the collected agent-file paths, never hardcoded.
  const roster = deriveAgentRoster(allMarkdown);
  const conventions = [...CONVENTIONS, makeSiblingReferenceConvention(roster)];
  const findings = runConventions(files, conventions);
  printReport(findings, cwd);
  process.exit(0);
}

// Run when invoked as a script; skip when imported by tests.
const invokedAsScript = process.argv[1]?.endsWith('check-conventions.ts');
if (invokedAsScript) main();
