#!/bin/bash
set -euo pipefail

# Builds the release binaries only. Installer scripts are source-controlled in
# frontend/public so publishing cannot overwrite their service configuration.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="$PROJECT_ROOT/agent"
PUBLIC_DIR="$PROJECT_ROOT/frontend/public"
AGENT_VERSION="${AGENT_VERSION:-1.2.0}"

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
