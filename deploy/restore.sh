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

BACKUP_FILE="${1:-}"
CONFIRM="${2:-}"
STAGING_DIR="$(mktemp -d)"
trap 'rm -rf -- "$STAGING_DIR"' EXIT

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
    echo "Usage: $0 /path/to/datrixops-backup.tar.gz --yes" >&2
    exit 2
fi
if [[ "$CONFIRM" != "--yes" ]]; then
    echo "ERROR: Restore replaces the target database. Re-run with --yes." >&2
    exit 2
fi
if tar -tzf "$BACKUP_FILE" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
    echo "ERROR: Backup archive contains an unsafe path." >&2
    exit 1
fi
tar -xzf "$BACKUP_FILE" -C "$STAGING_DIR"
test -s "${STAGING_DIR}/database.dump" || {
    echo "ERROR: Backup does not contain a valid database.dump." >&2
    exit 1
}
if [[ ! -f "$ENV_FILE" ]]; then
    test -s "${STAGING_DIR}/environment.env" || {
        echo "ERROR: Backup does not contain environment.env for this clean host." >&2
        exit 1
    }
    cp "${STAGING_DIR}/environment.env" "$ENV_FILE"
    chmod 0600 "$ENV_FILE"
    echo "Restored ${ENV_FILE} from the backup archive. Protect this file because it contains secrets."
fi

DB_SERVICE="database"
if ! docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --services 2>/dev/null | grep -q "^database$"; then
    if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps --services 2>/dev/null | grep -q "^db$"; then
        DB_SERVICE="db"
    fi
fi

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" stop backend worker
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d "$DB_SERVICE"
database_ready=false
for _ in $(seq 1 30); do
    if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
        pg_isready -U datrixops -d datrixops >/dev/null 2>&1; then
        database_ready=true
        break
    fi
    sleep 2
done
if [[ "$database_ready" != "true" ]]; then
    echo "ERROR: PostgreSQL did not become ready within 60 seconds." >&2
    exit 1
fi
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T "$DB_SERVICE" \
    pg_restore -U datrixops -d datrixops --clean --if-exists --no-owner \
    <"${STAGING_DIR}/database.dump"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run -T --rm migrate < /dev/null || true
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
echo "Restore completed. Verify the dashboard and Agent connectivity."
