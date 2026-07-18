#!/bin/bash
set -euo pipefail

# Builds the release binaries only. Installer scripts are source-controlled in
# frontend/public so publishing cannot overwrite their service configuration.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="$PROJECT_ROOT/agent"
PUBLIC_DIR="$PROJECT_ROOT/frontend/public"
AGENT_VERSION="${AGENT_VERSION:-1.5.0}"
MIN_SELF_UPDATING_VERSION="1.3.0"

version_at_least() {
    local current_core="${1%%[-+]*}"
    local minimum_core="${2%%[-+]*}"
    local current_major current_minor current_patch
    local minimum_major minimum_minor minimum_patch
    IFS=. read -r current_major current_minor current_patch <<< "$current_core"
    IFS=. read -r minimum_major minimum_minor minimum_patch <<< "$minimum_core"
    (( current_major > minimum_major )) ||
        (( current_major == minimum_major && current_minor > minimum_minor )) ||
        (( current_major == minimum_major && current_minor == minimum_minor && current_patch >= minimum_patch ))
}

if ! [[ "$AGENT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
    echo "Invalid AGENT_VERSION '$AGENT_VERSION'. Expected a semantic version such as 1.3.0." >&2
    exit 1
fi

if ! version_at_least "$AGENT_VERSION" "$MIN_SELF_UPDATING_VERSION"; then
    echo "Refusing to publish Agent $AGENT_VERSION." >&2
    echo "Agent $MIN_SELF_UPDATING_VERSION is the minimum release containing the hardened self-updater." >&2
    exit 1
fi

mkdir -p "$PUBLIC_DIR"
cd "$AGENT_DIR"

build_agent() {
    local goos="$1"
    local goarch="$2"
    local output="$3"

    echo "Building DatrixOps Agent ${AGENT_VERSION} for ${goos}/${goarch}"
    CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" go build \
        -ldflags="-s -w -X main.Version=${AGENT_VERSION}" \
        -o "$PUBLIC_DIR/$output" \
        ./cmd/agent
}

build_agent linux amd64 datrixops-agent-linux-amd64
build_agent linux arm64 datrixops-agent-linux-arm64
build_agent darwin amd64 datrixops-agent-darwin-amd64
build_agent darwin arm64 datrixops-agent-darwin-arm64
build_agent windows amd64 datrixops-agent-windows-amd64.exe

chmod +x "$PUBLIC_DIR/install.sh" "$PUBLIC_DIR/install-mac.sh"

echo "Agent release ${AGENT_VERSION} published to frontend/public."
echo "Set backend AGENT_VERSION=${AGENT_VERSION} for version reporting."
