#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VERSION="${1:-}"
DOWNLOAD_BASE="${DATRIXOPS_RELEASE_DOWNLOAD_BASE:-https://github.com/luuvandien2604/DatrixOps/releases/download/v${VERSION}}"
PUBLIC_DIR="${PROJECT_ROOT}/frontend/public"
RELEASES_PARENT="${PUBLIC_DIR}/releases"
RELEASE_DIR="${RELEASES_PARENT}/${VERSION}"

verify_release() {
    local release_dir="$1"

    if command -v go >/dev/null 2>&1; then
        (cd "${PROJECT_ROOT}/agent" && go run ./tools/verify-release --release-dir "$release_dir" --version "$VERSION")
        return
    fi

    command -v docker >/dev/null 2>&1 || {
        echo "ERROR: Go or Docker is required to verify the signed Agent release." >&2
        return 1
    }

    echo "INFO: Go is not installed; running the release verifier in the official Go container."
    docker run --rm \
        -v "${PROJECT_ROOT}:/src:ro" \
        -v "${release_dir}:/release:ro" \
        -w /src/agent \
        golang:1.25-alpine \
        go run ./tools/verify-release --release-dir /release --version "$VERSION"
}

[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
    echo "ERROR: A strict semantic Agent version (X.Y.Z) is required." >&2
    exit 2
}

# Check 1: Release directory already present and fully verified
if [[ -f "${RELEASE_DIR}/manifest.json" && -f "${RELEASE_DIR}/manifest.sig" && -f "${RELEASE_DIR}/agent-release.version" ]]; then
    if verify_release "$RELEASE_DIR" >/dev/null 2>&1; then
        echo "SUCCESS: Verified Agent v${VERSION} release artifacts already present in ${RELEASE_DIR}."
        for filename in datrixops-agent-linux-amd64 datrixops-agent-linux-arm64 datrixops-agent-darwin-amd64 datrixops-agent-darwin-arm64 datrixops-agent-windows-amd64.exe; do
            if [[ -f "${RELEASE_DIR}/${filename}" ]]; then
                cp -f "${RELEASE_DIR}/${filename}" "${PUBLIC_DIR}/${filename}" 2>/dev/null || true
            fi
        done
        exit 0
    fi
fi

mkdir -p "$RELEASES_PARENT"
# Same-filesystem staging directory guaranteed to be on the same mount as RELEASE_DIR
STAGING_DIR="$(mktemp -d "${RELEASES_PARENT}/.tmp-staging-XXXXXX")"
cleanup() {
    if [[ -n "${STAGING_DIR:-}" && -d "$STAGING_DIR" ]]; then
        rm -rf -- "$STAGING_DIR"
    fi
}
trap cleanup EXIT

mapfile -t files < "${PROJECT_ROOT}/agent/internal/update/release_assets.txt"

all_downloads=(checksums.txt)
for f in "${files[@]}"; do
    all_downloads+=("$f" "$f.sha256" "$f.size")
done

echo "INFO: Fetching Agent v${VERSION} release artifacts from ${DOWNLOAD_BASE}..."

for filename in "${all_downloads[@]}"; do
    if ! curl --fail --location --silent --show-error --max-time 30 \
        "${DOWNLOAD_BASE%/}/${filename}" \
        --output "${STAGING_DIR}/${filename}"; then
        echo "ERROR: Failed to download release asset ${filename} from GitHub Releases." >&2
        exit 1
    fi
    if [[ ! -s "${STAGING_DIR}/${filename}" ]]; then
        echo "ERROR: Downloaded release asset ${filename} is empty." >&2
        exit 1
    fi
done

# Step 2: Strict SHA-256 Checksum Verification
echo "INFO: Verifying release checksums..."
(
    cd "$STAGING_DIR"
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum --check checksums.txt >/dev/null
    else
        shasum -a 256 --check checksums.txt >/dev/null
    fi
) || {
    echo "ERROR: Release checksum verification failed for v${VERSION}." >&2
    exit 1
}

# Step 3: Verify agent-release.version linkage
VERSION_CONTENT="$(tr -d '\r\n[:space:]' <"${STAGING_DIR}/agent-release.version")"
if [[ "$VERSION_CONTENT" != "$VERSION" ]]; then
    echo "ERROR: agent-release.version (${VERSION_CONTENT}) does not match requested version (${VERSION})." >&2
    exit 1
fi

# Step 4: Client-side Ed25519 Signature & Manifest Verification
echo "INFO: Verifying Ed25519 signature on manifest.json..."
verify_release "$STAGING_DIR" || {
    echo "ERROR: Client-side Ed25519 verification failed for downloaded release v${VERSION}." >&2
    exit 1
}

# Step 5: Same-Filesystem Atomic Directory Promotion
echo "INFO: Promoting verified release v${VERSION} to active directory..."
rm -rf -- "${RELEASE_DIR}.new" "${RELEASE_DIR}.old"
mv -- "$STAGING_DIR" "${RELEASE_DIR}.new"
STAGING_DIR="" # Prevent trap cleanup from deleting the promoted directory

if [[ -d "$RELEASE_DIR" ]]; then
    mv -- "$RELEASE_DIR" "${RELEASE_DIR}.old"
fi

if mv -- "${RELEASE_DIR}.new" "$RELEASE_DIR"; then
    rm -rf -- "${RELEASE_DIR}.old" 2>/dev/null || true
else
    echo "ERROR: Failed to swap release directory. Restoring old release..." >&2
    if [[ -d "${RELEASE_DIR}.old" ]]; then
        mv -- "${RELEASE_DIR}.old" "$RELEASE_DIR"
    fi
    exit 1
fi

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

echo "SUCCESS: Agent v${VERSION} release artifacts verified and installed to ${RELEASE_DIR}."
