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
type ReadabilityAssertion = ((output: string, context: { vars: Record<string, string> }) => ReturnType<Assertion>) & {
  analyze: (raw: string, kind: string) => { pass: boolean; fails: string[]; summary: string };
};
const readability = require(join(LIB, 'readability.js')) as ReadabilityAssertion;
const postReadability = require(join(LIB, 'post-readability.js')) as (output: string, context: object) => ReturnType<Assertion>;

const LONG_PR_BODY = [
  '## motivation',
  '',
  'two voice skills meant the model could not reliably pick between them, so the old gate fired on the wrong skill for the wrong text and felt random, and the model runs long by default, so a voice guide alone was not holding the line on verbosity, and one voice with a judge in the loop and a gate that checks the judge actually ran fixes all three of those problems at once.',
  '',
  '## solution',
  '',
  Array.from({ length: 12 }, (_, i) => `- bullet ${i} explains a consideration about the implementation with contextualization, operationalization, and generalizability concerns for the reviewer to internalize.`).join('\n'),
].join('\n');

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

describe('evals/lib/readability.js', () => {
  test('passes a short plain commit message', () => {
    const r = readability('fix the write-as-me descriptions in AGENTS.md\n\npr-comments is a procedure with no voice of its own. two paragraphs said otherwise.', { vars: { kind: 'commit' } });
    expect(r.pass, r.reason).toBe(true);
    expect(r.reason).toMatch(/readable/);
  });

  test('ignores code spans, identifiers, shas, and fenced blocks when measuring words', () => {
    const r = readability.analyze('the header defaults to undefined, test added. fixed in 9e1f2ab. see `createAvatarColumn` and packages/table/src/index.ts.\n\n```\nsome::extraordinarily_long_identifier_name_here = 1\n```', 'reply');
    expect(r.pass, r.fails.join('; ')).toBe(true);
  });

  test('fails a wall of text on sentence length, long words, and paragraph size', () => {
    const r = readability.analyze(LONG_PR_BODY, 'pr-description');
    expect(r.pass).toBe(false);
    expect(r.fails.join(' ')).toMatch(/longest sentence/);
    expect(r.fails.join(' ')).toMatch(/long words/);
    expect(r.fails.join(' ')).toMatch(/longest paragraph|words, cap/);
  });

  test('applies per-kind caps', () => {
    expect(readability.analyze('a title that is fine', 'pr-title').pass).toBe(true);
    expect(readability.analyze('a title that runs on and on past the seventy character line that titles get', 'pr-title').pass).toBe(false);
    expect(readability.analyze('one line\nsecond line', 'pr-title').fails.join(' ')).toMatch(/lines/);
    expect(readability.analyze('// one\n// two\n// three\nconst x = 1;', 'code-comment').fails.join(' ')).toMatch(/comment lines/);
    expect(readability.analyze(Array.from({ length: 80 }, () => 'word').join(' ') + '.', 'reply').fails.join(' ')).toMatch(/80 words, cap 70/);
  });

  test('counts syllables well enough to tell plain from heavy vocabulary', () => {
    const plain = readability.analyze(Array.from({ length: 6 }, () => 'the cat sat on the mat and slept.').join(' '), 'default');
    expect(plain.pass).toBe(true);
    const heavy = readability.analyze(Array.from({ length: 10 }, () => 'operationalization necessitates contextualization of generalizability considerations.').join(' '), 'default');
    expect(heavy.fails.join(' ')).toMatch(/long words/);
  });
});

describe('evals/lib/post-readability.js', () => {
  test('measures only the posted text as a reply', () => {
    const out = 'verification: ' + Array.from({ length: 200 }, () => 'context').join(' ') + '\nclass: fix\naction: reply\npost:\nfixed in 9e1f2ab. header defaults to undefined.';
    expect(postReadability(out, {}).pass).toBe(true);
    expect(postReadability('class: fix', {}).pass).toBe(false);
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
