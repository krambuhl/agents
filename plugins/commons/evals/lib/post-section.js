// promptfoo javascript assertion for procedure-shaped outputs that end in a
// `post:` section. the sections before it are the agent reporting to the
// engineer; only the text under `post:` ships, so only that text has to
// satisfy the write-as-me register: no em or en dash, lowercase by default.

const lowercase = require('./lowercase.js');

module.exports = (output) => {
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  const match = /(^|\n)\**post:\**\s*/i.exec(text);
  if (!match) {
    return { pass: false, score: 0, reason: 'no post: section found' };
  }
  const post = text.slice(match.index + match[0].length);
  const dashes = (post.match(/[—–]/g) || []).length;
  const lower = lowercase(post);
  const pass = dashes === 0 && lower.pass;
  const reasons = [];
  if (dashes > 0) reasons.push(`${dashes} em/en dash(es) in posted text`);
  if (!lower.pass) reasons.push(lower.reason);
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass ? 'posted text is dash-free and lowercase' : reasons.join('; '),
  };
};
