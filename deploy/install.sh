#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
ENV_FILE="${PROJECT_ROOT}/.env"

command -v docker >/dev/null 2>&1 || {
    echo "ERROR: Docker is required." >&2
    exit 1
}
docker compose version >/dev/null 2>&1 || {
    echo "ERROR: Docker Compose v2 is required." >&2
    exit 1
}

"${SCRIPT_DIR}/generate-secrets.sh" "$ENV_FILE"
chmod 0600 "$ENV_FILE"

required_keys=(POSTGRES_PASSWORD JWT_SECRET DATRIXOPS_DOMAIN PUBLIC_URL ALLOWED_ORIGINS AGENT_VERSION)
for key in "${required_keys[@]}"; do
    value="$(sed -n "s/^${key}=//p" "$ENV_FILE" | tail -n 1)"
    if [[ -z "$value" || "$value" == "monitor.example.com" || "$value" == "https://monitor.example.com" ]]; then
        echo "ERROR: Set ${key} in ${ENV_FILE} before installation." >&2
        exit 1
    fi
done

"${SCRIPT_DIR}/fetch-agent-release.sh" "$(sed -n 's/^AGENT_VERSION=//p' "$ENV_FILE" | tail -n 1)"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config >/dev/null
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm migrate
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps

echo "DatrixOps is starting at $(sed -n 's/^PUBLIC_URL=//p' "$ENV_FILE" | tail -n 1)."
echo "Open /setup to create the initial administrator."
