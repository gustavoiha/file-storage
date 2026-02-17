#!/usr/bin/env bash

set -euo pipefail

DEPLOY_ENV="${1:-}"
if [ -z "$DEPLOY_ENV" ]; then
  echo "Usage: ./scripts/deploy.sh <dev|prod>" >&2
  exit 1
fi

if [ "$DEPLOY_ENV" != "dev" ] && [ "$DEPLOY_ENV" != "prod" ]; then
  echo "Invalid environment '$DEPLOY_ENV'. Expected 'dev' or 'prod'." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env.$DEPLOY_ENV}"
DIST_DIR="${DIST_DIR:-$PROJECT_DIR/dist}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Environment file '$ENV_FILE' not found." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

if [ -z "${SITE_BUCKET_NAME:-}" ] || [ "$SITE_BUCKET_NAME" = "REPLACE_ME" ]; then
  echo "Missing SITE_BUCKET_NAME in '$ENV_FILE'." >&2
  exit 1
fi

if [ -z "${DISTRIBUTION_ID:-}" ] || [ "$DISTRIBUTION_ID" = "REPLACE_ME" ]; then
  echo "Missing DISTRIBUTION_ID in '$ENV_FILE'." >&2
  exit 1
fi

npm run "build:$DEPLOY_ENV"

aws s3 sync "$DIST_DIR/" "s3://$SITE_BUCKET_NAME" --delete
aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "/*"
