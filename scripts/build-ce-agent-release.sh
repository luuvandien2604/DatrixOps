#!/usr/bin/env bash
set -Eeuo pipefail

VERSION="${1:-}"
OUTPUT_DIR="${2:-}"
CE_ROOT="${DATRIXOPS_CE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../DatrixOps" && pwd)}"
CLOUD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

[[ -n "$VERSION" && -n "$OUTPUT_DIR" ]] || {
    echo "Usage: $0 <VERSION> <OUTPUT_DIR>" >&2
    exit 1
}

mkdir -p "$OUTPUT_DIR"

echo "Building Agent v${VERSION} binaries from ${CE_ROOT}/agent..."

# 1. Cross-compile binaries
echo "Compiling linux/amd64..."
(cd "${CE_ROOT}/agent" && GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.Version=${VERSION} -X main.VersionMarker=datrixops-agent-version=${VERSION}" \
    -o "${OUTPUT_DIR}/datrixops-agent-linux-amd64" ./cmd/agent)

echo "Compiling linux/arm64..."
(cd "${CE_ROOT}/agent" && GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.Version=${VERSION} -X main.VersionMarker=datrixops-agent-version=${VERSION}" \
    -o "${OUTPUT_DIR}/datrixops-agent-linux-arm64" ./cmd/agent)

echo "Compiling darwin/amd64..."
(cd "${CE_ROOT}/agent" && GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.Version=${VERSION} -X main.VersionMarker=datrixops-agent-version=${VERSION}" \
    -o "${OUTPUT_DIR}/datrixops-agent-darwin-amd64" ./cmd/agent)

echo "Compiling darwin/arm64..."
(cd "${CE_ROOT}/agent" && GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.Version=${VERSION} -X main.VersionMarker=datrixops-agent-version=${VERSION}" \
    -o "${OUTPUT_DIR}/datrixops-agent-darwin-arm64" ./cmd/agent)

echo "Compiling windows/amd64..."
(cd "${CE_ROOT}/agent" && GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.Version=${VERSION} -X main.VersionMarker=datrixops-agent-version=${VERSION}" \
    -o "${OUTPUT_DIR}/datrixops-agent-windows-amd64.exe" ./cmd/agent)

# 2. Copy install and update scripts
for script in install.sh install-mac.sh install.ps1 update-agent.sh update-agent.ps1; do
    if [[ -f "${CE_ROOT}/frontend/public/${script}" ]]; then
        cp -f "${CE_ROOT}/frontend/public/${script}" "${OUTPUT_DIR}/${script}"
    elif [[ -f "${CLOUD_ROOT}/frontend/public/${script}" ]]; then
        cp -f "${CLOUD_ROOT}/frontend/public/${script}" "${OUTPUT_DIR}/${script}"
    fi
done

# 3. Create version marker
printf '%s\n' "$VERSION" > "${OUTPUT_DIR}/agent-release.version"

# 4. Sign the release manifest
export AGENT_VERSION="$VERSION"
export AGENT_RELEASE_DIR="$OUTPUT_DIR"
(
    cd "${CLOUD_ROOT}/agent"
    go run ./tools/sign-release
)

# 5. Copy manifest aliases for backwards compatibility
if [[ -f "${OUTPUT_DIR}/manifest.json" ]]; then
    cp -f "${OUTPUT_DIR}/manifest.json" "${OUTPUT_DIR}/agent-release-manifest.json"
    cp -f "${OUTPUT_DIR}/manifest.sig" "${OUTPUT_DIR}/agent-release-manifest.sig"
fi

# 6. Generate individual .sha256 and .size files for ALL artifacts
for file in "${OUTPUT_DIR}"/*; do
    [[ -f "$file" ]] || continue
    fname="$(basename "$file")"
    case "$fname" in
        *.sha256|*.size|checksums.txt) continue ;;
    esac
    sha256sum "$file" | awk '{print $1}' > "${file}.sha256"
    wc -c < "$file" | tr -d ' ' > "${file}.size"
done

# 7. Generate master checksums.txt
(
    cd "$OUTPUT_DIR"
    rm -f checksums.txt
    for file in *; do
        [[ -f "$file" ]] || continue
        case "$file" in
            *.sha256|*.size|checksums.txt) continue ;;
        esac
        sha256sum "$file"
    done > checksums.txt
)

echo "Agent release artifacts prepared and signed successfully in ${OUTPUT_DIR}."
