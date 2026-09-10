pr #412: add createAvatarColumn to the shared table package

review thread on packages/table/src/columns/createAvatarColumn.tsx line 14

@mira (reviewer):
> nit: `opts.header ?? ''` renders an empty th. can we default to undefined so the header cell is omitted entirely? the date column does that.

state: the fix is already pushed as commit 9e1f2ab. the header now defaults to undefined and the test was updated to assert no th is rendered when header is omitted.
