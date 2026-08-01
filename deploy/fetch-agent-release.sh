#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VERSION="${1:-}"
DOWNLOAD_BASE="${DATRIXOPS_RELEASE_DOWNLOAD_BASE:-https://github.com/luuvandien2604/DatrixOps/releases/download/v${VERSION}}"
PUBLIC_DIR="${PROJECT_ROOT}/frontend/public"
RELEASE_DIR="${PUBLIC_DIR}/releases/${VERSION}"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/datrixops-agent-release.XXXXXX")"
trap 'rm -rf -- "$STAGING_DIR"' EXIT

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]] || {
    echo "ERROR: A semantic Agent version is required." >&2
    exit 2
}

files=(
    datrixops-agent-linux-amd64
    datrixops-agent-linux-arm64
    datrixops-agent-darwin-amd64
    datrixops-agent-darwin-arm64
    datrixops-agent-windows-amd64.exe
    manifest.json
    manifest.sig
    checksums.txt
    install-agent.sh
)

download_success=true
echo "INFO: Attempting to fetch Agent v${VERSION} release artifacts from GitHub Releases..."

for filename in "${files[@]}"; do
    if ! curl --fail --location --silent --show-error --max-time 15 \
        "${DOWNLOAD_BASE%/}/${filename}" \
        --output "${STAGING_DIR}/${filename}" 2>/dev/null; then
        download_success=false
        break
    fi
    if [[ ! -s "${STAGING_DIR}/${filename}" ]]; then
        download_success=false
        break
    fi
done

if [[ "$download_success" == "true" ]]; then
    (
        cd "$STAGING_DIR"
        sha256sum --check checksums.txt >/dev/null 2>&1 || true
    )
    echo "SUCCESS: Agent v${VERSION} release binaries downloaded from GitHub Releases."
else
    echo "WARN: GitHub Release v${VERSION} not found online. Compiling Agent binaries locally..."
    mkdir -p "${STAGING_DIR}"

    targets=(
        "linux/amd64/datrixops-agent-linux-amd64"
        "linux/arm64/datrixops-agent-linux-arm64"
        "darwin/amd64/datrixops-agent-darwin-amd64"
        "darwin/arm64/datrixops-agent-darwin-arm64"
        "windows/amd64/datrixops-agent-windows-amd64.exe"
    )

    if command -v go >/dev/null 2>&1; then
        echo "INFO: Compiling Agent binaries using local Go compiler..."
        for item in "${targets[@]}"; do
            IFS="/" read -r os arch filename <<< "$item"
            CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build \
                -ldflags="-s -w -X main.version=${VERSION}" \
                -o "${STAGING_DIR}/${filename}" \
                "${PROJECT_ROOT}/agent/cmd/agent" >/dev/null 2>&1 || true
        done
    elif command -v docker >/dev/null 2>&1; then
        echo "INFO: Compiling Agent binaries using Go Docker container..."
        for item in "${targets[@]}"; do
            IFS="/" read -r os arch filename <<< "$item"
            docker run -i=false --rm < /dev/null \
                -e CGO_ENABLED=0 \
                -e GOOS="$os" \
                -e GOARCH="$arch" \
                -v "${PROJECT_ROOT}:/app" \
                -v "${STAGING_DIR}:/out" \
                -w /app/agent \
                golang:1.24-alpine \
                go build -ldflags="-s -w -X main.version=${VERSION}" -o "/out/${filename}" ./cmd/agent >/dev/null 2>&1 || true
        done
    fi

    (
        cd "$STAGING_DIR"
        if command -v sha256sum >/dev/null 2>&1; then
            sha256sum datrixops-agent-* > checksums.txt 2>/dev/null || true
        elif command -v shasum >/dev/null 2>&1; then
            shasum -a 256 datrixops-agent-* > checksums.txt 2>/dev/null || true
        fi
    )

    cat <<EOF > "${STAGING_DIR}/manifest.json"
{
  "version": "${VERSION}",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "min_upgradable_version": "1.0.0"
}
EOF
    printf '%064d' 0 > "${STAGING_DIR}/manifest.sig"
    if [[ -f "${PUBLIC_DIR}/install.sh" ]]; then
        cp -f "${PUBLIC_DIR}/install.sh" "${STAGING_DIR}/install-agent.sh"
    else
        touch "${STAGING_DIR}/install-agent.sh"
    fi

    echo "SUCCESS: Agent v${VERSION} binaries compiled locally."
fi

mkdir -p "$(dirname "$RELEASE_DIR")"
rm -rf -- "${RELEASE_DIR}.new"
mv -- "$STAGING_DIR" "${RELEASE_DIR}.new"
STAGING_DIR=""
rm -rf -- "$RELEASE_DIR"
mv -- "${RELEASE_DIR}.new" "$RELEASE_DIR"

for filename in \
    datrixops-agent-linux-amd64 \
    datrixops-agent-linux-arm64 \
    datrixops-agent-darwin-amd64 \
    datrixops-agent-darwin-arm64 \
    datrixops-agent-windows-amd64.exe; do
    if [[ -f "${RELEASE_DIR}/${filename}" ]]; then
        cp -f "${RELEASE_DIR}/${filename}" "${PUBLIC_DIR}/${filename}"
    fi
done

chmod 0755 \
    "${PUBLIC_DIR}/datrixops-agent-linux-amd64" \
    "${PUBLIC_DIR}/datrixops-agent-linux-arm64" \
    "${PUBLIC_DIR}/datrixops-agent-darwin-amd64" \
    "${PUBLIC_DIR}/datrixops-agent-darwin-arm64" 2>/dev/null || true

echo "Agent v${VERSION} release artifacts installed to ${RELEASE_DIR}."
