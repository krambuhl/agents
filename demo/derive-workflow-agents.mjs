#!/usr/bin/env node
// THROWAWAY prototype of the "name-mapping verb" the namespace finding called for.
//
// `guild derive-panel` emits BARE logical evaluator names (evaluator-a11y, ...).
// A workflow's agentType registry uses a DIFFERENT, more granular namespace
// (guild:generated:evaluator-a11y, guild:retained:evaluator-contract-fit).
// This script maps the former to the latter by WALKING the on-disk agents tree,
// proving the mapping is derivable and ownable by guild rather than hardcoded
// into workflow scripts (which would couple them to guild-compile's layout).
//
// NOT production guild CLI code. If workflow adoption is greenlit, this logic
// belongs behind a real `guild` verb with tests.
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const AGENTS_ROOT = resolve('plugins/guild/agents');
const SUBDIRS = ['retained', 'generated', 'personalities'];

// name -> subdir, discovered from the tree (the single source of truth).
const index = new Map();
for (const sub of SUBDIRS) {
  let entries = [];
  try {
    entries = readdirSync(resolve(AGENTS_ROOT, sub));
  } catch {
    continue;
  }
  for (const f of entries) {
    if (f.endsWith('.md')) index.set(f.replace(/\.md$/, ''), sub);
  }
}

const names = process.argv
  .slice(2)
  .flatMap((a) => a.split(','))
  .map((s) => s.trim())
  .filter(Boolean);

const mapped = [];
const missing = [];
for (const name of names) {
  const sub = index.get(name);
  if (sub) mapped.push(`guild:${sub}:${name}`);
  else missing.push(name);
}

if (missing.length) {
  process.stderr.write(`derive-workflow-agents: no agent file found for: ${missing.join(', ')}\n`);
}
process.stdout.write(mapped.join(',') + '\n');
process.exit(missing.length ? 1 : 0);
