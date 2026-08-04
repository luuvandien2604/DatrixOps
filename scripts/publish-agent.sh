#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env.release"

if [[ -f "$ENV_FILE" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
fi

VERSION="${1:-}"
OUTPUT_DIR="${2:-${PROJECT_ROOT}/dist/agent-releases/${VERSION}}"
if [[ -z "$VERSION" ]]; then
    echo "Usage: $0 VERSION [OUTPUT_DIR]" >&2
    exit 2
fi

exec "${PROJECT_ROOT}/scripts/build-agent-release.sh" "$VERSION" "$OUTPUT_DIR"
