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
