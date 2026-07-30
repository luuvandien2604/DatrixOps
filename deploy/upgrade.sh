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
if [[ -n "$(git -C "$PROJECT_ROOT" status --porcelain)" ]]; then
    echo "ERROR: Refusing to upgrade a dirty working tree." >&2
    exit 1
fi

PREVIOUS_COMMIT="$(git -C "$PROJECT_ROOT" rev-parse HEAD)"
CURRENT_BRANCH="$(git -C "$PROJECT_ROOT" branch --show-current)"
BACKUP_FILE="$("${SCRIPT_DIR}/backup.sh")"
echo "Backup created: ${BACKUP_FILE}"

git -C "$PROJECT_ROOT" pull --ff-only
"${SCRIPT_DIR}/fetch-agent-release.sh" "$(sed -n 's/^AGENT_VERSION=//p' "$ENV_FILE" | tail -n 1)"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm migrate
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d

healthy=false
for _ in $(seq 1 24); do
    if docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T backend \
        wget -qO- http://127.0.0.1:8080/health/ready >/dev/null 2>&1; then
        healthy=true
        break
    fi
    sleep 5
done
if [[ "$healthy" == "true" ]]; then
    docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
    echo "Upgrade completed successfully."
    exit 0
fi

echo "ERROR: Health check failed. Rebuilding the previous revision." >&2
git -C "$PROJECT_ROOT" checkout --detach "$PREVIOUS_COMMIT"
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d
if [[ -n "$CURRENT_BRANCH" ]]; then
    git -C "$PROJECT_ROOT" checkout "$CURRENT_BRANCH"
fi
echo "Rollback completed. Source remains on ${CURRENT_BRANCH:-detached}; inspect logs before retrying." >&2
exit 1
