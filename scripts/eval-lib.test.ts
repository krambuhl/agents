import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

/**
 * The shared promptfoo assertions under plugins/commons/evals/lib are plain
 * CommonJS so promptfoo can load them; nothing else exercises them except a
 * live eval run. This pins their behavior so a regex change shows up in
 * `npm test`, not in a mysterious eval failure weeks later.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(REPO_ROOT, 'plugins', 'commons', 'evals', 'lib');
const require = createRequire(import.meta.url);

type Assertion = (output: string) => { pass: boolean; score: number; reason: string };
const lowercase = require(join(LIB, 'lowercase.js')) as Assertion;
const postSection = require(join(LIB, 'post-section.js')) as Assertion;

describe('evals/lib/lowercase.js', () => {
  test('passes lowercase prose with allowed capitals', () => {
    const text = [
      'fix prorate to round half up',
      '',
      'Math.round in v8 rounds .5 to even, so a 30/31 split dropped a cent.',
      'MAX_ATTEMPTS stays a constant until someone needs a knob.',
      'PR #12 and the CI run both agree.',
      '`Table` keeps its name.',
      'Co-Authored-By: Someone <x@y.z>',
      '- **bold lead** then lowercase',
      '## motivation',
      '> quoted lowercase line',
      '```',
      'Capitals Inside Fences Are Fine',
      '```',
    ].join('\n');
    expect(lowercase(text).pass).toBe(true);
  });

  test('fails a line that starts with a capitalized word', () => {
    const r = lowercase('this is fine.\nNote: this is not.');
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('Note: this is not.');
  });

  test('strips markdown leaders before checking', () => {
    expect(lowercase('- Draft for the engineer').pass).toBe(false);
    expect(lowercase('1. First thing').pass).toBe(false);
    expect(lowercase('- [ ] verified locally').pass).toBe(true);
  });
});

describe('evals/lib/post-section.js', () => {
  test('checks only the text after the last post: label', () => {
    const out = 'verification: Capitalized — with a dash, mentions post: in prose\nclass: fix\naction: reply\npost:\nfixed in 9e1f2ab, header now defaults to undefined.';
    expect(postSection(out).pass).toBe(true);
  });

  test('fails on an em dash or a capital in the posted text', () => {
    expect(postSection('post:\ngood catch — fixed').pass).toBe(false);
    expect(postSection('post:\nFixed in abc.').pass).toBe(false);
    expect(postSection('post: Good — catch').reason).toMatch(/dash/);
  });

  test('fails when there is no post: section', () => {
    const r = postSection('verification: x\nclass: fix');
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/no post/);
  });

  test('accepts a bold label and the decide sentinel', () => {
    expect(postSection('action: draft for the engineer here\n**post:** nothing, handed to the engineer').pass).toBe(true);
  });
});
