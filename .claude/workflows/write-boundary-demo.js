export const meta = {
  name: 'write-boundary-demo',
  description:
    'THROWAWAY: validate the workflow write-category boundary from CONVENTIONS.md — Category-1 parallel appends (concurrency-safe), Category read-only whiteboard fan-out, and Category-3 single-writer assembly (parallelize the thinking, serialize the write)',
  phases: [
    { title: 'Append (Cat-1)' },
    { title: 'Whiteboard (read-only)' },
    { title: 'Assemble (Cat-3 single-writer)' },
  ],
}

// args may arrive as a JSON string at the boundary; guard (validated finding).
const input = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
const {
  interventionLogPath = 'demo/scratch/intervention-log.jsonl',
  appendCount = 6,
  whiteboardAgentTypes = [],
  whiteboardTopic = '',
  whiteboardOutPath = 'demo/scratch/whiteboard.md',
} = input

// Phase 1 — Category-1 append safety. N parallel agents append to ONE JSONL
// via the real `griot operator-checks log-intervention` verb. CONVENTIONS.md
// Category 1 promises line-atomic concurrent appends; this stresses that claim.
phase('Append (Cat-1)')
const appendResults = await parallel(
  Array.from({ length: appendCount }, (_, i) => () =>
    agent(
      [
        'Run this command EXACTLY as written and return ONLY its stdout (no commentary, no code fences):',
        '',
        "griot operator-checks log-intervention <<'INPUT'",
        JSON.stringify({
          log_path: interventionLogPath,
          record: { ts: `demo-worker-${i}`, category: 'demo_concurrent_append', worker: i },
        }),
        'INPUT',
      ].join('\n'),
      { label: `append:${i}`, phase: 'Append (Cat-1)' },
    )
      .then((out) => ({ worker: i, ok: true, out: (out || '').slice(0, 160) }))
      .catch((e) => ({ worker: i, ok: false, error: String(e) })),
  ),
)

// Phase 2 — read-only fan-out. Whiteboard engineers each RETURN a section.
// They do NOT write the shared file — parallel writes to one file would be a
// Category-3 collision (corrupts the round-numbering invariant).
phase('Whiteboard (read-only)')
const sections = await parallel(
  whiteboardAgentTypes.map((t) => () =>
    agent(
      [
        `You are a whiteboard engineer. Topic: ${whiteboardTopic}`,
        'Return a concise section (3-5 sentences) giving your lens on the topic. Do NOT write any files; just return your prose section.',
      ].join('\n'),
      { agentType: t, label: `wb:${t}`, phase: 'Whiteboard (read-only)' },
    )
      .then((out) => ({ engineer: t, section: out || '', chars: (out || '').length }))
      .catch((e) => ({ engineer: t, section: `ERROR: ${String(e)}`, chars: 0, errored: true })),
  ),
)

// Phase 3 — Category-3 single-writer assembly. ONE agent writes the shared
// file. The thinking above fanned out in parallel; the WRITE is serialized
// through a single writer, exactly as the Category-3 invariant requires.
phase('Assemble (Cat-3 single-writer)')
const assembled = sections
  .filter(Boolean)
  .map((s) => `## ${s.engineer}\n\n${s.section}`)
  .join('\n\n---\n\n')
const assembleResult = await agent(
  [
    `Write the content below to the file \`${whiteboardOutPath}\` (create parent dirs if needed) in a single write, then return ONLY the word DONE followed by the byte count.`,
    'Content between the markers:',
    '<<<CONTENT',
    assembled,
    'CONTENT',
  ].join('\n'),
  { label: 'assemble', phase: 'Assemble (Cat-3 single-writer)' },
)

return {
  category_1_append: {
    attempted: appendCount,
    succeeded: appendResults.filter((r) => r && r.ok).length,
    log_path: interventionLogPath,
    note: 'verify line-atomicity by reading the JSONL after the run (expect `attempted` well-formed lines)',
  },
  whiteboard_fanout: {
    engineers: sections.filter(Boolean).map((s) => ({ engineer: s.engineer, chars: s.chars, errored: !!s.errored })),
    assembled_chars: assembled.length,
  },
  category_3_assemble: { out_path: whiteboardOutPath, writer_result: assembleResult },
}
