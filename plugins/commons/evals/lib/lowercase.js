// promptfoo javascript assertion: the output follows the lowercase rule from
// the voice skills. a line may start with a capital only when the capital
// carries meaning: an identifier in backticks, an acronym, Snerf's name, or a
// git trailer that tooling parses.
//
// markdown leaders (#, -, *, >, 1.) and checkbox markers are stripped before
// the check so a lowercase heading or bullet reads as lowercase.

const ALLOWED_STARTS = [
  /^Snerf\b/,
  /^Co-Authored-By:/,
  /^Claude-Session:/,
  /^[A-Z][A-Z0-9]{1,}\b/, // acronym: PR, CI, API, SHA
  /^[A-Z][a-z]+[A-Z]/, // PascalCase identifier: DOMException
  /^[A-Z][A-Za-z0-9_]*[.(<]/, // identifier used as code: Math.round, Stack(, Card<
  /^`/, // inline code
];

function stripLeaders(line) {
  return line
    .replace(/^[\s>]*/, '')
    .replace(/^(#{1,6}|[-*+]|\d+[.)])\s+/, '')
    .replace(/^\[[ xX]\]\s+/, '')
    .replace(/^\*\*/, '');
}

module.exports = (output) => {
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  let inFence = false;
  const offenders = [];
  for (const raw of text.split('\n')) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const line = stripLeaders(raw);
    if (!/^[A-Z]/.test(line)) continue;
    if (ALLOWED_STARTS.some((re) => re.test(line))) continue;
    offenders.push(raw.trim());
  }
  const pass = offenders.length === 0;
  return {
    pass,
    score: pass ? 1 : Math.max(0, 1 - offenders.length * 0.25),
    reason: pass
      ? 'every line starts lowercase or with an allowed capital'
      : `lines starting with a capital: ${offenders.slice(0, 3).map((l) => JSON.stringify(l)).join(', ')}`,
  };
};
