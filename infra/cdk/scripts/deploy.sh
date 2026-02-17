#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

ENV_FILE_PATH="${1:-}"
if [ -z "$ENV_FILE_PATH" ]; then
  echo "Usage: ./scripts/deploy.sh <env-file> [cdk args...]" >&2
  exit 1
fi

if [ ! -f "$PROJECT_DIR/$ENV_FILE_PATH" ]; then
  echo "Env file '$ENV_FILE_PATH' not found in $PROJECT_DIR." >&2
  exit 1
fi

shift

if ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null)"; then
  export CDK_DEFAULT_ACCOUNT="$ACCOUNT_ID"
fi

if [ "$#" -eq 0 ]; then
  set -- deploy --all --require-approval never
fi

node --env-file="$PROJECT_DIR/$ENV_FILE_PATH" "$PROJECT_DIR/../../node_modules/aws-cdk/bin/cdk" "$@"
