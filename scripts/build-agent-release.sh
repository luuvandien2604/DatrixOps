#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="${PROJECT_ROOT}/agent"
VERSION="${1:-}"
OUTPUT_DIR="${2:-}"

die() {
    echo "ERROR: $*" >&2
    exit 1
}

sha256_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    die "version must use X.Y.Z format"
fi
if [[ -z "$OUTPUT_DIR" ]]; then
    die "usage: $0 VERSION OUTPUT_DIR"
fi
if [[ -e "$OUTPUT_DIR" ]]; then
    die "output directory already exists: $OUTPUT_DIR"
fi
if [[ -z "${AGENT_SIGNING_PRIVATE_KEY:-}" && -n "${AGENT_SIGNING_PRIVATE_KEY_FILE:-}" ]]; then
    [[ -r "$AGENT_SIGNING_PRIVATE_KEY_FILE" ]] || \
        die "signing key file is not readable: $AGENT_SIGNING_PRIVATE_KEY_FILE"
    AGENT_SIGNING_PRIVATE_KEY="$(tr -d '\r\n[:space:]' <"$AGENT_SIGNING_PRIVATE_KEY_FILE")"
fi
if [[ -z "${AGENT_SIGNING_PRIVATE_KEY:-}" ]]; then
    die "AGENT_SIGNING_PRIVATE_KEY or AGENT_SIGNING_PRIVATE_KEY_FILE is required"
fi
if [[ ! "${AGENT_RELEASE_BASE_URL:-}" =~ ^https:// ]]; then
    die "AGENT_RELEASE_BASE_URL must use HTTPS"
fi

for command in go grep mktemp install awk; do
    command -v "$command" >/dev/null || die "required command is missing: $command"
done
if ! command -v sha256sum >/dev/null 2>&1 && ! command -v shasum >/dev/null 2>&1; then
    die "required SHA-256 command is missing: sha256sum or shasum"
fi

OUTPUT_PARENT="$(dirname "$OUTPUT_DIR")"
OUTPUT_NAME="$(basename "$OUTPUT_DIR")"
mkdir -p "$OUTPUT_PARENT"
OUTPUT_PARENT="$(cd "$OUTPUT_PARENT" && pwd)"
OUTPUT_DIR="${OUTPUT_PARENT}/${OUTPUT_NAME}"
STAGING_DIR="$(mktemp -d "${OUTPUT_PARENT}/.${OUTPUT_NAME}.tmp.XXXXXX")"
cleanup() {
    rm -rf -- "$STAGING_DIR"
}
trap cleanup EXIT

targets=(
    "linux amd64 datrixops-agent-linux-amd64"
    "linux arm64 datrixops-agent-linux-arm64"
    "darwin amd64 datrixops-agent-darwin-amd64"
    "darwin arm64 datrixops-agent-darwin-arm64"
    "windows amd64 datrixops-agent-windows-amd64.exe"
)

for target in "${targets[@]}"; do
    read -r goos goarch filename <<<"$target"
    echo "Building Agent ${VERSION} for ${goos}/${goarch}"
    (
        cd "$AGENT_DIR"
        CGO_ENABLED=0 GOOS="$goos" GOARCH="$goarch" \
            go build -trimpath -buildvcs=false \
            -ldflags="-s -w -X main.Version=${VERSION} -X main.VersionMarker=datrixops-agent-version=${VERSION}" \
            -o "${STAGING_DIR}/${filename}" ./cmd/agent
    )
    [[ -s "${STAGING_DIR}/${filename}" ]] || die "empty Agent artifact: $filename"
    grep -aFq "datrixops-agent-version=${VERSION}" "${STAGING_DIR}/${filename}" || \
        die "Agent artifact has no embedded version marker: $filename"
done

printf '%s\n' "$VERSION" >"${STAGING_DIR}/agent-release.version"
install -m 0755 "${PROJECT_ROOT}/frontend/public/install.sh" "${STAGING_DIR}/install.sh"
install -m 0755 "${PROJECT_ROOT}/frontend/public/install-mac.sh" "${STAGING_DIR}/install-mac.sh"
install -m 0755 "${PROJECT_ROOT}/frontend/public/install.ps1" "${STAGING_DIR}/install.ps1"
install -m 0755 "${PROJECT_ROOT}/frontend/public/update-agent.sh" "${STAGING_DIR}/update-agent.sh"
install -m 0755 "${PROJECT_ROOT}/frontend/public/update-agent.ps1" "${STAGING_DIR}/update-agent.ps1"

(
    cd "$AGENT_DIR"
    AGENT_VERSION="$VERSION" \
    AGENT_RELEASE_DIR="$STAGING_DIR" \
    AGENT_RELEASE_BASE_URL="$AGENT_RELEASE_BASE_URL" \
    AGENT_RELEASE_LAYOUT="${AGENT_RELEASE_LAYOUT:-}" \
    AGENT_RELEASE_BASE_URL_INCLUDES_VERSION="${AGENT_RELEASE_BASE_URL_INCLUDES_VERSION:-0}" \
    AGENT_SIGNING_PRIVATE_KEY="$AGENT_SIGNING_PRIVATE_KEY" \
        go run ./tools/sign-release
)

install -m 0644 "${STAGING_DIR}/manifest.json" "${STAGING_DIR}/agent-release-manifest.json"
install -m 0644 "${STAGING_DIR}/manifest.sig" "${STAGING_DIR}/agent-release-manifest.sig"

mapfile -t all_files < "${PROJECT_ROOT}/agent/internal/update/release_assets.txt"

for filename in "${all_files[@]}"; do
    if [[ -f "${STAGING_DIR}/${filename}" ]]; then
        sha256_file "${STAGING_DIR}/${filename}" >"${STAGING_DIR}/${filename}.sha256"
        wc -c <"${STAGING_DIR}/${filename}" | tr -d ' ' >"${STAGING_DIR}/${filename}.size"
    fi
done

(
    cd "$STAGING_DIR"
    : >checksums.txt
    for filename in "${all_files[@]}"; do
        if [[ -f "$filename" ]]; then
            printf '%s  %s\n' "$(sha256_file "$filename")" "$filename" >>checksums.txt
        fi
    done
)

(
    cd "$AGENT_DIR"
    go run ./tools/verify-release \
        --release-dir "$STAGING_DIR" \
        --version "$VERSION"
)

mv -- "$STAGING_DIR" "$OUTPUT_DIR"
STAGING_DIR=""
trap - EXIT
echo "Verified Agent release ${VERSION} written to ${OUTPUT_DIR}"
