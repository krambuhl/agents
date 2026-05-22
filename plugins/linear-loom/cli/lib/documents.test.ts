import { test, expect, vi } from 'vitest';
import {
  composeDocumentBody,
  createDocument,
  provenanceHeader,
} from './documents.ts';
import { LinearClient } from './linear-client.ts';

const PROVENANCE_FIXTURE = {
  loomProjectName: 'my-thing',
  loomProjectLabel: 'my-thing',
  github: { org: 'krambuhl', repo: 'agents' },
  branch: 'ev-agent.linear-loom.documents-research',
  slug: 'my-thing',
  filename: 'RESEARCH.md',
  syncedAt: '2026-05-22T20:00:00.000Z',
};

test('provenanceHeader: emits the 3-line header + divider per DESIGN.md § 13', () => {
  const header = provenanceHeader(PROVENANCE_FIXTURE);
  const lines = header.split('\n');
  expect(lines[0]).toBe(
    '**Project**: my-thing (loom-project: my-thing)',
  );
  expect(lines[1]).toBe(
    '**Source**: github.com/krambuhl/agents/tree/ev-agent.linear-loom.documents-research/projects/my-thing/RESEARCH.md',
  );
  expect(lines[2]).toBe('**Last synced**: 2026-05-22T20:00:00.000Z');
  expect(lines[3]).toBe('');
  expect(lines[4]).toBe('---');
  expect(lines[5]).toBe('');
  expect(lines[6]).toBe('');
});

test('composeDocumentBody: header followed by verbatim file body', () => {
  const fileBody = '# Research\n\nThe body text.\n';
  const composed = composeDocumentBody(PROVENANCE_FIXTURE, fileBody);
  expect(composed.endsWith(fileBody)).toBe(true);
  expect(composed.startsWith('**Project**: my-thing')).toBe(true);
});

function clientReturning(response: unknown) {
  return new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn: vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        text: () => Promise.resolve(''),
        json: () => Promise.resolve(response),
      }),
    ),
    sleepFn: () => Promise.resolve(),
  });
}

test('createDocument: returns id/url/title on success', async () => {
  const client = clientReturning({
    data: {
      documentCreate: {
        success: true,
        document: {
          id: 'doc-1',
          url: 'https://linear.app/doc/abc',
          title: 'my-thing · RESEARCH.md',
        },
      },
    },
  });
  const result = await createDocument({
    client,
    projectId: 'lin-proj-1',
    title: 'my-thing · RESEARCH.md',
    body: 'body',
  });
  expect(result).toEqual({
    id: 'doc-1',
    url: 'https://linear.app/doc/abc',
    title: 'my-thing · RESEARCH.md',
  });
});

test('createDocument: throws document-create-failed when success=false', async () => {
  const client = clientReturning({
    data: {
      documentCreate: { success: false, document: null },
    },
  });
  await expect(
    createDocument({
      client,
      projectId: 'lin-proj-1',
      title: 't',
      body: 'b',
    }),
  ).rejects.toMatchObject({ code: 'document-create-failed' });
});

test('createDocument: throws document-create-failed when document is null even with success=true', async () => {
  const client = clientReturning({
    data: {
      documentCreate: { success: true, document: null },
    },
  });
  await expect(
    createDocument({
      client,
      projectId: 'lin-proj-1',
      title: 't',
      body: 'b',
    }),
  ).rejects.toMatchObject({ code: 'document-create-failed' });
});

test('createDocument: surfaces underlying LinearLoomError from client.query', async () => {
  const client = new LinearClient({
    apiKey: 'lin_api_test',
    fetchFn: vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
        json: () => Promise.resolve({}),
      }),
    ),
    sleepFn: () => Promise.resolve(),
  });
  await expect(
    createDocument({ client, projectId: 'p', title: 't', body: 'b' }),
  ).rejects.toMatchObject({ code: 'auth-refused' });
});
