#!/usr/bin/env bash
# Usage: prod-deploy.sh diff | diff-pr <PR#> | infra | web
# Production deploys for the agent-team Deployment agent. Always deploys the current origin/main, from a dedicated
# clean worktree ($REPO/.agent-local/worktrees/prod-main), with the least-privilege profile file-storage-prod-agent.
# Works from any working directory; takes no other arguments (so a permission rule can match it exactly).
#   diff         cdk diff of origin/main against prod
#   diff-pr N    cdk diff of PR N as it would land (GitHub's merge preview refs/pull/N/merge) against prod
#   infra  cdk deploy --all (infra/backend)
#   web    build and deploy the web app (S3 sync + CloudFront invalidation)
set -euo pipefail
usage() { echo "usage: $0 diff | diff-pr <PR#> | infra | web (no other arguments)" >&2; exit 2; }
MODE="${1:-}"; PR=""
case "$MODE" in
  diff|infra|web) [ "$#" -eq 1 ] || usage ;;
  diff-pr) [ "$#" -eq 2 ] && [[ "$2" =~ ^[0-9]+$ ]] || usage; PR="$2" ;;
  *) usage ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"  # repo root, from this script's location
REPO="$ROOT"
WT="$REPO/.agent-local/worktrees/prod-main"
LOGDIR="$REPO/.agent-local/logs"; mkdir -p "$LOGDIR"
LOG="$LOGDIR/prod-deploy-$MODE-$(date -u +%Y%m%dT%H%M%SZ).log"
export AWS_PROFILE=file-storage-prod-agent
exec > >(tee "$LOG") 2>&1

git -C "$REPO" fetch -q origin main
REF=origin/main
if [ -n "$PR" ]; then
  git -C "$REPO" fetch -q origin "+refs/pull/$PR/merge:refs/agent/pr-$PR-merge" || { echo "PR #$PR has no merge preview (closed, or has conflicts)" >&2; exit 1; }
  REF="refs/agent/pr-$PR-merge"
fi
if [ ! -d "$WT/.git" ] && [ ! -f "$WT/.git" ]; then
  git -C "$REPO" worktree add -q --detach "$WT" origin/main
fi
cd "$WT"
git checkout -q --detach "$REF"
git reset -q --hard "$REF"
git clean -qfdx -e node_modules -e '.env.*' -e .agent-lock-sum
echo "prod-deploy $MODE at $(git rev-parse --short HEAD) ($(git log -1 --format=%s)) as $(aws sts get-caller-identity --query Arn --output text)"

LOCKSUM=$(shasum package-lock.json | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat .agent-lock-sum 2>/dev/null)" != "$LOCKSUM" ]; then
  npm ci --silent && echo "$LOCKSUM" > .agent-lock-sum
fi
cp "$REPO/apps/web/.env.prod" apps/web/.env.prod
cp "$REPO/infra/cdk/.env.prod" infra/cdk/.env.prod

case "$MODE" in
  diff|diff-pr) cd infra/cdk && ./scripts/deploy.sh .env.prod diff ;;
  infra) cd infra/cdk && ./scripts/deploy.sh .env.prod ;;
  web)   cd apps/web && ./scripts/deploy.sh prod ;;
esac
echo "prod-deploy $MODE finished OK. Log: $LOG"
