import { LinearClient } from './linear-client.ts';
import { LinearLoomError } from './errors.ts';

// Linear comment-create lib.
//
// The `linear-loom task comment` verb (DESIGN.md § 7) posts a comment
// on a Linear Sub-Issue identified by its composed_key. This module
// wraps Linear's `commentCreate` mutation and surfaces the
// `success=false` / null-comment cases as a structured error so the
// verb layer can return a clean stderr JSON payload.
//
// Comments are flat in v1 — no thread parenting, no editing, no
// deletion. The substrate stays narrow until a real use case
// demands more.

interface LinearCommentCreateResult {
  commentCreate: {
    success: boolean;
    comment: {
      id: string;
      url: string;
    } | null;
  };
}

const COMMENT_CREATE_MUTATION = `
  mutation LinearLoomCommentCreate($input: CommentCreateInput!) {
    commentCreate(input: $input) {
      success
      comment {
        id
        url
      }
    }
  }
`;

export interface CreateCommentArgs {
  client: LinearClient;
  issueId: string;
  body: string;
}

export interface CreatedComment {
  id: string;
  url: string;
}

export async function createComment(
  args: CreateCommentArgs,
): Promise<CreatedComment> {
  const result = await args.client.query<LinearCommentCreateResult>(
    COMMENT_CREATE_MUTATION,
    {
      input: {
        issueId: args.issueId,
        body: args.body,
      },
    },
  );
  if (
    result.commentCreate.success !== true ||
    result.commentCreate.comment === null
  ) {
    throw new LinearLoomError(
      'comment-create-failed',
      `Linear commentCreate reported success=false for issue ${args.issueId}. Check that the Linear API key has comment-write permission on the target Issue.`,
    );
  }
  return {
    id: result.commentCreate.comment.id,
    url: result.commentCreate.comment.url,
  };
}
