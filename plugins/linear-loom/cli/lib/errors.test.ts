import { test, expect } from 'vitest';
import { LinearLoomError } from './errors.ts';

test('LinearLoomError: code + message land on the Error message', () => {
  const err = new LinearLoomError('missing-auth', 'No key found.');
  expect(err.code).toBe('missing-auth');
  expect(err.message).toBe('missing-auth: No key found.');
  expect(err.name).toBe('LinearLoomError');
});

test('LinearLoomError: toPayload includes optional fields when set', () => {
  const err = new LinearLoomError('linear-project-not-found', 'No project.', {
    namespace: 'configure',
    candidates: ['proj-a', 'proj-b'],
  });
  const payload = err.toPayload();
  expect(payload).toEqual({
    error: 'linear-project-not-found',
    message: 'linear-project-not-found: No project.',
    namespace: 'configure',
    candidates: ['proj-a', 'proj-b'],
  });
});

test('LinearLoomError: toPayload omits optional fields when unset', () => {
  const err = new LinearLoomError('missing-auth', 'No key.');
  const payload = err.toPayload();
  expect(payload).toEqual({
    error: 'missing-auth',
    message: 'missing-auth: No key.',
  });
  expect(Object.keys(payload).sort()).toEqual(['error', 'message']);
});

test('LinearLoomError: verb field surfaces in payload when set', () => {
  const err = new LinearLoomError('missing-args', 'no slug', {
    namespace: 'project',
    verb: 'read',
  });
  expect(err.toPayload()).toEqual({
    error: 'missing-args',
    message: 'missing-args: no slug',
    namespace: 'project',
    verb: 'read',
  });
});
