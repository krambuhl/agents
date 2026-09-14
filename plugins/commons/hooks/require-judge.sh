#!/usr/bin/env bash
# PreToolUse gate: text that ships under the engineer's name has been through
# the writing-judge subagent first.
#
# A call "ships text" when it commits, opens or edits a pull request or issue,
# posts a pull request or issue comment, or adds line-leading comment lines to
# a source file. For such a call the gate looks in the activation log for a
# writing-judge run in this session that no earlier shipped text has consumed.
# If one exists, every outstanding judge run is marked consumed and the call
# proceeds: one judge loop covers one shipped text. If none exists, the call is
# blocked (exit 2) and the message tells the model what to do.
#
# The read and the append happen under a lock when flock is available, since
# parallel tool calls run this gate concurrently. A log line that is not JSON
# is skipped rather than failing the gate open.
#
# WRITE_AS_ME_GATE=off (or 0, false, no) disables the gate for sessions with no
# subagent tool. Requires jq.
set -eu
case "${WRITE_AS_ME_GATE:-on}" in off|0|false|no) exit 0 ;; esac
LOG="${SKILL_LOG:-$HOME/.claude/skill-activations.jsonl}"
input=$(cat)
session=$(jq -r '.session_id // empty' <<<"$input")
tool=$(jq -r '.tool_name // empty' <<<"$input")
[ -n "$session" ] && [ -n "$tool" ] || exit 0

has() { grep -Eq -e "$1" <<<"$2"; }

# git commands may carry -c key=val or -C dir between "git" and the verb, and
# may sit behind env, sudo, command, a backslash, bash -c, or a loop keyword.
# Matching the verb anywhere in the command accepts a few false positives
# (echo "git commit") in exchange for catching every wrapper.
GIT='\bgit(\s+-[cC]\s*\S+)*\s+'

classify_bash() {
  local cmd="$1"
  if has "${GIT}commit(\s|$)" "$cmd" && ! has '--no-edit' "$cmd"; then echo "git commit"
  elif has "${GIT}(merge|tag|notes)\b.*(\s-m(\s|$|')|--message)" "$cmd"; then echo "git message"
  elif has '\bgh\s+pr\s+(create|edit|comment)\b' "$cmd"; then echo "gh pr"
  elif has '\bgh\s+pr\s+review\b.*(\s-b(\s|$|=)|--body)' "$cmd"; then echo "gh pr review"
  elif has '\bgh\s+pr\s+merge\b.*(\s-[bt](\s|$|=)|--body|--subject)' "$cmd"; then echo "gh pr merge"
  elif has '\bgh\s+pr\s+close\b.*(\s-c(\s|$|=)|--comment)' "$cmd"; then echo "gh pr close"
  elif has '\bgh\s+issue\s+(create|comment|edit)\b' "$cmd"; then echo "gh issue"
  elif has '\bgh\s+release\s+(create|edit)\b' "$cmd"; then echo "gh release"
  elif has '\bgh\s+stack\s+(submit|push)\b' "$cmd"; then echo "gh stack"
  elif has '\bgs\s+(stack|branch|commit)\s+(submit|create|amend)\b' "$cmd"; then echo "gs"
  elif has '\bgh\s+api\s+graphql\b' "$cmd"; then
    if has '\bmutation\b' "$cmd"; then echo "gh api graphql mutation"; fi
  elif has '\bgh\s+api\b' "$cmd" && has '(pulls|issues|comments|reviews|releases)' "$cmd"; then
    # Explicit write method, or fields other than paging on a call that is
    # not an explicit GET. gh api defaults to POST when fields are given.
    local fields
    fields=$(sed -E 's/(-F|-f|--field|--raw-field)[ =]?(per_page|page)=[^ ]*//g' <<<"$cmd")
    if has '(-X|--method)[ =]*(POST|PATCH|PUT)\b' "$cmd"; then echo "gh api write"
    elif has '(^| )(-f|-F|--field|--raw-field|--input)( |=)' "$fields" \
      && ! has '(-X|--method)[ =]*GET\b' "$cmd" && ! has '--paginate' "$cmd"; then echo "gh api write"
    fi
  fi
}

# Line-leading comment syntax per file extension. Continuation lines (" * ")
# and shell-style "#" in c-family files are deliberately not counted: too many
# false positives (#include, * { }, multiplication).
comment_leader() {
  case "$1" in
    ts|tsx|js|jsx|mjs|cjs|java|kt|swift|c|h|cpp|hpp|cs|go|rs|scss|less) echo '^\s*(//|/\*)' ;;
    css) echo '^\s*/\*' ;;
    vue|svelte) echo '^\s*(//|/\*|<!--)' ;;
    html) echo '^\s*<!--' ;;
    py|rb|sh|bash|zsh|yaml|yml|toml) echo '^\s*#(?![!\[])' ;;
    sql|lua) echo '^\s*--(?!-)' ;;
    *) echo '' ;;
  esac
}

ships=""
case "$tool" in
  mcp__github__create_pull_request|mcp__github__update_pull_request|\
  mcp__github__add_issue_comment|mcp__github__add_reply_to_pull_request_comment|\
  mcp__github__add_comment_to_pending_review|mcp__github__push_files|\
  mcp__github__create_or_update_file|mcp__github__issue_write|mcp__github__merge_pull_request)
    ships="$tool" ;;
  mcp__github__pull_request_review_write)
    # create (pending) and submit_pending carry no text unless a body is given.
    [ -n "$(jq -r '.tool_input.body // empty' <<<"$input")" ] && ships="$tool" ;;
  Bash)
    ships=$(classify_bash "$(jq -r '.tool_input.command // empty' <<<"$input")") ;;
  Edit|MultiEdit|Write)
    path=$(jq -r '.tool_input.file_path // empty' <<<"$input")
    leader=$(comment_leader "${path##*.}")
    if [ -n "$leader" ]; then
      disk=""
      [ "$tool" = "Write" ] && [ -f "$path" ] && disk=$(cat "$path")
      added=$(jq -r --arg re "$leader" --arg disk "$disk" '
        def comments: [splits("\n") | select(test($re))];
        if .tool_name == "Write" then ((.tool_input.content // "") | comments) - ($disk | comments)
        elif .tool_name == "MultiEdit" then
          [.tool_input.edits[]? | ((.new_string // "") | comments) - ((.old_string // "") | comments)] | add // []
        else ((.tool_input.new_string // "") | comments) - ((.tool_input.old_string // "") | comments)
        end | length' <<<"$input" 2>/dev/null || echo 0)
      [ "${added:-0}" -gt 0 ] 2>/dev/null && ships="code comment"
    fi ;;
esac
[ -n "$ships" ] || exit 0

mkdir -p "$(dirname "$LOG")"
exec 9>>"$LOG.lock"
if command -v flock >/dev/null 2>&1; then flock 9; fi

pending=0
note=""
if [ -f "$LOG" ]; then
  pending=$(jq -R 'fromjson? // empty' "$LOG" | jq -s --arg s "$session" '
    map(select(.session == $s))
    | (map(select(.skill == "writing-judge")) | length)
      - (map(select(.skill == "judge-consumed") | (.count // 1) | (tonumber? // 1)) | add // 0)' 2>/dev/null || echo bad)
  case "$pending" in ''|*[!0-9-]*) pending=0; note=" (the activation log at $LOG could not be read)" ;; esac
fi

if [ "$pending" -gt 0 ]; then
  printf '{"ts":"%s","session":"%s","skill":"judge-consumed","via":"%s","count":%s}\n' \
    "$(date -u +%FT%TZ)" "$session" "$ships" "$pending" >>"$LOG"
  exit 0
fi

cat >&2 <<EOF
blocked: this call ships text under the engineer's name ($ships) and no writing-judge run covers it yet$note. load the write-as-me skill, draft the text, run it through the writing-judge subagent (Agent tool, subagent type writing-judge), revise on its verdict, then retry. one judge loop covers one shipped text: judge, ship, then judge the next.
EOF
exit 2
