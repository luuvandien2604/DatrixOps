#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="${1:-}"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "Usage: sudo $0 X.Y.Z" >&2
    exit 2
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
RELEASE_TAG="agent-v${VERSION}"
RELEASE_URL="https://github.com/luuvandien2604/DatrixOps/releases/download/${RELEASE_TAG}"

[[ -f "$ENV_FILE" ]] || { echo "ERROR: missing ${ENV_FILE}" >&2; exit 1; }
[[ -f "$COMPOSE_FILE" ]] || { echo "ERROR: missing ${COMPOSE_FILE}" >&2; exit 1; }

set_env_value() {
    local key="$1" value="$2" escaped
    local target_file="$ENV_FILE"
    if [[ -L "$target_file" ]]; then
        target_file="$(readlink -f "$target_file" 2>/dev/null || readlink "$target_file" || echo "$target_file")"
    fi
    escaped="${value//&/\\&}"
    if grep -q "^${key}=" "$target_file"; then
        sed -i.bak "s|^${key}=.*|${key}=${escaped}|" "$target_file"
        rm -f -- "${target_file}.bak"
    else
        printf '%s=%s\n' "$key" "$value" >>"$target_file"
    fi
}

echo "INFO: Downloading and verifying signed Agent ${VERSION}..."
AGENT_RELEASE_TAG="$RELEASE_TAG" "${SCRIPT_DIR}/fetch-agent-release.sh" "$VERSION"

set_env_value AGENT_VERSION "$VERSION"
set_env_value AGENT_RELEASE_BASE_URL "$RELEASE_URL"
set_env_value AGENT_RELEASE_LAYOUT legacy_direct
set_env_value AGENT_ARTIFACT_BASE_URL "$RELEASE_URL"

echo "INFO: Applying the Agent channel without changing CE Server images..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --force-recreate backend worker
echo "SUCCESS: CE Server now advertises signed Agent ${VERSION}."
echo "Existing servers will show Update available after their next heartbeat."

