#!/usr/bin/env bash
# PreToolUse gate: text that ships under the engineer's name has been through
# the writing-judge subagent first.
#
# A call "ships text" when it commits, opens or edits a pull request, posts a
# pull request or issue comment, or adds comment lines to a source file. For
# such a call the gate looks in the activation log for a writing-judge run in
# this session that has not yet been consumed by an earlier shipped text. If
# one exists, every outstanding judge run is marked consumed and the call
# proceeds: one judge loop covers one shipped text. If none exists, the call
# is blocked (exit 2) and the message tells the model what to do.
#
# WRITE_AS_ME_GATE=off disables the gate for sessions with no subagent tool.
# Requires jq.
set -eu
[ "${WRITE_AS_ME_GATE:-on}" != "off" ] || exit 0
LOG="${SKILL_LOG:-$HOME/.claude/skill-activations.jsonl}"
input=$(cat)
session=$(jq -r '.session_id' <<<"$input")
tool=$(jq -r '.tool_name' <<<"$input")

ships=""
case "$tool" in
  mcp__github__create_pull_request|mcp__github__update_pull_request|\
  mcp__github__add_issue_comment|mcp__github__add_reply_to_pull_request_comment|\
  mcp__github__pull_request_review_write|mcp__github__add_comment_to_pending_review|\
  mcp__github__push_files)
    ships="$tool" ;;
  Bash)
    cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
    if   grep -Eq '(^|[;&|(]\s*)git commit\b' <<<"$cmd"; then ships="git commit"
    elif grep -Eq '(^|[;&|(]\s*)gh pr (create|edit|comment|review|merge)\b' <<<"$cmd"; then ships="gh pr"
    elif grep -Eq '(^|[;&|(]\s*)gh (stack submit|stack push)\b' <<<"$cmd"; then ships="gh stack"
    elif grep -Eq '(^|[;&|(]\s*)gs (stack|branch|commit) (submit|create|amend)\b' <<<"$cmd"; then ships="gs"
    elif grep -Eq '(^|[;&|(]\s*)gh api\b' <<<"$cmd" \
      && grep -Eq '(pulls|issues|comments|reviews)' <<<"$cmd" \
      && grep -Eq '(-X|--method) *(POST|PATCH|PUT)|(^| )(-f|-F|--field|--raw-field|--input)( |=)' <<<"$cmd"; then ships="gh api write"
    fi ;;
  Edit|MultiEdit|Write)
    # Only source files: a markdown heading is not a comment.
    path=$(jq -r '.tool_input.file_path // empty' <<<"$input")
    case "${path##*.}" in
      ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|swift|c|h|cpp|hpp|cs|sh|bash|zsh|css|scss|less|html|vue|svelte|sql|yaml|yml|toml) ;;
      *) exit 0 ;;
    esac
    # Comment lines present in the new text and absent from the old text.
    added=$(jq -r '
      def comments: [splits("\n") | select(test("^\\s*(//|#(?!!)|/\\*|\\*|<!--|--|;;)"))];
      if .tool_name == "Write" then ((.tool_input.content // "") | comments)
      elif .tool_name == "MultiEdit" then
        [.tool_input.edits[]? | ((.new_string // "") | comments) - ((.old_string // "") | comments)] | add // []
      else ((.tool_input.new_string // "") | comments) - ((.tool_input.old_string // "") | comments)
      end | length' <<<"$input")
    [ "${added:-0}" -gt 0 ] && ships="code comment" ;;
esac
[ -n "$ships" ] || exit 0

pending=0
if [ -f "$LOG" ]; then
  pending=$(jq -rs --arg s "$session" '
    map(select(.session == $s))
    | (map(select(.skill == "writing-judge")) | length) - (map(select(.skill == "judge-consumed") | .count // 1) | add // 0)' "$LOG")
fi

if [ "${pending:-0}" -gt 0 ]; then
  printf '{"ts":"%s","session":"%s","skill":"judge-consumed","via":"%s","count":%s}\n' \
    "$(date -u +%FT%TZ)" "$session" "$ships" "$pending" >>"$LOG"
  exit 0
fi

cat >&2 <<EOF
blocked: this call ships text under the engineer's name ($ships) and no writing-judge run covers it yet. load the write-as-me skill, draft the text, run it through the writing-judge subagent (Agent tool, subagent type writing-judge), revise on its verdict, then retry. one judge loop covers one shipped text. WRITE_AS_ME_GATE=off disables this in a session with no subagent tool.
EOF
exit 2
