#!/usr/bin/env node
import { stdin, stdout, stderr } from 'node:process';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { researchVerb } from '../cli/verbs/research.ts';
import { planVerb } from '../cli/verbs/plan.ts';
import { reviseVerb } from '../cli/verbs/revise.ts';
import { adrVerb } from '../cli/verbs/adr.ts';
import type { CliContext, DispatchResult } from '../cli/lib/types.ts';

// jelly MCP server — exposes the jelly-loom CLI verbs as first-class
// mcp__jelly__* tools under /goal. Speaks the MCP stdio transport
// (line-delimited JSON-RPC 2.0) by hand — no SDK dependency, matching
// the zero-dep posture. The Phase 1.1 probe proved a hand-rolled
// JSON-RPC-over-stdio server is discovered + callable under /goal.
//
// Tools direct-import the verb handlers (no subprocess); each tool maps
// its structured arguments to the verb's `rest` string[] and returns the
// verb's stdout as MCP text content. The verbs remain the single source
// of behavior — the server is a thin protocol adapter.

const SERVER_NAME = 'jelly';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';

type VerbHandler = (rest: string[], ctx: CliContext) => DispatchResult;

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  verb: VerbHandler;
  // Maps the structured tool arguments to the verb's CLI `rest` array.
  toRest: (args: Record<string, unknown>) => string[];
}

function flag(name: string, value: unknown): string[] {
  return value === undefined || value === null ? [] : [`--${name}=${String(value)}`];
}

function boolFlag(name: string, value: unknown): string[] {
  return value === true ? [`--${name}`] : [];
}

export const TOOLS: ToolDef[] = [
  {
    name: 'research',
    description:
      'File a pre-authored research dossier into projects/<slug>/ (RESEARCH.md + RESEARCH-NOTES.md) and commit. Writes no manifest or events.',
    inputSchema: {
      type: 'object',
      properties: {
        slug_or_topic: { type: 'string', description: 'Full slug or a topic to slugify.' },
        research_file: { type: 'string', description: 'Path to the RESEARCH.md content.' },
        notes_file: { type: 'string', description: 'Path to the RESEARCH-NOTES.md content.' },
        no_commit: { type: 'boolean' },
      },
      required: ['slug_or_topic', 'research_file', 'notes_file'],
      additionalProperties: false,
    },
    verb: researchVerb,
    toRest: (a) => [
      String(a.slug_or_topic),
      ...flag('research-file', a.research_file),
      ...flag('notes-file', a.notes_file),
      ...boolFlag('no-commit', a.no_commit),
    ],
  },
  {
    name: 'plan',
    description:
      'Scaffold a jelly project: PLAN.md + INTERVIEW.md + manifest.toml + the project CLAUDE.md (from the template) + the repo-root @-line, then commit.',
    inputSchema: {
      type: 'object',
      properties: {
        slug_or_topic: { type: 'string' },
        plan_file: { type: 'string' },
        interview_file: { type: 'string' },
        manifest_file: { type: 'string', description: 'JSON manifest input.' },
        template_file: { type: 'string', description: 'Path to the jelly-guild CLAUDE.md template.' },
        no_commit: { type: 'boolean' },
      },
      required: ['slug_or_topic', 'plan_file', 'interview_file', 'manifest_file', 'template_file'],
      additionalProperties: false,
    },
    verb: planVerb,
    toRest: (a) => [
      String(a.slug_or_topic),
      ...flag('plan-file', a.plan_file),
      ...flag('interview-file', a.interview_file),
      ...flag('manifest-file', a.manifest_file),
      ...flag('template-file', a.template_file),
      ...boolFlag('no-commit', a.no_commit),
    ],
  },
  {
    name: 'revise',
    description:
      'Replace PLAN.md or RESEARCH.md with new content and append a revision-log entry, then commit. --target selects the file.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Project slug or date-less name.' },
        target: { type: 'string', enum: ['plan', 'research'] },
        revision_file: { type: 'string' },
        rationale: { type: 'string', description: 'The why, for git history + the revision log.' },
        no_commit: { type: 'boolean' },
      },
      required: ['slug', 'target', 'revision_file', 'rationale'],
      additionalProperties: false,
    },
    verb: reviseVerb,
    toRest: (a) => [
      String(a.slug),
      ...flag('target', a.target),
      ...flag('revision-file', a.revision_file),
      ...flag('rationale', a.rationale),
      ...boolFlag('no-commit', a.no_commit),
    ],
  },
  {
    name: 'adr',
    description:
      'Append a workspace-level Architectural Decision Record at projects/adr-log/NNNN-<slug>.md (sequential global numbering), then commit.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body_file: { type: 'string', description: 'Optional path to the ADR body.' },
        status: { type: 'string', description: "Defaults to 'accepted'." },
        no_commit: { type: 'boolean' },
      },
      required: ['title'],
      additionalProperties: false,
    },
    verb: adrVerb,
    toRest: (a) => [
      String(a.title),
      ...flag('body-file', a.body_file),
      ...flag('status', a.status),
      ...boolFlag('no-commit', a.no_commit),
    ],
  },
];

const TOOL_BY_NAME: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.name, t]),
);

export function deriveContext(): CliContext {
  const cwd = process.cwd();
  return {
    projectsRoot: process.env.JELLY_PROJECTS_ROOT ?? join(cwd, 'projects'),
    repoRoot: process.env.JELLY_REPO_ROOT ?? cwd,
  };
}

// Invoke a tool by name with structured args. Returns an MCP
// tools/call result: success content, or content with isError on a
// verb failure. Throws JellyToolError for an unknown tool (a
// protocol-level error the caller maps to JSON-RPC -32601).
export class UnknownToolError extends Error {
  // NOTE: an explicit field + assignment, NOT a `constructor(public
  // toolName: ...)` parameter property — Node's strip-only TS mode
  // (how this server runs via `node server.ts`) rejects parameter
  // properties. Matches how JellyError declares its fields.
  toolName: string;
  constructor(toolName: string) {
    super(`unknown tool: ${toolName}`);
    this.toolName = toolName;
  }
}

export function callTool(
  name: string,
  args: Record<string, unknown>,
  ctx: CliContext,
): { content: { type: 'text'; text: string }[]; isError?: boolean } {
  const tool = TOOL_BY_NAME[name];
  if (tool === undefined) throw new UnknownToolError(name);
  const rest = tool.toRest(args ?? {});
  const result = tool.verb(rest, ctx);
  if (result.exitCode === 0) {
    return { content: [{ type: 'text', text: result.stdout ?? '' }] };
  }
  // A verb error (non-zero exit) is surfaced as tool-call content with
  // isError, not a JSON-RPC protocol error — the model sees the
  // structured error payload and can react.
  return { content: [{ type: 'text', text: result.stderr ?? '' }], isError: true };
}

type JsonRpcMessage = {
  jsonrpc?: string;
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: string | number; result: unknown }
  | { jsonrpc: '2.0'; id: string | number; error: { code: number; message: string } };

// Handle a single JSON-RPC message. Returns a response to write, or
// null for notifications (which get no reply). Pure + testable — the
// stdio loop is the only impure part.
export function handleMessage(
  msg: JsonRpcMessage,
  ctx: CliContext,
): JsonRpcResponse | null {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id: id as string | number,
      result: {
        protocolVersion: PROTOCOL_VERSION,
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        capabilities: { tools: {} },
      },
    };
  }

  if (method === 'notifications/initialized') {
    return null; // notification — no reply
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id: id as string | number,
      result: {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      },
    };
  }

  if (method === 'tools/call') {
    const name = (params?.name as string) ?? '';
    const args = (params?.arguments as Record<string, unknown>) ?? {};
    try {
      const result = callTool(name, args, ctx);
      return { jsonrpc: '2.0', id: id as string | number, result };
    } catch (err) {
      if (err instanceof UnknownToolError) {
        return {
          jsonrpc: '2.0',
          id: id as string | number,
          error: { code: -32601, message: err.message },
        };
      }
      throw err;
    }
  }

  if (method === 'ping') {
    return { jsonrpc: '2.0', id: id as string | number, result: {} };
  }

  if (id !== undefined) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32601, message: `method not found: ${method}` },
    };
  }
  return null;
}

function log(...args: unknown[]): void {
  stderr.write(`[jelly-mcp] ${args.map(String).join(' ')}\n`);
}

function main(): void {
  const ctx = deriveContext();
  const rl = createInterface({ input: stdin, terminal: false });
  rl.on('line', (line: string) => {
    if (line.trim() === '') return;
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(line);
    } catch {
      log('failed to parse line:', line);
      return;
    }
    const response = handleMessage(msg, ctx);
    if (response !== null) stdout.write(`${JSON.stringify(response)}\n`);
  });
  log('jelly MCP server running on stdio');
}

function isEntryPoint(): boolean {
  const arg1 = process.argv[1];
  if (!arg1) return false;
  return arg1.endsWith('server.ts') || arg1.endsWith('server.js');
}

if (isEntryPoint()) {
  main();
}
