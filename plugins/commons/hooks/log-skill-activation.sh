#!/usr/bin/env bash
# Appends one JSON line per skill activation to ~/.claude/skill-activations.jsonl.
# Wire to two events: PostToolUse (matcher "Skill") catches model-invoked skills;
# UserPromptSubmit catches "/name" typed by hand, which does not go through the
# Skill tool. Requires jq.
set -eu
LOG="${SKILL_LOG:-$HOME/.claude/skill-activations.jsonl}"
input=$(cat)
event=$(jq -r '.hook_event_name' <<<"$input")
session=$(jq -r '.session_id' <<<"$input")
case "$event" in
  PostToolUse)      skill=$(jq -r '.tool_input.skill // empty' <<<"$input") ;;
  UserPromptSubmit) skill=$(jq -r '.prompt // "" | capture("^/(?<s>[A-Za-z0-9_:-]+)") | .s // empty' <<<"$input") ;;
  *)                skill="" ;;
esac
[ -n "$skill" ] || exit 0
# Plugin skills arrive namespaced ("commons:pr-comments"); log the bare name
# so the gate's exact match works regardless of how the skill was reached.
skill="${skill##*:}"
mkdir -p "$(dirname "$LOG")"
printf '{"ts":"%s","session":"%s","skill":"%s","via":"%s"}\n' \
  "$(date -u +%FT%TZ)" "$session" "$skill" "$event" >>"$LOG"
