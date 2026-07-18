#!/usr/bin/env bash

set -Eeuo pipefail

# Installer scripts vẫn được quản lý trực tiếp trong frontend/public.
# Release có chữ ký được lưu tại:
# frontend/public/releases/<version>/

PROJECT_ROOT="$(
    cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1
    pwd
)"

AGENT_DIR="$PROJECT_ROOT/agent"
PUBLIC_DIR="$PROJECT_ROOT/frontend/public"
RELEASE_ROOT="$PUBLIC_DIR/releases"

AGENT_VERSION="${AGENT_VERSION:-}"
AGENT_RELEASE_BASE_URL="${AGENT_RELEASE_BASE_URL:-}"

MIN_SELF_UPDATING_VERSION="1.3.0"

STAGING_DIR=""
BACKUP_DIR=""

die() {
    echo "ERROR: $*" >&2
    exit 1
}

cleanup() {
    unset AGENT_SIGNING_PRIVATE_KEY || true

    if [[ -n "${STAGING_DIR:-}" && -d "$STAGING_DIR" ]]; then
        rm -rf "$STAGING_DIR"
    fi

    if [[ -n "${BACKUP_DIR:-}" && -d "$BACKUP_DIR" ]]; then
        rm -rf "$BACKUP_DIR"
    fi
}

trap cleanup EXIT

version_at_least() {
    local current_core="${1%%[-+]*}"
    local minimum_core="${2%%[-+]*}"

    local current_major
    local current_minor
    local current_patch

    local minimum_major
    local minimum_minor
    local minimum_patch

    IFS=. read -r \
        current_major \
        current_minor \
        current_patch <<<"$current_core"

    IFS=. read -r \
        minimum_major \
        minimum_minor \
        minimum_patch <<<"$minimum_core"

    ((10#$current_major > 10#$minimum_major)) ||
        ((10#$current_major == 10#$minimum_major &&
            10#$current_minor > 10#$minimum_minor)) ||
        ((10#$current_major == 10#$minimum_major &&
            10#$current_minor == 10#$minimum_minor &&
            10#$current_patch >= 10#$minimum_patch))
}

validate_configuration() {
    if [[ -z "$AGENT_VERSION" ]]; then
        die "chưa đặt AGENT_VERSION"
    fi

    if ! [[ "$AGENT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]; then
        die "AGENT_VERSION không hợp lệ: '$AGENT_VERSION'. Ví dụ: 1.6.0 hoặc 1.6.0-beta.1"
    fi

    if ! version_at_least \
        "$AGENT_VERSION" \
        "$MIN_SELF_UPDATING_VERSION"; then

        die "Agent $MIN_SELF_UPDATING_VERSION là phiên bản tối thiểu có hardened self-updater"
    fi

    if [[ -z "$AGENT_RELEASE_BASE_URL" ]]; then
        die "chưa đặt AGENT_RELEASE_BASE_URL"
    fi

    if [[ "$AGENT_RELEASE_BASE_URL" != https://* ]]; then
        die "AGENT_RELEASE_BASE_URL phải sử dụng HTTPS"
    fi

    if [[ ! -d "$AGENT_DIR" ]]; then
        die "không tìm thấy Agent directory: $AGENT_DIR"
    fi

    if [[ ! -f "$AGENT_DIR/go.mod" ]]; then
        die "không tìm thấy file: $AGENT_DIR/go.mod"
    fi
}

load_signing_key() {
    if [[ -n "${AGENT_SIGNING_PRIVATE_KEY:-}" ]]; then
        return
    fi

    if [[ ! -t 0 ]]; then
        die "chưa đặt AGENT_SIGNING_PRIVATE_KEY"
    fi

PRIVATE_KEY="${AGENT_SIGNING_KEY:-}"

if [ -z "$PRIVATE_KEY" ]; then
    read -rsp "Nhập Ed25519 private key Base64: " PRIVATE_KEY
    echo
fi

    if [[ -z "$AGENT_SIGNING_PRIVATE_KEY" ]]; then
        die "private key không được để trống"
    fi

    export AGENT_SIGNING_PRIVATE_KEY
}

build_agent() {
    local goos="$1"
    local goarch="$2"
    local output="$3"

    local output_path="$STAGING_DIR/$output"

    echo "Building Agent ${AGENT_VERSION} for ${goos}/${goarch}"

    CGO_ENABLED=0 \
    GOOS="$goos" \
    GOARCH="$goarch" \
    go build \
        -trimpath \
        -buildvcs=false \
        -ldflags="-s -w -X main.Version=${AGENT_VERSION}" \
        -o "$output_path" \
        ./cmd/agent

    if [[ ! -s "$output_path" ]]; then
        die "binary không được tạo hoặc đang rỗng: $output_path"
    fi

    if [[ "$goos" != "windows" ]]; then
        chmod 0755 "$output_path"
    fi
}

verify_release_files() {
    local required_files=(
        "datrixops-agent-linux-amd64"
        "datrixops-agent-linux-arm64"
        "datrixops-agent-darwin-amd64"
        "datrixops-agent-darwin-arm64"
        "datrixops-agent-windows-amd64.exe"
        "manifest.json"
        "manifest.sig"
    )

    local filename

    for filename in "${required_files[@]}"; do
        if [[ ! -f "$STAGING_DIR/$filename" ]]; then
            die "release thiếu file: $filename"
        fi

        if [[ ! -s "$STAGING_DIR/$filename" ]]; then
            die "release có file rỗng: $filename"
        fi
    done

    local signature_size

    signature_size="$(
        stat -c '%s' "$STAGING_DIR/manifest.sig"
    )"

    if [[ "$signature_size" -ne 64 ]]; then
        die "manifest.sig phải có đúng 64 byte, hiện có $signature_size byte"
    fi
}

publish_release_directory() {
    local release_dir="$RELEASE_ROOT/$AGENT_VERSION"

    if [[ -e "$release_dir" ]]; then
        if [[ "${AGENT_FORCE:-0}" != "1" ]]; then
            die "release $AGENT_VERSION đã tồn tại. Dùng AGENT_FORCE=1 nếu cần ghi đè"
        fi

        BACKUP_DIR="${release_dir}.backup.$$"

        echo "Backing up existing release..."
        mv "$release_dir" "$BACKUP_DIR"
    fi

    if ! mv "$STAGING_DIR" "$release_dir"; then
        if [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]]; then
            mv "$BACKUP_DIR" "$release_dir"
            BACKUP_DIR=""
        fi

        die "không thể publish release directory"
    fi

    STAGING_DIR=""

    if [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]]; then
        rm -rf "$BACKUP_DIR"
        BACKUP_DIR=""
    fi
}

copy_latest_binaries() {
    local release_dir="$RELEASE_ROOT/$AGENT_VERSION"

    echo "Updating installer-compatible binaries in frontend/public..."

    cp -f \
        "$release_dir/datrixops-agent-linux-amd64" \
        "$PUBLIC_DIR/datrixops-agent-linux-amd64"

    cp -f \
        "$release_dir/datrixops-agent-linux-arm64" \
        "$PUBLIC_DIR/datrixops-agent-linux-arm64"

    cp -f \
        "$release_dir/datrixops-agent-darwin-amd64" \
        "$PUBLIC_DIR/datrixops-agent-darwin-amd64"

    cp -f \
        "$release_dir/datrixops-agent-darwin-arm64" \
        "$PUBLIC_DIR/datrixops-agent-darwin-arm64"

    cp -f \
        "$release_dir/datrixops-agent-windows-amd64.exe" \
        "$PUBLIC_DIR/datrixops-agent-windows-amd64.exe"

    chmod 0755 \
        "$PUBLIC_DIR/datrixops-agent-linux-amd64" \
        "$PUBLIC_DIR/datrixops-agent-linux-arm64" \
        "$PUBLIC_DIR/datrixops-agent-darwin-amd64" \
        "$PUBLIC_DIR/datrixops-agent-darwin-arm64"

    if [[ -f "$PUBLIC_DIR/install.sh" ]]; then
        chmod 0755 "$PUBLIC_DIR/install.sh"
    fi

    if [[ -f "$PUBLIC_DIR/install-mac.sh" ]]; then
        chmod 0755 "$PUBLIC_DIR/install-mac.sh"
    fi
}

main() {
    validate_configuration
    load_signing_key

    mkdir -p "$PUBLIC_DIR"
    mkdir -p "$RELEASE_ROOT"

    STAGING_DIR="$(
        mktemp -d \
            "$RELEASE_ROOT/.${AGENT_VERSION}.tmp.XXXXXX"
    )"

    cd "$AGENT_DIR"

    echo "Checking updater packages..."

    go test ./internal/update
    go test ./tools/sign-release

    echo
    echo "Building DatrixOps Agent ${AGENT_VERSION}..."

    build_agent \
        linux \
        amd64 \
        datrixops-agent-linux-amd64

    build_agent \
        linux \
        arm64 \
        datrixops-agent-linux-arm64

    build_agent \
        darwin \
        amd64 \
        datrixops-agent-darwin-amd64

    build_agent \
        darwin \
        arm64 \
        datrixops-agent-darwin-arm64

    build_agent \
        windows \
        amd64 \
        datrixops-agent-windows-amd64.exe

    echo
    echo "Creating and signing release manifest..."

    AGENT_VERSION="$AGENT_VERSION" \
    AGENT_RELEASE_DIR="$STAGING_DIR" \
    AGENT_RELEASE_BASE_URL="$AGENT_RELEASE_BASE_URL" \
    AGENT_SIGNING_PRIVATE_KEY="$AGENT_SIGNING_PRIVATE_KEY" \
        go run ./tools/sign-release

    verify_release_files
    publish_release_directory
    copy_latest_binaries

    unset AGENT_SIGNING_PRIVATE_KEY

    local release_dir="$RELEASE_ROOT/$AGENT_VERSION"

    echo
    echo "Agent release published successfully"
    echo "Version   : $AGENT_VERSION"
    echo "Directory : $release_dir"
    echo "Base URL  : $AGENT_RELEASE_BASE_URL"
    echo
    echo "Release files:"

    ls -lh "$release_dir"

    echo
    echo "SHA-256 checksums:"

    sha256sum "$release_dir"/*

    echo
    echo "Set backend AGENT_VERSION=${AGENT_VERSION} for version reporting."
}

main "$@"