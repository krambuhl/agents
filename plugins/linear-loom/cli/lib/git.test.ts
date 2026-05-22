import { test, expect } from 'vitest';
import { parseGitHubRemote } from './git.ts';
import { LinearLoomError } from './errors.ts';

test('parseGitHubRemote: SSH URL with .git suffix', () => {
  expect(parseGitHubRemote('git@github.com:krambuhl/agents.git')).toEqual({
    org: 'krambuhl',
    repo: 'agents',
  });
});

test('parseGitHubRemote: SSH URL without .git suffix', () => {
  expect(parseGitHubRemote('git@github.com:krambuhl/agents')).toEqual({
    org: 'krambuhl',
    repo: 'agents',
  });
});

test('parseGitHubRemote: HTTPS URL with .git suffix', () => {
  expect(
    parseGitHubRemote('https://github.com/krambuhl/agents.git'),
  ).toEqual({
    org: 'krambuhl',
    repo: 'agents',
  });
});

test('parseGitHubRemote: HTTPS URL without .git suffix', () => {
  expect(parseGitHubRemote('https://github.com/krambuhl/agents')).toEqual({
    org: 'krambuhl',
    repo: 'agents',
  });
});

test('parseGitHubRemote: throws remote-not-github on bitbucket URL', () => {
  expect(() =>
    parseGitHubRemote('git@bitbucket.org:org/repo.git'),
  ).toThrow(LinearLoomError);
  try {
    parseGitHubRemote('git@bitbucket.org:org/repo.git');
  } catch (err) {
    expect((err as LinearLoomError).code).toBe('remote-not-github');
  }
});

test('parseGitHubRemote: throws on malformed URL', () => {
  expect(() => parseGitHubRemote('not-a-url')).toThrow(/remote-not-github/);
});

test('parseGitHubRemote: handles org/repo with hyphens', () => {
  expect(
    parseGitHubRemote('git@github.com:my-org/my-repo-name.git'),
  ).toEqual({ org: 'my-org', repo: 'my-repo-name' });
});
