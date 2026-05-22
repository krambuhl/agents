import { LinearClient } from './linear-client.ts';
import { LinearLoomError } from './errors.ts';
import type { GitHubRemote } from './git.ts';

// Linear Document creation lib.
//
// linear-loom's research / plan / retro verbs each upload a markdown
// file to Linear as a Document, prepending the standard 3-line
// provenance header per DESIGN.md § 13. The header is mechanical and
// identical across every Document type: which loom-project,
// where-on-github, when-synced.
//
// Documents land under a Linear Project (flat — DESIGN.md § 5: "Linear
// Documents = flat under the Linear Project, title prefixed").

export interface ProvenanceContext {
  loomProjectName: string;
  loomProjectLabel: string;
  github: GitHubRemote;
  branch: string;
  slug: string;
  filename: string;
  syncedAt: string;
}

export function provenanceHeader(ctx: ProvenanceContext): string {
  const source = `github.com/${ctx.github.org}/${ctx.github.repo}/tree/${ctx.branch}/projects/${ctx.slug}/${ctx.filename}`;
  // Trailing blank line after the divider so the source body starts
  // after a blank line per DESIGN.md § 13's literal example.
  return [
    `**Project**: ${ctx.loomProjectName} (loom-project: ${ctx.loomProjectLabel})`,
    `**Source**: ${source}`,
    `**Last synced**: ${ctx.syncedAt}`,
    '',
    '---',
    '',
    '',
  ].join('\n');
}

export function composeDocumentBody(
  ctx: ProvenanceContext,
  fileBody: string,
): string {
  return `${provenanceHeader(ctx)}${fileBody}`;
}

interface LinearDocumentCreateResult {
  documentCreate: {
    success: boolean;
    document: {
      id: string;
      url: string;
      title: string;
    } | null;
  };
}

const DOCUMENT_CREATE_MUTATION = `
  mutation LinearLoomDocumentCreate($input: DocumentCreateInput!) {
    documentCreate(input: $input) {
      success
      document {
        id
        url
        title
      }
    }
  }
`;

export interface CreateDocumentArgs {
  client: LinearClient;
  projectId: string;
  title: string;
  body: string;
}

export interface CreatedDocument {
  id: string;
  url: string;
  title: string;
}

export async function createDocument(
  args: CreateDocumentArgs,
): Promise<CreatedDocument> {
  const result = await args.client.query<LinearDocumentCreateResult>(
    DOCUMENT_CREATE_MUTATION,
    {
      input: {
        projectId: args.projectId,
        title: args.title,
        content: args.body,
      },
    },
  );
  if (
    result.documentCreate.success !== true ||
    result.documentCreate.document === null
  ) {
    throw new LinearLoomError(
      'document-create-failed',
      `Linear documentCreate reported success=false for "${args.title}". Check that the Linear API key has Document-write permission on the target Project.`,
    );
  }
  return {
    id: result.documentCreate.document.id,
    url: result.documentCreate.document.url,
    title: result.documentCreate.document.title,
  };
}
