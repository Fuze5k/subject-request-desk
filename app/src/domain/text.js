// Text utilities: ADF -> plain text, tokenisation, light stemming (shared with the author's Precedent and Contract Radar apps, MIT).
// Pure functions, no Forge imports, so they run under `node --test`.

const STOPWORDS = new Set(
  ('a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it its ' +
    'me my no not of on or our she should so than that the their them then there these they this to too us was we were ' +
    'what when where which who why will with would you your about after all also any because before being between both ' +
    'each just more most only other out over same some such up use used using via very').split(' ')
);

/** Convert an Atlassian Document Format node (or a plain string) to plain text. */
export function adfToText(node) {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  const out = [];
  walk(node, out);
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const BLOCKS = new Set([
  'paragraph', 'heading', 'blockquote', 'listItem', 'codeBlock', 'panel', 'tableRow', 'decisionItem', 'taskItem', 'rule',
]);

function walk(node, out) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const n of node) walk(n, out);
    return;
  }
  switch (node.type) {
    case 'text':
      out.push(node.text || '');
      return;
    case 'hardBreak':
      out.push('\n');
      return;
    case 'mention':
      out.push(node.attrs?.text || '@user');
      return;
    case 'emoji':
      out.push(node.attrs?.text || node.attrs?.shortName || '');
      return;
    case 'inlineCard':
    case 'blockCard':
      out.push(node.attrs?.url || '');
      break;
    case 'status':
      out.push(node.attrs?.text || '');
      return;
    case 'date':
      if (node.attrs?.timestamp) out.push(new Date(Number(node.attrs.timestamp)).toISOString().slice(0, 10));
      return;
    default:
  }
  if (node.type === 'tableCell' || node.type === 'tableHeader') {
    walk(node.content, out);
    out.push(' | ');
    return;
  }
  walk(node.content, out);
  if (BLOCKS.has(node.type)) out.push('\n');
}

/** Very light suffix stripping; enough to match plural/tense variants without a dictionary. */
export function stem(word) {
  let w = word;
  if (w.length > 5 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 6 && w.endsWith('ation')) w = w.slice(0, -5);
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 4 && w.endsWith('es') && /(ss|sh|ch|x|z)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) w = w.slice(0, -1);
  if (w.length > 4 && w.endsWith('e')) w = w.slice(0, -1);
  // collapse doubled final consonant left by -ing/-ed stripping (e.g. "caching" -> "cach", "dropped" -> "drop")
  if (w.length > 3 && /([bdfgklmnprt])\1$/.test(w)) w = w.slice(0, -1);
  return w;
}

/**
 * Tokenise text for search. Keeps work item keys ("ENG-12") as single tokens, splits camelCase,
 * drops stop words, stems the rest. Works for any script that Unicode calls letters/digits.
 */
export function tokenize(text) {
  if (!text) return [];
  const tokens = [];
  const raw = String(text);
  const keyRe = /\b[A-Z][A-Z0-9_]{1,9}-\d+\b/g;
  for (const m of raw.matchAll(keyRe)) tokens.push(m[0].toLowerCase());
  const rest = raw
    .replace(keyRe, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase();
  for (const m of rest.matchAll(/[\p{L}\p{N}]+/gu)) {
    const w = m[0];
    if (w.length < 2 || STOPWORDS.has(w)) continue;
    tokens.push(stem(w));
  }
  return tokens;
}

/** Trim, collapse inner whitespace and cut to a maximum length. */
export function clean(value, max) {
  const s = String(value ?? '').replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  return max && s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

export function excerpt(text, max = 220) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s;
}

