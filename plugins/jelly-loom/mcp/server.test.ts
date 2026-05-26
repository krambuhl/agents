import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleMessage, callTool, TOOLS, UnknownToolError } from './server.ts';
import type { GitRunner } from '../cli/lib/git.ts';
import type { CliContext } from '../cli/lib/types.ts';

function fakeGit(): GitRunner & { commits: { paths: string[]; message: string }[] } {
  const commits: { paths: string[]; message: string }[] = [];
  return {
    commits,
    isCommitted: () => false,
    addAndCommit: (_r, paths, message) => commits.push({ paths, message }),
  };
}

let scratch: string;
let projectsRoot: string;

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), 'jelly-mcp-'));
  projectsRoot = join(scratch, 'projects');
  mkdirSync(projectsRoot, { recursive: true });
});

afterEach(() => rmSync(scratch, { recursive: true, force: true }));

function ctx(): CliContext {
  return { projectsRoot, repoRoot: scratch, today: '2026-05-26', gitRunner: fakeGit() };
}

describe('handleMessage: protocol', () => {
  test('initialize returns protocolVersion + serverInfo + tools capability', () => {
    const res = handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }, ctx());
    expect(res).not.toBeNull();
    const result = (res as { result: Record<string, unknown> }).result;
    expect(result.protocolVersion).toBe('2024-11-05');
    expect((result.serverInfo as { name: string }).name).toBe('jelly');
    expect(result.capabilities).toEqual({ tools: {} });
  });

  test('notifications/initialized gets no reply (null)', () => {
    expect(handleMessage({ method: 'notifications/initialized' }, ctx())).toBeNull();
  });

  test('tools/list returns the four jelly tools with inputSchemas', () => {
    const res = handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, ctx());
    const tools = (res as { result: { tools: { name: string; inputSchema: unknown }[] } }).result.tools;
    expect(tools.map((t) => t.name).sort()).toEqual(['adr', 'plan', 'research', 'revise']);
    for (const t of tools) {
      expect(t.inputSchema).toBeDefined();
    }
  });

  test('ping returns an empty result', () => {
    const res = handleMessage({ jsonrpc: '2.0', id: 3, method: 'ping' }, ctx());
    expect((res as { result: unknown }).result).toEqual({});
  });

  test('an unknown method with an id returns a -32601 error', () => {
    const res = handleMessage({ jsonrpc: '2.0', id: 4, method: 'bogus/method' }, ctx());
    expect((res as { error: { code: number } }).error.code).toBe(-32601);
  });

  test('tools/call for an unknown tool returns a -32601 error', () => {
    const res = handleMessage(
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope', arguments: {} } },
      ctx(),
    );
    expect((res as { error: { code: number } }).error.code).toBe(-32601);
  });
});

describe('callTool: dispatch + arg mapping', () => {
  test('research tool maps args → verb and returns success content', () => {
    const researchFile = join(scratch, 'r.md');
    const notesFile = join(scratch, 'n.md');
    writeFileSync(researchFile, '# R\nx\n');
    writeFileSync(notesFile, '# N\ny\n');
    const out = callTool(
      'research',
      { slug_or_topic: 'demo-topic', research_file: researchFile, notes_file: notesFile, no_commit: true },
      ctx(),
    );
    expect(out.isError).toBeUndefined();
    const payload = JSON.parse(out.content[0].text);
    expect(payload.slug).toBe('2026-05-26-demo-topic');
    expect(existsSync(join(projectsRoot, '2026-05-26-demo-topic', 'RESEARCH.md'))).toBe(true);
  });

  test('adr tool maps args → verb and creates the ADR', () => {
    const out = callTool('adr', { title: 'A Decision', no_commit: true }, ctx());
    expect(out.isError).toBeUndefined();
    const payload = JSON.parse(out.content[0].text);
    expect(payload.number).toBe('0001');
    expect(payload.slug).toBe('a-decision');
  });

  test('revise tool threads --target + --rationale through to the verb', () => {
    // Set up a project with a PLAN.md to revise.
    const dir = join(projectsRoot, '2026-05-26-demo');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'PLAN.md'), '# Plan\nold\n');
    const revFile = join(scratch, 'rev.md');
    writeFileSync(revFile, '# Plan\nnew\n');
    const out = callTool(
      'revise',
      { slug: '2026-05-26-demo', target: 'plan', revision_file: revFile, rationale: 'spaces in rationale ok', no_commit: true },
      ctx(),
    );
    expect(out.isError).toBeUndefined();
    expect(JSON.parse(out.content[0].text).target).toBe('plan');
  });

  test('a verb error surfaces as content with isError (not a thrown protocol error)', () => {
    // research with no files → the verb returns missing-args; the tool
    // call should NOT throw, but return isError content.
    const out = callTool('research', { slug_or_topic: 'demo' }, ctx());
    expect(out.isError).toBe(true);
    expect(JSON.parse(out.content[0].text).error).toBe('missing-args');
  });

  test('an unknown tool name throws UnknownToolError', () => {
    expect(() => callTool('nonexistent', {}, ctx())).toThrow(UnknownToolError);
  });
});

describe('TOOLS registry', () => {
  test('exposes exactly research/plan/revise/adr, each with a required-args schema', () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(['adr', 'plan', 'research', 'revise']);
    for (const t of TOOLS) {
      const schema = t.inputSchema as { required?: string[]; type: string };
      expect(schema.type).toBe('object');
      expect(Array.isArray(schema.required)).toBe(true);
    }
  });
});
