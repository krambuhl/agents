// jelly project manifest — hand-rolled TOML reader + writer.
//
// jelly's manifest is WRITE-ONCE: `jelly plan` (U4) writes it at
// project birth and the steady state never touches it again (no
// current_branch, no latest_checkin, no per-phase status/branch — that
// mutable state lives in git + PRs, unlike loom's manifest). The shape
// is identity + references + a write-once [config] table + write-once
// [[phases]] declarations.
//
// We hand-roll a MINIMAL TOML reader/writer for exactly this shape
// rather than take a TOML dependency — the substrate holds a zero-
// runtime-dependency posture. The supported subset is:
//   - top-level `key = value` where value is a basic string, integer,
//     or boolean
//   - a single `[config]` table of the same scalar key-values
//   - repeated `[[phases]]` array-of-tables
//   - arrays-of-strings (`depends_on = ["1.1", "1.2"]`)
//   - `#` comments (full-line and trailing) and blank lines
//
// Anything outside that subset — multiline strings, dotted keys,
// nested/inline tables, floats, datetimes, non-string arrays — is
// REJECTED with a structured `manifest-invalid-toml` error naming the
// offending line, never silently mis-parsed. That explicit-rejection
// posture is the safety contract of a hand-rolled parser.

import { JellyError } from './errors.ts';

export interface JellyPhase {
  /** Sub-phase notation, e.g. "1.1". String (not number) because of the dot. */
  number: string;
  /** Milestone the phase belongs to, e.g. "M1". */
  milestone: string;
  name: string;
  /** Phase numbers this phase depends on, e.g. ["1.1"]. May be empty. */
  depends_on: string[];
}

export interface JellyConfig {
  base_branch: string;
  substrate: string;
}

export interface JellyManifest {
  /** Always 1 for this schema version. */
  schema_version: number;
  title: string;
  slug: string;
  /** ISO date (YYYY-MM-DD). */
  started: string;
  /** active | archived. Mutates ONLY at archival, never per-PR. */
  status: string;
  plan_file: string;
  research_file: string;
  /** Path to the workspace-level ADR log, relative to the project dir. */
  adr_log: string;
  config: JellyConfig;
  phases: JellyPhase[];
}

const SCHEMA_VERSION = 1;

// Top-level scalar keys, in canonical write order.
const IDENTITY_KEYS = [
  'schema_version',
  'title',
  'slug',
  'started',
  'status',
  'plan_file',
  'research_file',
  'adr_log',
] as const;

const CONFIG_KEYS = ['base_branch', 'substrate'] as const;
const PHASE_SCALAR_KEYS = ['number', 'milestone', 'name'] as const;

// ---------- Writer ----------

function escapeString(value: string): string {
  // TOML basic-string escapes for the characters that can appear in a
  // manifest value (title/name/slug/path). Backslash first, then quote,
  // then the control chars that would break a single-line basic string.
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
    .replace(/\r/g, '\\r');
}

function emitScalar(value: string | number | boolean): string {
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new JellyError(
        'manifest-invalid-toml',
        `cannot serialize non-integer number: ${value}`,
      );
    }
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return `"${escapeString(value)}"`;
}

function emitStringArray(values: string[]): string {
  return `[${values.map((v) => `"${escapeString(v)}"`).join(', ')}]`;
}

export function stringifyManifest(m: JellyManifest): string {
  const lines: string[] = [];

  // Identity + references (top-level scalars), canonical order.
  for (const key of IDENTITY_KEYS) {
    lines.push(`${key} = ${emitScalar(m[key])}`);
  }

  // [config] table.
  lines.push('');
  lines.push('[config]');
  for (const key of CONFIG_KEYS) {
    lines.push(`${key} = ${emitScalar(m.config[key])}`);
  }

  // [[phases]] array-of-tables.
  for (const phase of m.phases) {
    lines.push('');
    lines.push('[[phases]]');
    for (const key of PHASE_SCALAR_KEYS) {
      lines.push(`${key} = ${emitScalar(phase[key])}`);
    }
    lines.push(`depends_on = ${emitStringArray(phase.depends_on)}`);
  }

  return lines.join('\n') + '\n';
}

// ---------- Parser ----------

/**
 * Strip a trailing `#` comment from a line, respecting quoted strings
 * (a `#` inside a basic string is not a comment). Returns the line with
 * any trailing comment removed; does not trim.
 */
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
  // raw is the content BETWEEN the surrounding quotes.
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
      case '\\': out += '\\'; break;
      case '"': out += '"'; break;
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      default:
        throw new JellyError(
          'manifest-invalid-toml',
          `line ${lineNo}: unsupported string escape '\\${next ?? ''}'`,
        );
    }
  }
  return out;
}

type TomlValue = string | number | boolean | string[];

function parseValue(raw: string, lineNo: number): TomlValue {
  const text = raw.trim();
  if (text.length === 0) {
    throw new JellyError('manifest-invalid-toml', `line ${lineNo}: empty value`);
  }

  // Basic string.
  if (text.startsWith('"')) {
    // Reject multiline-string opener.
    if (text.startsWith('"""')) {
      throw new JellyError(
        'manifest-invalid-toml',
        `line ${lineNo}: multiline strings are not supported`,
      );
    }
    // Find the closing quote, honoring escapes.
    let escaped = false;
    let end = -1;
    for (let i = 1; i < text.length; i++) {
      const ch = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        end = i;
        break;
      }
    }
    if (end === -1) {
      throw new JellyError(
        'manifest-invalid-toml',
        `line ${lineNo}: unterminated string`,
      );
    }
    if (text.slice(end + 1).trim().length > 0) {
      throw new JellyError(
        'manifest-invalid-toml',
        `line ${lineNo}: unexpected content after string value`,
      );
    }
    return unescapeString(text.slice(1, end), lineNo);
  }

  // Boolean.
  if (text === 'true') return true;
  if (text === 'false') return false;

  // Integer.
  if (/^-?\d+$/.test(text)) {
    return Number.parseInt(text, 10);
  }

  // Array (of strings only).
  if (text.startsWith('[')) {
    if (!text.endsWith(']')) {
      throw new JellyError(
        'manifest-invalid-toml',
        `line ${lineNo}: unterminated array (single-line arrays only)`,
      );
    }
    const inner = text.slice(1, -1).trim();
    if (inner.length === 0) return [];
    return splitArrayElements(inner, lineNo).map((el) => {
      const t = el.trim();
      if (!t.startsWith('"') || !t.endsWith('"') || t.length < 2) {
        throw new JellyError(
          'manifest-invalid-toml',
          `line ${lineNo}: array elements must be basic strings (got '${t}')`,
        );
      }
      return unescapeString(t.slice(1, -1), lineNo);
    });
  }

  // Anything else (floats, datetimes, inline tables, bare words) is
  // outside the supported subset.
  throw new JellyError(
    'manifest-invalid-toml',
    `line ${lineNo}: unsupported value '${text}'`,
  );
}

/**
 * Split the inside of a `[...]` array on commas, respecting quoted
 * strings (a comma inside a string is not a separator). Tolerates a
 * trailing comma.
 */
function splitArrayElements(inner: string, lineNo: number): string[] {
  const elements: string[] = [];
  let current = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      current += ch;
      continue;
    }
    if (ch === ',' && !inString) {
      elements.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (inString) {
    throw new JellyError(
      'manifest-invalid-toml',
      `line ${lineNo}: unterminated string in array`,
    );
  }
  if (current.trim().length > 0) elements.push(current);
  return elements;
}

interface ParseAccumulator {
  top: Record<string, TomlValue>;
  config: Record<string, TomlValue> | null;
  phases: Record<string, TomlValue>[];
}

type Section = { kind: 'top' } | { kind: 'config' } | { kind: 'phase'; index: number };

function parseKeyValue(line: string, lineNo: number): { key: string; value: TomlValue } {
  const eq = line.indexOf('=');
  if (eq === -1) {
    throw new JellyError('manifest-invalid-toml', `line ${lineNo}: expected 'key = value'`);
  }
  const key = line.slice(0, eq).trim();
  if (key.length === 0) {
    throw new JellyError('manifest-invalid-toml', `line ${lineNo}: empty key`);
  }
  if (key.includes('.')) {
    throw new JellyError(
      'manifest-invalid-toml',
      `line ${lineNo}: dotted keys are not supported`,
    );
  }
  if (!/^[A-Za-z0-9_-]+$/.test(key)) {
    throw new JellyError(
      'manifest-invalid-toml',
      `line ${lineNo}: unsupported key syntax '${key}'`,
    );
  }
  return { key, value: parseValue(line.slice(eq + 1), lineNo) };
}

function rawParse(raw: string): ParseAccumulator {
  const acc: ParseAccumulator = { top: {}, config: null, phases: [] };
  let section: Section = { kind: 'top' };
  const rawLines = raw.split('\n');

  for (let idx = 0; idx < rawLines.length; idx++) {
    const lineNo = idx + 1;
    const stripped = stripTrailingComment(rawLines[idx]).trim();
    if (stripped.length === 0) continue;

    if (stripped === '[config]') {
      if (acc.config !== null) {
        throw new JellyError('manifest-invalid-toml', `line ${lineNo}: duplicate [config] table`);
      }
      acc.config = {};
      section = { kind: 'config' };
      continue;
    }
    if (stripped === '[[phases]]') {
      acc.phases.push({});
      section = { kind: 'phase', index: acc.phases.length - 1 };
      continue;
    }
    if (stripped.startsWith('[')) {
      throw new JellyError(
        'manifest-invalid-toml',
        `line ${lineNo}: unsupported table header '${stripped}' (only [config] and [[phases]])`,
      );
    }

    const { key, value } = parseKeyValue(stripped, lineNo);
    if (section.kind === 'top') {
      acc.top[key] = value;
    } else if (section.kind === 'config') {
      acc.config![key] = value;
    } else {
      acc.phases[section.index][key] = value;
    }
  }

  return acc;
}

// ---------- Validation ----------

function requireString(
  bag: Record<string, TomlValue>,
  key: string,
  where: string,
): string {
  const v = bag[key];
  if (v === undefined) {
    throw new JellyError('manifest-schema-invalid', `${where} is missing required key '${key}'`);
  }
  if (typeof v !== 'string') {
    throw new JellyError('manifest-schema-invalid', `${where} key '${key}' must be a string`);
  }
  return v;
}

function requireStringArray(
  bag: Record<string, TomlValue>,
  key: string,
  where: string,
): string[] {
  const v = bag[key];
  if (v === undefined) {
    throw new JellyError('manifest-schema-invalid', `${where} is missing required key '${key}'`);
  }
  if (!Array.isArray(v)) {
    throw new JellyError('manifest-schema-invalid', `${where} key '${key}' must be an array of strings`);
  }
  return v;
}

export function parseManifest(raw: string): JellyManifest {
  const acc = rawParse(raw);

  // schema_version first — an unsupported version is its own error.
  const rawVersion = acc.top.schema_version;
  if (rawVersion === undefined) {
    throw new JellyError('manifest-schema-invalid', "manifest is missing required key 'schema_version'");
  }
  if (typeof rawVersion !== 'number') {
    throw new JellyError('manifest-schema-invalid', "'schema_version' must be an integer");
  }
  if (rawVersion !== SCHEMA_VERSION) {
    throw new JellyError(
      'manifest-unsupported-version',
      `schema_version ${rawVersion} is not supported (expected ${SCHEMA_VERSION})`,
    );
  }

  if (acc.config === null) {
    throw new JellyError('manifest-schema-invalid', 'manifest is missing required [config] table');
  }

  const config: JellyConfig = {
    base_branch: requireString(acc.config, 'base_branch', '[config]'),
    substrate: requireString(acc.config, 'substrate', '[config]'),
  };

  const phases: JellyPhase[] = acc.phases.map((p, i) => ({
    number: requireString(p, 'number', `[[phases]] #${i + 1}`),
    milestone: requireString(p, 'milestone', `[[phases]] #${i + 1}`),
    name: requireString(p, 'name', `[[phases]] #${i + 1}`),
    depends_on: requireStringArray(p, 'depends_on', `[[phases]] #${i + 1}`),
  }));

  return {
    schema_version: SCHEMA_VERSION,
    title: requireString(acc.top, 'title', 'manifest'),
    slug: requireString(acc.top, 'slug', 'manifest'),
    started: requireString(acc.top, 'started', 'manifest'),
    status: requireString(acc.top, 'status', 'manifest'),
    plan_file: requireString(acc.top, 'plan_file', 'manifest'),
    research_file: requireString(acc.top, 'research_file', 'manifest'),
    adr_log: requireString(acc.top, 'adr_log', 'manifest'),
    config,
    phases,
  };
}
