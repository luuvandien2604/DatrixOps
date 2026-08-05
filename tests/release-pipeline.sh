#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKFLOW="${PROJECT_ROOT}/.github/workflows/release.yml"
PRODUCTION_COMPOSE="${PROJECT_ROOT}/docker-compose.prod.yml"

for script in "${PROJECT_ROOT}/scripts/build-agent-release.sh" "${PROJECT_ROOT}/scripts/publish-agent.sh"; do
    if grep -Eq 'git (add|commit|tag|push)|gh release (create|delete)|push --force|push .* -f' "$script"; then
        echo "ERROR: release builder mutates Git history or publishes releases: $script" >&2
        exit 1
    fi
done

if grep -Eq 'git push|push --force|push .* -f|gh release delete' "$WORKFLOW"; then
    echo "ERROR: CE release workflow rewrites Git history or deletes releases" >&2
    exit 1
fi

[[ "$(grep -c 'gh release create' "$WORKFLOW")" -eq 1 ]] || {
    echo "ERROR: CE workflow must create the GitHub Release exactly once" >&2
    exit 1
}
grep -q 'Build signed Agent release' "$WORKFLOW"
grep -q 'Stage verified Agent artifacts in frontend' "$WORKFLOW"
grep -q 'Verify frontend image Agent artifacts' "$WORKFLOW"

if grep -q 'frontend/public:/app/public' "$PRODUCTION_COMPOSE"; then
    echo "ERROR: production Compose must not hide Agent artifacts embedded in the frontend image" >&2
    exit 1
fi

grep -Eq 'go-version: ?"1\.25' "$WORKFLOW" || {
    echo "ERROR: CE workflow must specify Go 1.25" >&2
    exit 1
}

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

if ! grep -q 'bootstrap_rollback_token' "${PROJECT_ROOT}/frontend/public/install.ps1" || ! grep -q 'agent/enroll/rollback' "${PROJECT_ROOT}/frontend/public/install.ps1"; then
    echo "ERROR: install.ps1 missing bootstrap rollback support" >&2
    exit 1
fi

if ! grep -q 'datrixops-agent.bak' "${PROJECT_ROOT}/frontend/public/update-agent.sh" || ! grep -q 'datrixops-agent.bak' "${PROJECT_ROOT}/frontend/public/update-agent.ps1"; then
    echo "ERROR: update scripts missing backup restoration handling" >&2
    exit 1
fi


