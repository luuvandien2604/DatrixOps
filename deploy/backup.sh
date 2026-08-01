#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    SCRIPT_DIR="$(pwd)"
fi
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
if [[ ! -f "$COMPOSE_FILE" && -f "${PROJECT_ROOT}/docker-compose.prod.yml" ]]; then
    COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.prod.yml"
fi
ENV_FILE="${PROJECT_ROOT}/.env"
BACKUP_DIR="${DATRIXOPS_BACKUP_DIR:-${PROJECT_ROOT}/backups}"
TIMESTAMP="$(date -u +%Y-%m-%d-%H%M%S)"
OUTPUT="${1:-${BACKUP_DIR}/datrixops-backup-${TIMESTAMP}.tar.gz}"
STAGING_DIR="$(mktemp -d)"
trap 'rm -rf -- "$STAGING_DIR"' EXIT

[[ -f "$ENV_FILE" ]] || {
    echo "ERROR: Missing ${ENV_FILE}." >&2
    exit 1
}
mkdir -p "$BACKUP_DIR"
umask 077

DB_SERVICE="database"
if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --services 2>/dev/null | grep -q "^database$"; then
    if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --services 2>/dev/null | grep -q "^db$"; then
        DB_SERVICE="db"
    fi
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
    pg_dump -U datrixops -d datrixops -Fc < /dev/null >"${STAGING_DIR}/database.dump"
test -s "${STAGING_DIR}/database.dump" || {
    echo "ERROR: PostgreSQL dump is empty." >&2
    exit 1
}

cp "$ENV_FILE" "${STAGING_DIR}/environment.env"
chmod 0600 "${STAGING_DIR}/environment.env"
{
    printf 'created_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'git_commit=%s\n' "$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || printf unknown)"
    printf 'format_version=1\n'
} >"${STAGING_DIR}/manifest.txt"

tar -C "$STAGING_DIR" -czf "$OUTPUT" database.dump environment.env manifest.txt
chmod 0600 "$OUTPUT"
echo "$OUTPUT"
