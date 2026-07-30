#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${1:-${PROJECT_ROOT}/.env}"
TEMPLATE_FILE="${SCRIPT_DIR}/.env.example"

command -v openssl >/dev/null 2>&1 || {
    echo "ERROR: openssl is required." >&2
    exit 1
}

if [[ ! -f "$ENV_FILE" ]]; then
    cp "$TEMPLATE_FILE" "$ENV_FILE"
fi
chmod 0600 "$ENV_FILE"

set_value() {
    local key="$1"
    local value="$2"
    local escaped="${value//\\/\\\\}"
    escaped="${escaped//&/\\&}"
    escaped="${escaped//|/\\|}"
    if grep -q "^${key}=" "$ENV_FILE"; then
        sed -i.bak "s|^${key}=.*|${key}=${escaped}|" "$ENV_FILE"
        rm -f -- "${ENV_FILE}.bak"
    else
        printf '%s=%s\n' "$key" "$value" >>"$ENV_FILE"
    fi
}

current_value() {
    sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1
}

if [[ -z "$(current_value POSTGRES_PASSWORD)" ]]; then
    set_value POSTGRES_PASSWORD "$(openssl rand -hex 32)"
fi
if [[ -z "$(current_value JWT_SECRET)" ]]; then
    set_value JWT_SECRET "$(openssl rand -hex 48)"
fi

echo "Secrets generated in ${ENV_FILE}."
echo "Set DATRIXOPS_DOMAIN, PUBLIC_URL, ALLOWED_ORIGINS and AGENT_VERSION before installation."
