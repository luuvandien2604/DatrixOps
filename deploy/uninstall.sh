#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${PROJECT_ROOT}/.env"

[[ -f "$ENV_FILE" ]] || {
    echo "ERROR: Missing ${ENV_FILE}." >&2
    exit 1
}

if [[ "${1:-}" == "--purge-data" ]]; then
    if [[ "${2:-}" != "--yes" ]]; then
        echo "ERROR: --purge-data permanently deletes named volumes. Re-run with --purge-data --yes." >&2
        exit 2
    fi
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down --volumes
    echo "DatrixOps containers and named volumes removed."
else
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down
    echo "DatrixOps containers removed. Database and gateway volumes were preserved."
fi
