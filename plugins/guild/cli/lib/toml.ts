// Minimal TOML reader for guild's panel.manifest.toml + tools-map.toml.
//
// This is NOT a general TOML parser. It is a small, guild-local reader
// that handles exactly the constructs those two hand-authored source
// files use:
//   - top-level `key = value`
//   - `[table]` and dotted `[a.b]` table headers
//   - `[[array-of-tables]]` headers
//   - scalar values: double-quoted strings, integers, booleans
//   - single-line string arrays: ["a", "b"]
//   - `#` line and trailing comments (outside double-quoted strings)
//
// Deliberately unsupported (and unused by those two files): inline
// tables ({ k = v }), multi-line arrays, multi-line / literal strings,
// dotted keys outside table headers, escape sequences inside strings,
// and arrays of non-string scalars. Anything outside this grammar
// throws TomlParseError rather than guessing — a load-bearing codegen
// fold wants a loud failure over a silent misparse.
//
// Why guild gets its own reader rather than importing loom's full TOML
// parser: no plugin TS-imports another plugin's lib today, and these
// two files are simple and fully under our control. The Phase-4
// consistency test previously regex-extracted the same data; it now
// shares this reader, so guild has one TOML approach, not two.

export type TomlValue = string | number | boolean | TomlValue[] | TomlTable;

export interface TomlTable {
  [key: string]: TomlValue;
}

export class TomlParseError extends Error {}

export function isTomlTable(value: TomlValue | undefined): value is TomlTable {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Cut a line at the first `#` that sits outside a double-quoted string.
function stripComment(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inString = !inString;
    } else if (c === '#' && !inString) {
      return line.slice(0, i);
    }
  }
  return line;
}

function parseScalar(raw: string): TomlValue {
  const s = raw.trim();
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    return s.slice(1, -1);
  }
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+$/.test(s)) return Number(s);
  throw new TomlParseError(`unsupported scalar value: ${raw}`);
}

// Split an array body on top-level commas, respecting double-quoted
// strings. Elements are scalars; nested arrays/tables are unsupported.
function splitTopLevel(inner: string): string[] {
  const parts: string[] = [];
  let buf = '';
  let inString = false;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '"') {
      inString = !inString;
      buf += c;
    } else if (c === ',' && !inString) {
      parts.push(buf);
      buf = '';
    } else {
      buf += c;
    }
  }
  if (buf.trim() !== '') parts.push(buf);
  return parts.map((p) => p.trim()).filter((p) => p !== '');
}

function parseValue(raw: string): TomlValue {
  const s = raw.trim();
  if (s.startsWith('[')) {
    if (!s.endsWith(']')) {
      throw new TomlParseError(`unterminated or multi-line array: ${raw}`);
    }
    const inner = s.slice(1, -1).trim();
    if (inner === '') return [];
    return splitTopLevel(inner).map((item) => parseScalar(item));
  }
  return parseScalar(s);
}

export function parseToml(src: string): TomlTable {
  const root: TomlTable = {};
  let target: TomlTable = root;

  for (const rawLine of src.split('\n')) {
    const line = stripComment(rawLine).trim();
    if (line === '') continue;

    // [[array-of-tables]]
    if (line.startsWith('[[') && line.endsWith(']]')) {
      const name = line.slice(2, -2).trim();
      if (name.includes('.')) {
        throw new TomlParseError(`dotted array-of-tables unsupported: ${line}`);
      }
      const existing = root[name];
      let arr: TomlValue[];
      if (existing === undefined) {
        arr = [];
        root[name] = arr;
      } else if (Array.isArray(existing)) {
        arr = existing;
      } else {
        throw new TomlParseError(`key '${name}' redefined as array-of-tables`);
      }
      const entry: TomlTable = {};
      arr.push(entry);
      target = entry;
      continue;
    }

    // [table] or dotted [a.b]
    if (line.startsWith('[') && line.endsWith(']')) {
      const name = line.slice(1, -1).trim();
      let cur: TomlTable = root;
      for (const seg of name.split('.').map((p) => p.trim())) {
        const next = cur[seg];
        if (next === undefined) {
          const created: TomlTable = {};
          cur[seg] = created;
          cur = created;
        } else if (isTomlTable(next)) {
          cur = next;
        } else {
          throw new TomlParseError(
            `table path '${name}' conflicts with a non-table at '${seg}'`,
          );
        }
      }
      target = cur;
      continue;
    }

    // key = value
    const eq = line.indexOf('=');
    if (eq === -1) {
      throw new TomlParseError(`expected 'key = value', got: ${rawLine}`);
    }
    const key = line.slice(0, eq).trim();
    target[key] = parseValue(line.slice(eq + 1));
  }

  return root;
}
