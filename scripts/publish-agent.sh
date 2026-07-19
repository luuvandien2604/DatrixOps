#!/usr/bin/env bash

set -Eeuo pipefail

# DatrixOps Agent release publisher
#
# Usage:
#   ./scripts/publish-agent.sh 1.6.0
#
# Optional:
#   AGENT_FORCE=1 ./scripts/publish-agent.sh 1.6.0
#
# Configuration is loaded from:
#   <project-root>/.env.release
#
# Supported signing-key configuration:
#
#   AGENT_SIGNING_PRIVATE_KEY=<base64-key>
#
# or, preferably:
#
#   AGENT_SIGNING_PRIVATE_KEY_FILE=/root/.datrixops/agent-signing-key.base64
#
# Installer scripts remain managed directly in frontend/public.
# Signed releases are stored under:
#
#   frontend/public/releases/<version>/

PROJECT_ROOT="$(
    cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1
    pwd
)"

ENV_FILE="$PROJECT_ROOT/.env.release"

AGENT_DIR="$PROJECT_ROOT/agent"
PUBLIC_DIR="$PROJECT_ROOT/frontend/public"
RELEASE_ROOT="$PUBLIC_DIR/releases"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.prod.yml"
BACKEND_ENV_FILE="$PROJECT_ROOT/.env"

# Đặt AUTO_UPDATE_BACKEND=0 nếu chỉ muốn publish mà không restart backend.
AUTO_UPDATE_BACKEND="${AUTO_UPDATE_BACKEND:-1}"
MIN_SELF_UPDATING_VERSION="1.3.0"

STAGING_DIR=""
BACKUP_DIR=""

die() {
    echo "ERROR: $*" >&2
    exit 1
}

info() {
    echo "INFO: $*"
}

cleanup() {
    unset AGENT_SIGNING_PRIVATE_KEY || true

    if [[ -n "${STAGING_DIR:-}" && -d "$STAGING_DIR" ]]; then
        rm -rf -- "$STAGING_DIR"
    fi

    if [[ -n "${BACKUP_DIR:-}" && -d "$BACKUP_DIR" ]]; then
        rm -rf -- "$BACKUP_DIR"
    fi
}

trap cleanup EXIT
trap 'die "script failed at line $LINENO"' ERR

load_release_environment() {
    if [[ ! -f "$ENV_FILE" ]]; then
        return
    fi

    info "Loading release configuration from $ENV_FILE"

    # shellcheck disable=SC1090
    set -a
    source "$ENV_FILE"
    set +a
}

read_arguments() {
    if [[ $# -gt 1 ]]; then
        die "cách dùng: $0 <version>"
    fi

    if [[ $# -eq 1 ]]; then
        AGENT_VERSION="$1"
    else
        AGENT_VERSION="${AGENT_VERSION:-}"
    fi

    AGENT_RELEASE_BASE_URL="${AGENT_RELEASE_BASE_URL:-}"
    AGENT_SIGNING_PRIVATE_KEY="${AGENT_SIGNING_PRIVATE_KEY:-}"
    AGENT_SIGNING_PRIVATE_KEY_FILE="${AGENT_SIGNING_PRIVATE_KEY_FILE:-}"
}

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

validate_required_commands() {
    local required_commands=(
        go
        mktemp
        sha256sum
        stat
    )

    local command_name

    for command_name in "${required_commands[@]}"; do
        if ! command -v "$command_name" >/dev/null 2>&1; then
            die "không tìm thấy command bắt buộc: $command_name"
        fi
    done
}

validate_configuration() {
    if [[ -z "$AGENT_VERSION" ]]; then
        die "chưa chỉ định version. Ví dụ: ./scripts/publish-agent.sh 1.6.0"
    fi

    if ! [[ "$AGENT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$ ]]; then
        die "version không hợp lệ: '$AGENT_VERSION'. Ví dụ: 1.6.0 hoặc 1.6.0-beta.1"
    fi

    if ! version_at_least \
        "$AGENT_VERSION" \
        "$MIN_SELF_UPDATING_VERSION"; then

        die "Agent $MIN_SELF_UPDATING_VERSION là phiên bản tối thiểu có hardened self-updater"
    fi

    if [[ -z "$AGENT_RELEASE_BASE_URL" ]]; then
        die "chưa đặt AGENT_RELEASE_BASE_URL trong $ENV_FILE"
    fi

    if [[ "$AGENT_RELEASE_BASE_URL" != https://* ]]; then
        die "AGENT_RELEASE_BASE_URL phải sử dụng HTTPS"
    fi

    # Tránh URL trong manifest có dấu // không cần thiết.
    AGENT_RELEASE_BASE_URL="${AGENT_RELEASE_BASE_URL%/}"

    if [[ ! -d "$AGENT_DIR" ]]; then
        die "không tìm thấy Agent directory: $AGENT_DIR"
    fi

    if [[ ! -f "$AGENT_DIR/go.mod" ]]; then
        die "không tìm thấy file: $AGENT_DIR/go.mod"
    fi

    if [[ ! -d "$AGENT_DIR/cmd/agent" ]]; then
        die "không tìm thấy Agent entry point: $AGENT_DIR/cmd/agent"
    fi

    if [[ ! -d "$AGENT_DIR/tools/sign-release" ]]; then
        die "không tìm thấy release signing tool: $AGENT_DIR/tools/sign-release"
    fi
}

load_signing_key_from_file() {
    local key_file="$1"

    if [[ ! -f "$key_file" ]]; then
        die "không tìm thấy signing key file: $key_file"
    fi

    if [[ ! -r "$key_file" ]]; then
        die "không thể đọc signing key file: $key_file"
    fi

    AGENT_SIGNING_PRIVATE_KEY="$(
        tr -d '\r\n[:space:]' <"$key_file"
    )"
}

load_signing_key() {
    if [[ -n "${AGENT_SIGNING_PRIVATE_KEY:-}" ]]; then
        :
    elif [[ -n "${AGENT_SIGNING_PRIVATE_KEY_FILE:-}" ]]; then
        load_signing_key_from_file "$AGENT_SIGNING_PRIVATE_KEY_FILE"
    elif [[ -t 0 ]]; then
        read -rsp "Nhập Ed25519 private key Base64: " \
            AGENT_SIGNING_PRIVATE_KEY
        echo
    else
        die "chưa cấu hình AGENT_SIGNING_PRIVATE_KEY hoặc AGENT_SIGNING_PRIVATE_KEY_FILE"
    fi

    AGENT_SIGNING_PRIVATE_KEY="$(
        printf '%s' "$AGENT_SIGNING_PRIVATE_KEY" |
            tr -d '\r\n[:space:]'
    )"

    if [[ -z "$AGENT_SIGNING_PRIVATE_KEY" ]]; then
        die "private key không được để trống"
    fi

    # Kiểm tra sơ bộ định dạng Base64.
    # Việc xác minh đúng key Ed25519 vẫn do sign-release đảm nhiệm.
    if ! [[ "$AGENT_SIGNING_PRIVATE_KEY" =~ ^[A-Za-z0-9+/]+={0,2}$ ]]; then
        die "private key không có định dạng Base64 hợp lệ"
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
        mv -- "$release_dir" "$BACKUP_DIR"
    fi

    if ! mv -- "$STAGING_DIR" "$release_dir"; then
        if [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]]; then
            mv -- "$BACKUP_DIR" "$release_dir"
            BACKUP_DIR=""
        fi

        die "không thể publish release directory"
    fi

    STAGING_DIR=""

    if [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]]; then
        rm -rf -- "$BACKUP_DIR"
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

print_release_summary() {
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
    if [[ "$AUTO_UPDATE_BACKEND" == "1" ]]; then
        echo "Backend   : AGENT_VERSION=${AGENT_VERSION}"
    else
        echo "Backend   : not updated (AUTO_UPDATE_BACKEND=$AUTO_UPDATE_BACKEND)"
    fi
}

set_env_value() {
    local env_file="$1"
    local key="$2"
    local value="$3"
    local temp_file

    touch "$env_file"
    chmod 600 "$env_file"

    temp_file="$(mktemp "${env_file}.tmp.XXXXXX")"

    awk \
        -v key="$key" \
        -v value="$value" '
        BEGIN {
            updated = 0
        }

        $0 ~ "^[[:space:]]*" key "=" {
            print key "=" value
            updated = 1
            next
        }

        {
            print
        }

        END {
            if (!updated) {
                print key "=" value
            }
        }
    ' "$env_file" >"$temp_file"

    chmod 600 "$temp_file"
    mv -- "$temp_file" "$env_file"
}

update_backend_agent_version() {
    if [[ "$AUTO_UPDATE_BACKEND" != "1" ]]; then
        echo "Skipping backend version update because AUTO_UPDATE_BACKEND=$AUTO_UPDATE_BACKEND"
        return
    fi

    if [[ ! -f "$COMPOSE_FILE" ]]; then
        die "không tìm thấy Compose file: $COMPOSE_FILE"
    fi

    if ! command -v docker >/dev/null 2>&1; then
        die "không tìm thấy docker command"
    fi

    echo
    echo "Updating backend AGENT_VERSION to ${AGENT_VERSION}..."

    set_env_value \
        "$BACKEND_ENV_FILE" \
        "AGENT_VERSION" \
        "$AGENT_VERSION"

    (
        cd "$PROJECT_ROOT"

        docker compose \
            --env-file "$BACKEND_ENV_FILE" \
            -f "$COMPOSE_FILE" \
            up -d \
            --force-recreate \
            backend
    )

    local backend_version

    backend_version="$(
        cd "$PROJECT_ROOT"

        docker compose \
            --env-file "$BACKEND_ENV_FILE" \
            -f "$COMPOSE_FILE" \
            exec -T backend \
            sh -c 'printf "%s" "$AGENT_VERSION"'
    )"

    if [[ "$backend_version" != "$AGENT_VERSION" ]]; then
        die "backend đang dùng AGENT_VERSION='$backend_version', mong đợi '$AGENT_VERSION'"
    fi

    echo "Backend now reports AGENT_VERSION=${backend_version}"
}

main() {
    load_release_environment
    read_arguments "$@"

    validate_required_commands
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
    update_backend_agent_version

    unset AGENT_SIGNING_PRIVATE_KEY

    print_release_summary
}

main "$@"