// promptfoo javascript assertion: basic readability for text that ships under
// the engineer's name. the rules are the plain ones: short sentences, plain
// words, and a length cap for the kind of text. code spans, identifiers, urls,
// and fenced blocks are stripped before counting so a long identifier is not
// a long word and a diff is not a paragraph.
//
// the kind comes from `context.vars.kind`. limits below are a starting point;
// tune them in this file, not per case, so every suite measures the same way.

const LIMITS = {
  commit: { words: 90, chars: null, lines: null, comment: false },
  'pr-title': { words: 14, chars: 70, lines: 1, comment: false },
  'pr-description': { words: 260, chars: null, lines: null, comment: false },
  'code-comment': { words: 40, chars: null, lines: null, comment: true },
  reply: { words: 70, chars: null, lines: null, comment: false },
  default: { words: 260, chars: null, lines: null, comment: false },
};

const SENTENCE_MAX_AVG = 20;
const SENTENCE_MAX_ANY = 35;
const LONG_WORD_MAX_RATIO = 0.08;
const PARAGRAPH_MAX_WORDS = 70;

function stripCode(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]+`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b[a-z]+(?:[A-Z][a-z0-9]*)+\b/g, ' ') // camelCase
    .replace(/\b\w+(?:[._/-]\w+)+\b/g, ' ') // dotted, snake, kebab, paths
    .replace(/\b[a-f0-9]{7,40}\b/g, ' ') // shas
    .replace(/^\s*(#{1,6}|[-*+]|\d+[.)]|>)\s*/gm, '') // markdown leaders
    .replace(/\[[ xX]\]/g, ' ');
}

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length <= 3) return 1;
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g);
  return groups ? groups.length : 1;
}

function analyze(raw, kind) {
  const limits = LIMITS[kind] || LIMITS.default;
  const text = stripCode(raw);
  const words = text.match(/[A-Za-z][A-Za-z'’]*/g) || [];
  const sentences = text
    .split(/(?<=[.!?])\s+|\n{2,}/)
    .map((s) => (s.match(/[A-Za-z][A-Za-z'’]*/g) || []).length)
    .filter((n) => n > 0);
  const paragraphs = raw
    .split(/\n\s*\n/)
    .map((p) => (stripCode(p).match(/[A-Za-z][A-Za-z'’]*/g) || []).length);
  const longWords = words.filter((w) => syllables(w) >= 4 || w.length >= 13);
  const avgSentence = sentences.length ? words.length / sentences.length : 0;
  const maxSentence = sentences.length ? Math.max(...sentences) : 0;
  const longRatio = words.length ? longWords.length / words.length : 0;
  const maxParagraph = paragraphs.length ? Math.max(...paragraphs) : 0;

  const fails = [];
  if (words.length > limits.words) fails.push(`${words.length} words, cap ${limits.words} for ${kind}`);
  if (limits.chars && raw.trim().split('\n')[0].length > limits.chars) fails.push(`first line ${raw.trim().split('\n')[0].length} chars, cap ${limits.chars}`);
  if (limits.lines && raw.trim().split('\n').length > limits.lines) fails.push(`${raw.trim().split('\n').length} lines, cap ${limits.lines}`);
  if (limits.comment) {
    const commentLines = raw.split('\n').filter((l) => /^\s*(\/\/|#|\*|\/\*)/.test(l)).length;
    if (commentLines > 2) fails.push(`${commentLines} comment lines, cap 2`);
  }
  if (avgSentence > SENTENCE_MAX_AVG) fails.push(`avg sentence ${avgSentence.toFixed(1)} words, cap ${SENTENCE_MAX_AVG}`);
  if (maxSentence > SENTENCE_MAX_ANY) fails.push(`longest sentence ${maxSentence} words, cap ${SENTENCE_MAX_ANY}`);
  if (words.length >= 20 && longRatio > LONG_WORD_MAX_RATIO) {
    fails.push(`${(longRatio * 100).toFixed(0)}% long words (${longWords.slice(0, 4).join(', ')}), cap ${LONG_WORD_MAX_RATIO * 100}%`);
  }
  if (maxParagraph > PARAGRAPH_MAX_WORDS) fails.push(`longest paragraph ${maxParagraph} words, cap ${PARAGRAPH_MAX_WORDS}`);

  const summary = `${words.length}w, ${sentences.length}s, avg ${avgSentence.toFixed(1)}, max ${maxSentence}, long ${(longRatio * 100).toFixed(0)}%`;
  return { pass: fails.length === 0, fails, summary };
}

module.exports = (output, context) => {
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  const kind = (context && context.vars && context.vars.kind) || 'default';
  const r = analyze(text, kind);
  return {
    pass: r.pass,
    score: r.pass ? 1 : Math.max(0, 1 - r.fails.length * 0.25),
    reason: r.pass ? `readable: ${r.summary}` : `${r.fails.join('; ')} (${r.summary})`,
  };
};

module.exports.analyze = analyze;
