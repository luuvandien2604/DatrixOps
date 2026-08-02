#!/usr/bin/env bash
set -Eeuo pipefail

find_environment() {
    local start_dir=""
    if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]:-}" ]]; then
        start_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    else
        start_dir="$(pwd)"
    fi

    ENV_FILE=""
    PROJECT_ROOT=""

    if [[ -f "${start_dir}/.env" ]]; then
        ENV_FILE="${start_dir}/.env"
        PROJECT_ROOT="${start_dir}"
    elif [[ -f "$(cd "${start_dir}/.." 2>/dev/null && pwd)/.env" && "$(basename "$start_dir")" == "deploy" ]]; then
        PROJECT_ROOT="$(cd "${start_dir}/.." 2>/dev/null && pwd)"
        ENV_FILE="${PROJECT_ROOT}/.env"
    elif [[ -f "${start_dir}/deploy/.env" ]]; then
        PROJECT_ROOT="${start_dir}"
        ENV_FILE="${start_dir}/deploy/.env"
    elif [[ -f "/opt/datrixops/.env" ]]; then
        PROJECT_ROOT="/opt/datrixops"
        ENV_FILE="/opt/datrixops/.env"
    elif [[ -f "/opt/datrixops/deploy/.env" ]]; then
        PROJECT_ROOT="/opt/datrixops/deploy"
        ENV_FILE="/opt/datrixops/deploy/.env"
    elif [[ -f "$(pwd)/.env" ]]; then
        PROJECT_ROOT="$(pwd)"
        ENV_FILE="$(pwd)/.env"
    fi

    if [[ -z "$ENV_FILE" || ! -f "$ENV_FILE" ]]; then
        PROJECT_ROOT="${PROJECT_ROOT:-${start_dir}}"
        ENV_FILE="${PROJECT_ROOT}/.env"
    fi

    if [[ -d "${PROJECT_ROOT}/deploy" && -f "${PROJECT_ROOT}/deploy/docker-compose.yml" ]]; then
        SCRIPT_DIR="${PROJECT_ROOT}/deploy"
        COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
    elif [[ -f "${PROJECT_ROOT}/docker-compose.yml" ]]; then
        SCRIPT_DIR="${PROJECT_ROOT}"
        COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.yml"
    elif [[ -f "${start_dir}/docker-compose.yml" ]]; then
        SCRIPT_DIR="${start_dir}"
        COMPOSE_FILE="${start_dir}/docker-compose.yml"
    else
        SCRIPT_DIR="${PROJECT_ROOT}/deploy"
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
