#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -n "${BASH_SOURCE[0]:-}" && -f "${BASH_SOURCE[0]:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
else
    SCRIPT_DIR="$(pwd)"
fi
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
    local target_file="$ENV_FILE"
    if [[ -L "$target_file" ]]; then
        target_file="$(readlink -f "$target_file" 2>/dev/null || readlink "$target_file" || echo "$target_file")"
    fi
    local escaped="${value//\\/\\\\}"
    escaped="${escaped//&/\\&}"
    escaped="${escaped//|/\\|}"
    if grep -q "^${key}=" "$target_file"; then
        sed -i.bak "s|^${key}=.*|${key}=${escaped}|" "$target_file"
        rm -f -- "${target_file}.bak"
    else
        printf '%s=%s\n' "$key" "$value" >>"$target_file"
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
if [[ -z "$(current_value SETUP_TOKEN)" ]]; then
    set_value SETUP_TOKEN "$(openssl rand -hex 32)"
fi

if [[ -f "${PROJECT_ROOT}/.env" && "${SCRIPT_DIR}" != "${PROJECT_ROOT}" ]]; then
    if [[ ! -L "${SCRIPT_DIR}/.env" || "$(readlink -f "${SCRIPT_DIR}/.env" 2>/dev/null)" != "$(readlink -f "${PROJECT_ROOT}/.env" 2>/dev/null)" ]]; then
        rm -f "${SCRIPT_DIR}/.env"
        ln -sf "${PROJECT_ROOT}/.env" "${SCRIPT_DIR}/.env"
    fi
fi

echo "Secrets generated in ${ENV_FILE}."
echo "Set CADDY_SITE_ADDRESS, PUBLIC_URL, ALLOWED_ORIGINS and AGENT_VERSION before installation."
