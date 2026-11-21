#!/usr/bin/env bash
# Usage: memory-sync.sh pull | memory-sync.sh commit "<message>"
# Serializes git operations on the agent-memory worktree and pushes to GitHub.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"  # repo root, from this script's location
MEM=$ROOT/.agent-team
LOCK=$ROOT/.agent-local/memory.lock
for i in $(seq 1 120); do mkdir "$LOCK" 2>/dev/null && break; sleep 1; done
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
cd "$MEM"
case "${1:-}" in
  pull) git pull --rebase --autostash -q origin agent-memory ;;
  commit)
    git add -A
    git diff --cached --quiet || git commit -q -m "${2:-agent memory update}"
    for i in 1 2 3; do git pull --rebase -q origin agent-memory && git push -q origin agent-memory && exit 0; sleep 2; done
    echo "push failed" >&2; exit 1 ;;
  *) echo "usage: $0 pull | commit <msg>" >&2; exit 2 ;;
esac
