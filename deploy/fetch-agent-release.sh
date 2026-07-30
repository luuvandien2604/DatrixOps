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
command -v curl >/dev/null 2>&1 || {
    echo "ERROR: curl is required to fetch Agent release artifacts." >&2
    exit 1
}
command -v sha256sum >/dev/null 2>&1 || {
    echo "ERROR: sha256sum is required to verify Agent release artifacts." >&2
    exit 1
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

for filename in "${files[@]}"; do
    curl --fail --location --silent --show-error --max-time 120 \
        "${DOWNLOAD_BASE%/}/${filename}" \
        --output "${STAGING_DIR}/${filename}"
    test -s "${STAGING_DIR}/${filename}" || {
        echo "ERROR: Downloaded release file is empty: ${filename}" >&2
        exit 1
    }
done

(
    cd "$STAGING_DIR"
    sha256sum --check checksums.txt
)
[[ "$(wc -c <"${STAGING_DIR}/manifest.sig" | tr -d ' ')" == "64" ]] || {
    echo "ERROR: manifest.sig is not an Ed25519 signature." >&2
    exit 1
}

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
    cp -f "${RELEASE_DIR}/${filename}" "${PUBLIC_DIR}/${filename}"
done
chmod 0755 \
    "${PUBLIC_DIR}/datrixops-agent-linux-amd64" \
    "${PUBLIC_DIR}/datrixops-agent-linux-arm64" \
    "${PUBLIC_DIR}/datrixops-agent-darwin-amd64" \
    "${PUBLIC_DIR}/datrixops-agent-darwin-arm64"

echo "Agent ${VERSION} artifacts verified and installed."
