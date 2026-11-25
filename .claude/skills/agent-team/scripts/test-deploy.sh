#!/usr/bin/env bash
# Usage: test-deploy.sh S-NNN|T-XXXX infra|web
# Deploys a sprint's worktree ($REPO/.agent-local/worktrees/S-NNN, branch sprint/S-NNN, managed by sprint.sh) - or,
# for a one-off, a task's worktree ($REPO/.agent-local/worktrees/T-XXXX) - to the dev/test environment with the
# file-storage-dev-agent profile (least-privilege IAM role, not your SSO profile). Works from any working directory; takes no other arguments.
set -euo pipefail
[ "$#" -eq 2 ] || { echo "usage: $0 S-NNN|T-XXXX infra|web" >&2; exit 2; }
TASK="$1"; MODE="$2"
[[ "$TASK" =~ ^(T-[0-9]{4}|S-[0-9]{3})$ ]] || { echo "bad task or sprint id: $TASK" >&2; exit 2; }
case "$MODE" in infra|web) ;; *) echo "usage: $0 T-XXXX infra|web" >&2; exit 2 ;; esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"  # repo root, from this script's location
REPO="$ROOT"
WT="$REPO/.agent-local/worktrees/$TASK"
[ -d "$WT" ] || { echo "no worktree for $TASK at $WT" >&2; exit 1; }
LOGDIR="$REPO/.agent-local/logs/$TASK"; mkdir -p "$LOGDIR"
LOG="$LOGDIR/test-deploy-$MODE-$(date -u +%Y%m%dT%H%M%SZ).log"
export AWS_PROFILE=file-storage-dev-agent
exec > >(tee "$LOG") 2>&1

cd "$WT"
echo "test-deploy $TASK $MODE at $(git rev-parse --short HEAD) on $(git branch --show-current)"
LOCKSUM=$(shasum package-lock.json | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat .agent-lock-sum 2>/dev/null)" != "$LOCKSUM" ]; then
  npm ci --silent && echo "$LOCKSUM" > .agent-lock-sum
fi
cp "$REPO/apps/web/.env.dev" apps/web/.env.dev
cp "$REPO/infra/cdk/.env.dev" infra/cdk/.env.dev

case "$MODE" in
  infra) cd infra/cdk && ./scripts/deploy.sh .env.dev ;;
  web)   cd apps/web && ./scripts/deploy.sh dev ;;
esac
echo "test-deploy $TASK $MODE finished OK. Log: $LOG"
