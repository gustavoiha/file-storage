#!/usr/bin/env bash

set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/generate-cloudfront-keypair.sh [--name NAME] [--output-dir DIR] [--force]

Generates a 2048-bit RSA keypair for CloudFront signed URLs / KeyGroup usage.

Options:
  --name NAME         Base filename for keys (default: file-read)
  --output-dir DIR    Output directory (default: infra/cdk/.keys/cloudfront)
  --force             Overwrite existing key files
  -h, --help          Show this help

Outputs:
  <output-dir>/<name>.private.pem
  <output-dir>/<name>.public.pem
  <output-dir>/<name>.public.env

The *.public.env file is a single-line escaped value suitable for:
  FILE_READ_PUBLIC_KEY_PEM=<value>
EOF
}

NAME="file-read"
OUTPUT_DIR="$PROJECT_DIR/.keys/cloudfront"
FORCE="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --name)
      if [ "${2:-}" = "" ]; then
        echo "Missing value for --name" >&2
        exit 1
      fi
      NAME="$2"
      shift 2
      ;;
    --output-dir)
      if [ "${2:-}" = "" ]; then
        echo "Missing value for --output-dir" >&2
        exit 1
      fi
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --force)
      FORCE="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required but not found in PATH." >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"

PRIVATE_KEY_PATH="$OUTPUT_DIR/${NAME}.private.pem"
PUBLIC_KEY_PATH="$OUTPUT_DIR/${NAME}.public.pem"
PUBLIC_ENV_PATH="$OUTPUT_DIR/${NAME}.public.env"

if [ "$FORCE" != "true" ] && { [ -f "$PRIVATE_KEY_PATH" ] || [ -f "$PUBLIC_KEY_PATH" ]; }; then
  echo "Key files already exist. Use --force to overwrite." >&2
  echo "  $PRIVATE_KEY_PATH" >&2
  echo "  $PUBLIC_KEY_PATH" >&2
  exit 1
fi

openssl genrsa -out "$PRIVATE_KEY_PATH" 2048 >/dev/null 2>&1
openssl rsa -in "$PRIVATE_KEY_PATH" -pubout -out "$PUBLIC_KEY_PATH" >/dev/null 2>&1

chmod 600 "$PRIVATE_KEY_PATH"
chmod 644 "$PUBLIC_KEY_PATH"

ESCAPED_PUBLIC_KEY="$(awk '{printf "%s\\n", $0}' "$PUBLIC_KEY_PATH")"
ESCAPED_PUBLIC_KEY="${ESCAPED_PUBLIC_KEY%\\n}"
printf '%s\n' "$ESCAPED_PUBLIC_KEY" > "$PUBLIC_ENV_PATH"
chmod 600 "$PUBLIC_ENV_PATH"

cat <<EOF
Generated CloudFront keypair:
  Private key: $PRIVATE_KEY_PATH
  Public key:  $PUBLIC_KEY_PATH
  Env value:   $PUBLIC_ENV_PATH

Next steps:
1) Add FILE_READ_PUBLIC_KEY_PEM to your infra env file:
   FILE_READ_PUBLIC_KEY_PEM=$(cat "$PUBLIC_ENV_PATH")

2) Store the private key in SSM SecureString:
   aws ssm put-parameter \\
     --name "/dockspace/<env>/cloudfront/file-read-private-key" \\
     --type "SecureString" \\
     --overwrite \\
     --value "\$(cat "$PRIVATE_KEY_PATH")"

3) Set this in your infra env file:
   FILE_READ_PRIVATE_KEY_PARAMETER_NAME=/dockspace/<env>/cloudfront/file-read-private-key
EOF
