#!/usr/bin/env bash
set -Eeuo pipefail

find_environment() {
    local start_dir=""
    if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]:-}" ]]; then
        start_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    else
        start_dir="$(pwd)"
    fi

    # Determine PROJECT_ROOT and SCRIPT_DIR
    if [[ "$(basename "$start_dir")" == "deploy" ]]; then
        PROJECT_ROOT="$(cd "${start_dir}/.." && pwd)"
        SCRIPT_DIR="${start_dir}"
    elif [[ -d "${start_dir}/deploy" && -f "${start_dir}/deploy/docker-compose.yml" ]]; then
        PROJECT_ROOT="${start_dir}"
        SCRIPT_DIR="${start_dir}/deploy"
    elif [[ -f "/opt/datrixops/deploy/docker-compose.yml" ]]; then
        PROJECT_ROOT="/opt/datrixops"
        SCRIPT_DIR="/opt/datrixops/deploy"
    else
        PROJECT_ROOT="${start_dir}"
        SCRIPT_DIR="${start_dir}"
    fi

    # Resolve ENV_FILE
    if [[ -f "${PROJECT_ROOT}/.env" ]]; then
        ENV_FILE="${PROJECT_ROOT}/.env"
    elif [[ -f "${SCRIPT_DIR}/.env" ]]; then
        ENV_FILE="${SCRIPT_DIR}/.env"
    elif [[ -f "/opt/datrixops/.env" ]]; then
        ENV_FILE="/opt/datrixops/.env"
    else
        ENV_FILE="${PROJECT_ROOT}/.env"
    fi

    # Prefer deploy/docker-compose.yml (pre-built GHCR image compose)
    if [[ -f "${SCRIPT_DIR}/docker-compose.yml" ]]; then
        COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
    elif [[ -f "${PROJECT_ROOT}/deploy/docker-compose.yml" ]]; then
        SCRIPT_DIR="${PROJECT_ROOT}/deploy"
        COMPOSE_FILE="${PROJECT_ROOT}/deploy/docker-compose.yml"
    elif [[ -f "${PROJECT_ROOT}/docker-compose.yml" ]]; then
        COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.yml"
    else
        COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
    fi
}
find_environment

BACKUP_DIR="${DATRIXOPS_BACKUP_DIR:-${PROJECT_ROOT}/backups}"
TIMESTAMP="$(date -u +%Y-%m-%d-%H%M%S)"
OUTPUT="${1:-${BACKUP_DIR}/datrixops-backup-${TIMESTAMP}.tar.gz}"
STAGING_DIR="$(mktemp -d)"
trap 'rm -rf -- "$STAGING_DIR"' EXIT

[[ -f "$ENV_FILE" ]] || {
    echo "ERROR: Missing configuration file ${ENV_FILE}." >&2
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
