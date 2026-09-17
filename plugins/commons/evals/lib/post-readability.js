// promptfoo javascript assertion: readability of the `post:` section only, for
// procedure-shaped outputs. the sections before it are agent chat and are not
// held to the shipped-text limits. the kind is always a thread reply.

const readability = require('./readability.js');

module.exports = (output, context) => {
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  const re = /(^|\n)\**post:\**\s*/gi;
  let match = null;
  for (let m = re.exec(text); m; m = re.exec(text)) match = m;
  if (!match) return { pass: false, score: 0, reason: 'no post: section found' };
  const post = text.slice(match.index + match[0].length);
  return readability(post, { ...(context || {}), vars: { ...((context && context.vars) || {}), kind: 'reply' } });
};
