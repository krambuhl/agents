#!/usr/bin/env bash
# Appends one JSON line per activation to ~/.claude/skill-activations.jsonl.
# Three sources:
#   PostToolUse on Skill        the model invoked a skill
#   PostToolUse on Agent/Task   the model ran a subagent; only writing-judge
#                               runs are recorded, as skill "writing-judge"
#   UserPromptSubmit            the engineer typed /name by hand
# require-judge.sh reads this log to decide whether text about to ship has
# been through the judge. Requires jq.
set -eu
LOG="${SKILL_LOG:-$HOME/.claude/skill-activations.jsonl}"
input=$(cat)
event=$(jq -r '.hook_event_name' <<<"$input")
session=$(jq -r '.session_id' <<<"$input")
tool=$(jq -r '.tool_name // empty' <<<"$input")
skill=""
case "$event" in
  PostToolUse)
    case "$tool" in
      Skill) skill=$(jq -r '.tool_input.skill // empty' <<<"$input") ;;
      Agent|Task)
        sub=$(jq -r '.tool_input.subagent_type // empty' <<<"$input")
        case "$sub" in *writing-judge) skill="writing-judge" ;; esac ;;
    esac ;;
  UserPromptSubmit) skill=$(jq -r '.prompt // "" | capture("^/(?<s>[A-Za-z0-9_:-]+)") | .s // empty' <<<"$input") ;;
esac
[ -n "$skill" ] || exit 0
# Plugin skills arrive namespaced ("commons:write-as-me"); log the bare name.
skill="${skill##*:}"
mkdir -p "$(dirname "$LOG")"
printf '{"ts":"%s","session":"%s","skill":"%s","via":"%s"}\n' \
  "$(date -u +%FT%TZ)" "$session" "$skill" "$event" >>"$LOG"
