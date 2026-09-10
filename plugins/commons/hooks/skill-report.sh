#!/usr/bin/env bash
# Activations per skill over the last N days (default 14), and how each was
# reached: PostToolUse = the model chose it, UserPromptSubmit = typed as /name.
set -eu
LOG="${SKILL_LOG:-$HOME/.claude/skill-activations.jsonl}"
days="${1:-14}"
since=$(date -u -d "-$days days" +%FT%TZ 2>/dev/null || date -u -v-"$days"d +%FT%TZ)
[ -f "$LOG" ] || { echo "no log at $LOG"; exit 0; }
echo "since $since"
jq -r --arg since "$since" 'select(.ts >= $since) | "\(.skill)\t\(.via)"' "$LOG" \
  | sort | uniq -c | sort -rn
