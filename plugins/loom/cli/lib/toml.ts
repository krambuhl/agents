// Hand-rolled, zero-dependency TOML parser + serializer for loom's
// manifest subset.
//
// Phase 2 of substrate-consolidation collapses loom's machine state into
// one sectioned `manifest.toml`. This lib is the generic value-tree layer
// underneath that consolidation: U2 sits a typed manifest layer on top of
// `parseToml`/`stringifyToml`, so this file knows nothing about manifests,
// checkins, or events — only about TOML values.
//
// The core mechanism — comment-stripping that respects strings,
// symmetric escape/unescape, comma-splitting that respects strings, and
// the loud-rejection posture — is intentionally simple and stays in this
// one file. Generality is what makes this version load-bearing: arbitrary
// `[table]` / `[[array-of-table]]` headers AND nestable inline tables
// (the encoding for a Checkin's `contract` object or an Event's
// `detail`) are supported, so the value parser here is recursive rather
// than line-flat.
//
// Supported subset:
//   - top-level `key = value` scalars (basic strings, integers, booleans)
//   - single `[name]` table headers (the table value lives at root[name])
//   - repeated `[[name]]` array-of-table headers
//   - arrays of scalars AND arrays of inline tables (single line)
//   - nestable inline tables `{ k = v, k2 = v2 }`
//   - `#` comments (full-line and trailing) and blank lines
//   - symmetric escaping of \\ \" \n \t \r inside basic strings
//
// Anything outside that subset — multiline strings, floats, datetimes,
// dotted keys, dotted/quoted table headers, bare words — is REJECTED with
// a structured LoomError naming the offending line, never silently
// mis-parsed. Loud rejection is the safety contract of a hand-rolled
// parser: a value we cannot represent must fail, not round-trip wrong.
//
// Round-trip guarantee: parseToml(stringifyToml(t)) deep-equals t. The
// value tree does not record whether a table arrived as a `[name]` header
// or an inline `{...}` — both parse to the same TomlTable — so the
// serializer is free to choose header notation at the root and inline
// notation when nested, and the tree survives the trip either way.

import { LoomError } from './errors.ts';

export type TomlValue = string | number | boolean | TomlValue[] | TomlTable;

export type TomlTable = { [key: string]: TomlValue };

// ---------- Serializer ----------

function escapeString(value: string): string {
  // Backslash first (so we do not double-escape the escapes we add next),
  // then quote, then the control chars that would break a single-line
  // basic string.
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');
}

function isTomlTable(value: TomlValue): value is TomlTable {
  return (
    typeof value === 'object' && value !== null && !Array.isArray(value)
  );
}

function isArrayOfTables(value: TomlValue): boolean {
  return (
    Array.isArray(value) && value.length > 0 && value.every(isTomlTable)
  );
}

// Emit a scalar / array / inline-table value in inline notation. Used for
// every value that is NOT a root-level header section (array elements,
// inline-table fields, and every value once we are below the root).
function emitInline(value: TomlValue): string {
  if (typeof value === 'string') return `"${escapeString(value)}"`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new LoomError(
        'toml-invalid',
        `cannot serialize non-integer number: ${value}`,
      );
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(emitInline).join(', ')}]`;
  }
  // Inline table.
  const entries = Object.keys(value).map(
    (key) => `${key} = ${emitInline(value[key])}`,
  );
  return entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`;
}

// Emit the scalar / array-of-scalars / inline-table key lines for one
// table's own (non-header-promoted) keys, in insertion order.
function emitLeafLines(table: TomlTable, keys: string[]): string[] {
  return keys.map((key) => `${key} = ${emitInline(table[key])}`);
}

export function stringifyToml(table: TomlTable): string {
  const keys = Object.keys(table);

  // Root keys split into leaves (scalars, arrays-of-scalars, empty arrays,
  // inline tables we keep inline) and header sections (single sub-tables →
  // `[name]`; arrays-of-tables → repeated `[[name]]`). Leaves MUST be
  // emitted before any header, since a key line that follows a header
  // would bind to that section instead of the root.
  const leafKeys = keys.filter(
    (key) => !isTomlTable(table[key]) && !isArrayOfTables(table[key]),
  );
  const tableKeys = keys.filter((key) => isTomlTable(table[key]));
  const arrayTableKeys = keys.filter((key) => isArrayOfTables(table[key]));

  const lines: string[] = [];

  for (const line of emitLeafLines(table, leafKeys)) {
    lines.push(line);
  }

  for (const key of tableKeys) {
    if (lines.length > 0) lines.push('');
    lines.push(`[${key}]`);
    // Inside a header section every value is inline notation — we never
    // descend into a second level of headers (loom's nesting is expressed
    // with inline tables, not dotted/sub headers).
    const sub = table[key] as TomlTable;
    for (const line of emitLeafLines(sub, Object.keys(sub))) {
      lines.push(line);
    }
  }

  for (const key of arrayTableKeys) {
    const elements = table[key] as TomlTable[];
    for (const element of elements) {
      if (lines.length > 0) lines.push('');
      lines.push(`[[${key}]]`);
      for (const line of emitLeafLines(element, Object.keys(element))) {
        lines.push(line);
      }
    }
  }

  return lines.join('\n') + '\n';
}

// ---------- Parser ----------

// Strip a trailing `#` comment from a line, respecting quoted strings (a
// `#` inside a basic string is not a comment). A `#` is comment-start only
// when we are not inside a string — which also protects `#` inside an
// inline-table or array on the same line, since the only shelter for a `#`
// is a surrounding quote.
function stripTrailingComment(line: string): string {
  let inString = false;
  let escaped = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (ch === '#' && !inString) {
      return line.slice(0, i);
    }
  }
  return line;
}

function unescapeString(raw: string, lineNo: number): string {
  // `raw` is the content BETWEEN the surrounding quotes.
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out += ch;
      continue;
    }
    const next = raw[i + 1];
    i++;
    switch (next) {
      case '\\':
        out += '\\';
        break;
      case '"':
        out += '"';
        break;
      case 'n':
        out += '\n';
        break;
      case 't':
        out += '\t';
        break;
      case 'r':
        out += '\r';
        break;
      default:
        throw new LoomError(
          'toml-invalid',
          `line ${lineNo}: unsupported string escape '\\${next ?? ''}'`,
        );
    }
  }
  return out;
}

function isBareKeyChar(ch: string): boolean {
  return /[A-Za-z0-9_-]/.test(ch);
}

// Parse exactly ONE value starting at index `i` (after skipping leading
// whitespace) and return the value plus the index just past it. Recursive:
// arrays and inline tables call back into this for their elements/fields.
function parseValueAt(
  s: string,
  i: number,
  lineNo: number,
): { value: TomlValue; next: number } {
  let pos = i;
  while (pos < s.length && (s[pos] === ' ' || s[pos] === '\t')) pos++;
  if (pos >= s.length) {
    throw new LoomError('toml-invalid', `line ${lineNo}: empty value`);
  }

  const ch = s[pos];

  if (ch === '"') {
    if (s.startsWith('"""', pos)) {
      throw new LoomError(
        'toml-invalid',
        `line ${lineNo}: multiline strings are not supported`,
      );
    }
    let escaped = false;
    let end = -1;
    for (let j = pos + 1; j < s.length; j++) {
      const c = s[j];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === '\\') {
        escaped = true;
        continue;
      }
      if (c === '"') {
        end = j;
        break;
      }
    }
    if (end === -1) {
      throw new LoomError('toml-invalid', `line ${lineNo}: unterminated string`);
    }
    return { value: unescapeString(s.slice(pos + 1, end), lineNo), next: end + 1 };
  }

  if (ch === '[') {
    return parseArrayAt(s, pos, lineNo);
  }

  if (ch === '{') {
    return parseInlineTableAt(s, pos, lineNo);
  }

  // Bare token: a run up to the next structural delimiter. Classify it as
  // boolean or integer; everything else (floats, datetimes, bare words) is
  // outside the subset.
  let end = pos;
  while (
    end < s.length &&
    s[end] !== ',' &&
    s[end] !== ']' &&
    s[end] !== '}' &&
    s[end] !== ' ' &&
    s[end] !== '\t'
  ) {
    end++;
  }
  const token = s.slice(pos, end);
  if (token === 'true') return { value: true, next: end };
  if (token === 'false') return { value: false, next: end };
  if (/^-?\d+$/.test(token)) return { value: Number.parseInt(token, 10), next: end };
  if (/^[-+]?[\d.]/.test(token)) {
    throw new LoomError(
      'toml-invalid',
      `line ${lineNo}: floats and datetimes are not supported (got '${token}')`,
    );
  }
  throw new LoomError('toml-invalid', `line ${lineNo}: unsupported value '${token}'`);
}

function parseArrayAt(
  s: string,
  i: number,
  lineNo: number,
): { value: TomlValue[]; next: number } {
  // `s[i]` is the opening `[`.
  const out: TomlValue[] = [];
  let pos = i + 1;
  while (true) {
    while (pos < s.length && (s[pos] === ' ' || s[pos] === '\t')) pos++;
    if (pos >= s.length) {
      throw new LoomError(
        'toml-invalid',
        `line ${lineNo}: unterminated array (single-line arrays only)`,
      );
    }
    if (s[pos] === ']') return { value: out, next: pos + 1 };

    const parsed = parseValueAt(s, pos, lineNo);
    out.push(parsed.value);
    pos = parsed.next;

    while (pos < s.length && (s[pos] === ' ' || s[pos] === '\t')) pos++;
    if (pos >= s.length) {
      throw new LoomError(
        'toml-invalid',
        `line ${lineNo}: unterminated array (single-line arrays only)`,
      );
    }
    if (s[pos] === ']') return { value: out, next: pos + 1 };
    if (s[pos] !== ',') {
      throw new LoomError(
        'toml-invalid',
        `line ${lineNo}: expected ',' or ']' in array (got '${s[pos]}')`,
      );
    }
    pos++; // consume the comma; a trailing comma before ']' is tolerated.
  }
}

function parseInlineTableAt(
  s: string,
  i: number,
  lineNo: number,
): { value: TomlTable; next: number } {
  // `s[i]` is the opening `{`.
  const out: TomlTable = {};
  let pos = i + 1;
  while (true) {
    while (pos < s.length && (s[pos] === ' ' || s[pos] === '\t')) pos++;
    if (pos >= s.length) {
      throw new LoomError('toml-invalid', `line ${lineNo}: unterminated inline table`);
    }
    if (s[pos] === '}') return { value: out, next: pos + 1 };

    // Bare key up to `=`.
    const keyStart = pos;
    while (pos < s.length && isBareKeyChar(s[pos])) pos++;
    const key = s.slice(keyStart, pos);
    if (key.length === 0) {
      throw new LoomError(
        'toml-invalid',
        `line ${lineNo}: expected a key in inline table (got '${s[pos]}')`,
      );
    }
    if (Object.prototype.hasOwnProperty.call(out, key)) {
      throw new LoomError(
        'toml-invalid',
        `line ${lineNo}: duplicate key '${key}' in inline table`,
      );
    }
    while (pos < s.length && (s[pos] === ' ' || s[pos] === '\t')) pos++;
    if (s[pos] !== '=') {
      throw new LoomError(
        'toml-invalid',
        `line ${lineNo}: expected '=' after inline-table key '${key}'`,
      );
    }
    pos++; // consume '='

    const parsed = parseValueAt(s, pos, lineNo);
    out[key] = parsed.value;
    pos = parsed.next;

    while (pos < s.length && (s[pos] === ' ' || s[pos] === '\t')) pos++;
    if (pos >= s.length) {
      throw new LoomError('toml-invalid', `line ${lineNo}: unterminated inline table`);
    }
    if (s[pos] === '}') return { value: out, next: pos + 1 };
    if (s[pos] !== ',') {
      throw new LoomError(
        'toml-invalid',
        `line ${lineNo}: expected ',' or '}' in inline table (got '${s[pos]}')`,
      );
    }
    pos++; // consume the comma; a trailing comma before '}' is tolerated.
  }
}

// Parse a `key = value` line. The value occupies the rest of the line; we
// reject trailing junk so a malformed value fails loudly rather than
// parsing a prefix and dropping the rest.
function parseKeyValue(
  line: string,
  lineNo: number,
): { key: string; value: TomlValue } {
  const eq = line.indexOf('=');
  if (eq === -1) {
    throw new LoomError('toml-invalid', `line ${lineNo}: expected 'key = value'`);
  }
  const key = line.slice(0, eq).trim();
  if (key.length === 0) {
    throw new LoomError('toml-invalid', `line ${lineNo}: empty key`);
  }
  if (key.includes('.')) {
    throw new LoomError('toml-invalid', `line ${lineNo}: dotted keys are not supported`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new LoomError('toml-invalid', `line ${lineNo}: unsupported key syntax '${key}'`);
  }
  const parsed = parseValueAt(line, eq + 1, lineNo);
  if (line.slice(parsed.next).trim().length > 0) {
    throw new LoomError(
      'toml-invalid',
      `line ${lineNo}: unexpected content after value`,
    );
  }
  return { key, value: parsed.value };
}

function parseHeaderName(
  inner: string,
  lineNo: number,
  kind: string,
): string {
  const name = inner.trim();
  if (name.length === 0) {
    throw new LoomError('toml-invalid', `line ${lineNo}: empty ${kind} header`);
  }
  if (name.includes('.')) {
    throw new LoomError(
      'toml-invalid',
      `line ${lineNo}: dotted ${kind} headers are not supported`,
    );
  }
  if (!/^[A-Za-z0-9_-]+$/.test(name)) {
    throw new LoomError(
      'toml-invalid',
      `line ${lineNo}: unsupported ${kind} header '${name}'`,
    );
  }
  return name;
}

export function parseToml(raw: string): TomlTable {
  const root: TomlTable = {};
  // `section` is the table that subsequent `key = value` lines bind to —
  // the root, or the most recent `[name]` / `[[name]]` table.
  let section: TomlTable = root;
  const rawLines = raw.split('\n');

  for (let idx = 0; idx < rawLines.length; idx++) {
    const lineNo = idx + 1;
    const line = stripTrailingComment(rawLines[idx]).trim();
    if (line.length === 0) continue;

    if (line.startsWith('[[')) {
      if (!line.endsWith(']]')) {
        throw new LoomError(
          'toml-invalid',
          `line ${lineNo}: malformed array-of-table header '${line}'`,
        );
      }
      const name = parseHeaderName(line.slice(2, -2), lineNo, 'array-of-table');
      const existing = root[name];
      if (existing === undefined) {
        const arr: TomlTable[] = [];
        root[name] = arr;
        const fresh: TomlTable = {};
        arr.push(fresh);
        section = fresh;
      } else if (Array.isArray(existing)) {
        const fresh: TomlTable = {};
        (existing as TomlTable[]).push(fresh);
        section = fresh;
      } else {
        throw new LoomError(
          'toml-invalid',
          `line ${lineNo}: '${name}' is already defined as a non-array value`,
        );
      }
      continue;
    }

    if (line.startsWith('[')) {
      if (!line.endsWith(']')) {
        throw new LoomError(
          'toml-invalid',
          `line ${lineNo}: malformed table header '${line}'`,
        );
      }
      const name = parseHeaderName(line.slice(1, -1), lineNo, 'table');
      if (Object.prototype.hasOwnProperty.call(root, name)) {
        throw new LoomError(
          'toml-invalid',
          `line ${lineNo}: duplicate table '${name}'`,
        );
      }
      const fresh: TomlTable = {};
      root[name] = fresh;
      section = fresh;
      continue;
    }

    const { key, value } = parseKeyValue(line, lineNo);
    if (Object.prototype.hasOwnProperty.call(section, key)) {
      throw new LoomError('toml-invalid', `line ${lineNo}: duplicate key '${key}'`);
    }
    section[key] = value;
  }

  return root;
}
