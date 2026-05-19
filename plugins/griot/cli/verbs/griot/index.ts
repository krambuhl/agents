// griot verb registry — flat verb namespace.
// Each verb is a standalone operation on the learnings substrate
// (rollup, session-notes, judge panels).

import { captureVerb } from './capture.ts';
import { doctorVerb } from './doctor.ts';
import { initVerb } from './init.ts';
import { mediatePanelVerb } from './mediate-panel.ts';
import { operatorChecksVerb } from './operator-checks.ts';
import { useVerb } from './use.ts';

export type GriotCliContext = {
  // Starting hint for project-root resolution. Verbs that touch the
  // filesystem (use, capture, init, doctor) feed this into
  // `resolveProjectRoot` in `_project-root.ts`, which walks up
  // looking for `.git/` and operates on the resulting project root.
  // Defaults to process.cwd() in the CLI entry; tests inject a
  // tmpdir (optionally with an empty `.git/` for walk-up).
  cwd: string;
  // Stdin contents, read once at dispatcher entry when the process
  // is not running in a TTY. Verbs that consume stdin (mediate-panel,
  // operator-checks) read it via this field; verbs that don't
  // consume stdin (use) ignore it. Defaults to empty string.
  stdin?: string;
};

export type DispatchResult = {
  stdout?: string;
  stderr?: string;
  exitCode: number;
};

export type GriotVerbHandler = (
  rest: string[],
  ctx: GriotCliContext,
) => DispatchResult;

export const GRIOT_VERBS: Record<string, GriotVerbHandler> = {
  use: useVerb,
  capture: captureVerb,
  init: initVerb,
  doctor: doctorVerb,
  'operator-checks': operatorChecksVerb,
  'mediate-panel': mediatePanelVerb,
};
