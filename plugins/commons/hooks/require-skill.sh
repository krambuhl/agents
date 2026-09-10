#!/usr/bin/env bash
# PreToolUse gate. A tool that posts to a PR thread may run only if pr-comments
# was activated earlier in this session; a tool that commits or opens a PR only
# if write-as-me was. Reads the log written by log-skill-activation.sh.
# Exit 2 blocks the tool call and feeds the message back to Claude, which then
# loads the skill and retries. Requires jq.
set -eu
LOG="${SKILL_LOG:-$HOME/.claude/skill-activations.jsonl}"
input=$(cat)
session=$(jq -r '.session_id' <<<"$input")
tool=$(jq -r '.tool_name' <<<"$input")
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")

need=""
case "$tool" in
  mcp__github__add_issue_comment|mcp__github__add_reply_to_pull_request_comment|\
  mcp__github__pull_request_review_write|mcp__github__add_comment_to_pending_review)
    need=pr-comments ;;
  mcp__github__create_pull_request|mcp__github__update_pull_request)
    need=write-as-me ;;
  Bash)
    if   grep -Eq '(^|[;&|]\s*)gh (pr (comment|review)|api [^|]*comments)' <<<"$cmd"; then need=pr-comments
    elif grep -Eq '(^|[;&|]\s*)(git commit|gh pr (create|edit)|gh stack submit|gs (stack|branch) submit)' <<<"$cmd"; then need=write-as-me
    fi ;;
esac
[ -n "$need" ] || exit 0

if [ -f "$LOG" ] && jq -e --arg s "$session" --arg k "$need" \
     'select(.session == $s and .skill == $k)' "$LOG" >/dev/null 2>&1; then
  exit 0
fi

echo "Blocked: load the \`$need\` skill before $tool — it carries the voice and conventions for this. Invoke it, then retry the call." >&2
exit 2
