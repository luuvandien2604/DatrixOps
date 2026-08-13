#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRODUCTION_COMPOSE="${PROJECT_ROOT}/docker-compose.prod.yml"

grep -q 'api.github.com/repos/luuvandien2604/DatrixOps/contents/deploy/install.sh?ref=main' "${PROJECT_ROOT}/deploy/bootstrap.sh" || {
    echo "ERROR: bootstrap must resolve the current installer through GitHub Contents API" >&2
    exit 1
}
grep -q 'PANEL_PORT="${DATRIXOPS_PANEL_PORT:-7800}"' "${PROJECT_ROOT}/deploy/install.sh" || {
    echo "ERROR: installer must default to dedicated panel port 7800" >&2
    exit 1
}
grep -q 'ADMIN_CREDENTIALS_FILE="${PROJECT_ROOT}/.admin-credentials"' "${PROJECT_ROOT}/deploy/install.sh" || {
    echo "ERROR: installer must persist generated administrator credentials in the install directory" >&2
    exit 1
}
grep -q '^ensure_admin_account$' "${PROJECT_ROOT}/deploy/install.sh" || {
    echo "ERROR: installer must create the initial administrator automatically" >&2
    exit 1
}
grep -q -- '--resolve "${public_host}:${public_port}:127.0.0.1"' "${PROJECT_ROOT}/deploy/install.sh" || {
    echo "ERROR: installer setup requests must preserve the public Host and TLS SNI over loopback" >&2
    exit 1
}
grep -q 'install -m 0755 "${SCRIPT_DIR}/datrixops.sh" /usr/local/bin/datrix' "${PROJECT_ROOT}/deploy/install.sh" || {
    echo "ERROR: installer must install the DatrixOps management CLI" >&2
    exit 1
}
grep -q 'install -m 0755 "${SCRIPT_DIR}/datrixops.sh" /usr/local/bin/datrix' "${PROJECT_ROOT}/deploy/upgrade.sh" || {
    echo "ERROR: updater must refresh the DatrixOps management CLI" >&2
    exit 1
}

grep -q 'codeload.github.com/luuvandien2604/DatrixOps/tar.gz/refs/tags/v' "${PROJECT_ROOT}/deploy/install.sh" || {
    echo "ERROR: bootstrap installer must download an immutable CE tag directly from codeload" >&2
    exit 1
}
CURRENT_VERSION="$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${PROJECT_ROOT}/deploy/version.json" | head -n 1)"
grep -q "DATRIXOPS_INSTALL_VERSION:-${CURRENT_VERSION}" "${PROJECT_ROOT}/deploy/install.sh" || {
    echo "ERROR: bootstrap installer does not default to the current CE version" >&2
    exit 1
}
grep -q 'releases/tags/${RELEASE_TAG}' "${PROJECT_ROOT}/deploy/fetch-agent-release.sh" || {
    echo "ERROR: Agent release downloader must resolve an immutable Agent tag" >&2
    exit 1
}
grep -q 'agent-v${VERSION}' "${PROJECT_ROOT}/deploy/fetch-agent-release.sh" || {
    echo "ERROR: Agent release downloader must default to agent-vX.Y.Z tags" >&2
    exit 1
}
grep -q 'up -d --force-recreate backend worker' "${PROJECT_ROOT}/deploy/promote-agent.sh" || {
    echo "ERROR: Agent promotion must not rebuild or retag CE Server images" >&2
    exit 1
}
grep -q "Accept: application/octet-stream" "${PROJECT_ROOT}/deploy/fetch-agent-release.sh" || {
    echo "ERROR: Agent release API downloads must request binary asset content" >&2
    exit 1
}

grep -q 'golang:1.25-alpine' "${PROJECT_ROOT}/deploy/fetch-agent-release.sh" || {
    echo "ERROR: deployment release verification must support clean hosts without Go" >&2
    exit 1
}

if grep -q 'frontend/public:/app/public' "$PRODUCTION_COMPOSE"; then
    echo "ERROR: production Compose must not hide Agent artifacts embedded in the frontend image" >&2
    exit 1
fi

for installer in "${PROJECT_ROOT}/frontend/public/install.sh" "${PROJECT_ROOT}/frontend/public/install-mac.sh"; do
    if ! grep -q 'bootstrap_rollback_token' "$installer" || ! grep -q 'agent/enroll/rollback' "$installer"; then
        echo "ERROR: installer missing bootstrap rollback support: $installer" >&2
        exit 1
    fi
    if ! grep -q 'ALLOW_INSECURE_HTTP' "$installer"; then
        echo "ERROR: installer missing ALLOW_INSECURE_HTTP flag support: $installer" >&2
        exit 1
    fi
done

if ! grep -q 'bootstrap_rollback_token' "${PROJECT_ROOT}/frontend/public/install.ps1" || \
   ! grep -q 'agent/enroll/rollback' "${PROJECT_ROOT}/frontend/public/install.ps1"; then
    echo "ERROR: install.ps1 missing bootstrap rollback support" >&2
    exit 1
fi

if ! grep -q 'datrixops-agent.bak' "${PROJECT_ROOT}/frontend/public/update-agent.sh" || \
   ! grep -q 'datrixops-agent.bak' "${PROJECT_ROOT}/frontend/public/update-agent.ps1"; then
    echo "ERROR: update scripts missing backup restoration handling" >&2
    exit 1
fi
