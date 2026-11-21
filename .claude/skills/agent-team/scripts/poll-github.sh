#!/usr/bin/env bash
# Usage:
#   poll-github.sh [max_wait_seconds=100]   Read-only. Blocks until there are unacknowledged issues / issue+PR
#                                            comments by gustavoiha (excluding agent-authored posts) on
#                                            gustavoiha/file-storage, prints them as a JSON array (oldest first),
#                                            or prints [] on timeout. Does NOT mark anything as seen.
#   poll-github.sh ack <id> [<id>...]        Mark events as handled (the PM runs this after recording them).
# Events stay deliverable until acked, so a crashed watcher or PM never loses one.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"  # repo root, from this script's location
DIR=$ROOT/.agent-local; STATE="$DIR/state.json"
REPO=gustavoiha/file-storage; USER=gustavoiha; MARK='<!-- agent-team -->'
LOCK="$DIR/poller.lock"

if [ "${1:-}" = "ack" ]; then
  shift; [ "$#" -gt 0 ] || { echo "usage: $0 ack <id>..." >&2; exit 2; }
  for i in $(seq 1 60); do mkdir "$LOCK" 2>/dev/null && break; sleep 1; done
  trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
  TMP=$(mktemp)
  jq '.seen = ((.seen + $ARGS.positional) | unique)' "$STATE" --args "$@" > "$TMP"
  jq -e '.seen and .since' "$TMP" >/dev/null || { echo "ack produced invalid state; not saved" >&2; rm -f "$TMP"; exit 1; }
  mv "$TMP" "$STATE"
  echo "acked $#"; exit 0
fi

MAX="${1:-100}"; START=$(date +%s)
while :; do
  SINCE=$(jq -r .since "$STATE")
  ISSUES=$(gh api --paginate "repos/$REPO/issues?state=all&creator=$USER&since=$SINCE&per_page=100" \
    | jq -s --arg m "$MARK" '[.[][] | select(.pull_request|not) | select((.body//"")|contains($m)|not)
        | {kind:"issue", id:("issue-"+(.id|tostring)), issue:.number, title, body:(.body//""), url:.html_url, at:.created_at}]') || ISSUES=null
  COMMENTS=$(gh api --paginate "repos/$REPO/issues/comments?since=$SINCE&per_page=100" \
    | jq -s --arg u "$USER" --arg m "$MARK" '[.[][] | select(.user.login==$u) | select((.body//"")|contains($m)|not)
        | {kind:"comment", id:("comment-"+(.id|tostring)), issue:(.issue_url|split("/")|last|tonumber), body, url:.html_url, at:.created_at}]') || COMMENTS=null
  if [ "$ISSUES" != null ] && [ "$COMMENTS" != null ]; then
    NEW=$(jq -n --argjson a "$ISSUES" --argjson b "$COMMENTS" --slurpfile s "$STATE" \
      '($s[0].seen) as $seen | [$a[], $b[]] | map(select(.id as $i | $seen|index($i)|not)) | sort_by(.at)')
    if [ "$(jq length <<<"$NEW")" -gt 0 ]; then echo "$NEW"; exit 0; fi
  else
    echo "github request failed; retrying" >&2
  fi
  [ $(( $(date +%s) - START )) -ge "$MAX" ] && { echo '[]'; exit 0; }
  sleep 20
done
