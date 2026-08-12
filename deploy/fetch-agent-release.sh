#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VERSION="${1:-}"
CUSTOM_DOWNLOAD_BASE="${DATRIXOPS_RELEASE_DOWNLOAD_BASE:-}"
DOWNLOAD_BASE="${CUSTOM_DOWNLOAD_BASE:-https://github.com/luuvandien2604/DatrixOps/releases/download/v${VERSION}}"
RELEASE_API="https://api.github.com/repos/luuvandien2604/DatrixOps/releases/tags/v${VERSION}"
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

download_custom_release_asset() {
    local filename="$1"
    local output="$2"
    curl --fail --location --silent --show-error \
        --retry 5 --retry-delay 2 --connect-timeout 15 --max-time 300 \
        "${DOWNLOAD_BASE%/}/${filename}" \
        --output "$output"
}

download_github_release_bundle() {
    local bundle_name="datrixops-agent-release-${VERSION}.tar.gz"
    local bundle_path="${STAGING_DIR}/${bundle_name}"
    local asset_api_url

    asset_api_url="$(jq -r --arg name "$bundle_name" \
        '.assets[] | select(.name == $name) | .url' \
        <<<"$RELEASE_METADATA")"
    if [[ -z "$asset_api_url" || "$asset_api_url" == "null" ]]; then
        echo "ERROR: Release v${VERSION} does not contain bundle ${bundle_name}." >&2
        return 1
    fi

    # One API asset request avoids unreliable github.com release redirects and
    # avoids exhausting the unauthenticated API limit with per-file requests.
    curl --fail --location --silent --show-error \
        --retry 5 --retry-delay 2 --connect-timeout 15 --max-time 600 \
        -H 'Accept: application/octet-stream' \
        -H 'X-GitHub-Api-Version: 2022-11-28' \
        "$asset_api_url" \
        --output "$bundle_path"

    [[ -s "$bundle_path" ]] || {
        echo "ERROR: Downloaded Agent release bundle is empty." >&2
        return 1
    }
    if tar -tzf "$bundle_path" | grep -Eq '(^/|(^|/)\.\.(/|$))'; then
        echo "ERROR: Agent release bundle contains an unsafe path." >&2
        return 1
    fi
    tar -xzf "$bundle_path" -C "$STAGING_DIR"
    rm -f "$bundle_path"
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

files=()
while IFS= read -r filename; do
    [[ -z "$filename" ]] || files+=("$filename")
done < "${PROJECT_ROOT}/agent/internal/update/release_assets.txt"

all_downloads=(checksums.txt)
for f in "${files[@]}"; do
    all_downloads+=("$f" "$f.sha256" "$f.size")
done

if [[ -z "$CUSTOM_DOWNLOAD_BASE" ]]; then
    command -v jq >/dev/null 2>&1 || {
        echo "ERROR: jq is required to resolve public GitHub Release assets." >&2
        exit 1
    }
    echo "INFO: Resolving Agent v${VERSION} release assets through GitHub API..."
    RELEASE_METADATA="$(curl --fail --location --silent --show-error \
        --retry 5 --retry-delay 2 --connect-timeout 15 --max-time 120 \
        -H 'Accept: application/vnd.github+json' \
        -H 'X-GitHub-Api-Version: 2022-11-28' \
        "$RELEASE_API")" || {
        echo "ERROR: Failed to resolve GitHub Release v${VERSION}." >&2
        exit 1
    }
    download_github_release_bundle || {
        echo "ERROR: Failed to download the bundled Agent release v${VERSION}." >&2
        exit 1
    }
else
    RELEASE_METADATA=""
    echo "INFO: Fetching Agent v${VERSION} release artifacts from ${DOWNLOAD_BASE}..."
    for filename in "${all_downloads[@]}"; do
        if ! download_custom_release_asset "$filename" "${STAGING_DIR}/${filename}"; then
            echo "ERROR: Failed to download release asset ${filename}." >&2
            exit 1
        fi
    done
fi

for filename in "${all_downloads[@]}"; do
    if [[ ! -s "${STAGING_DIR}/${filename}" ]]; then
        echo "ERROR: Required release asset ${filename} is missing or empty." >&2
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
