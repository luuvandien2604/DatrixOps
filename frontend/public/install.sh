#!/usr/bin/env bash
set -Eeuo pipefail

SERVER_URL=""
ENROLLMENT_TOKEN=""
SERVICES=""
AGENT_VERSION=""
AGENT_ARTIFACT_BASE_URL=""
AGENT_RELEASE_LAYOUT=""
ALLOW_INSECURE_HTTP=0

usage() {
    cat <<'USAGE'
Usage:
  curl -fsSL https://github.com/luuvandien2604/DatrixOps/releases/download/vX.Y.Z/install.sh | sudo bash -s -- \
    --server https://monitor.example.com \
    --token ENROLLMENT_TOKEN \
    --agent-version X.Y.Z \
    --agent-artifact-base-url https://github.com/luuvandien2604/DatrixOps/releases/download/vX.Y.Z \
    [--agent-release-layout "github|default|legacy_direct"] \
    [--services "nginx,postgresql,docker"] \
    [--allow-insecure-http]
USAGE
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --server)
            SERVER_URL="${2:-}"
            shift 2
            ;;
        --token)
            ENROLLMENT_TOKEN="${2:-}"
            shift 2
            ;;
        --agent-version)
            AGENT_VERSION="${2:-}"
            shift 2
            ;;
        --agent-artifact-base-url)
            AGENT_ARTIFACT_BASE_URL="${2:-}"
            shift 2
            ;;
        --agent-release-layout)
            AGENT_RELEASE_LAYOUT="${2:-}"
            shift 2
            ;;
        --services)
            SERVICES="${2:-}"
            shift 2
            ;;
        --allow-insecure-http)
            ALLOW_INSECURE_HTTP=1
            shift 1
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "ERROR: Unknown option: $1" >&2
            usage >&2
            exit 2
            ;;
    esac
done

if [[ -z "$SERVER_URL" || -z "$ENROLLMENT_TOKEN" || -z "$AGENT_VERSION" || -z "$AGENT_ARTIFACT_BASE_URL" ]]; then
    echo "ERROR: --server, --token, --agent-version, and --agent-artifact-base-url are required." >&2
    usage >&2
    exit 1
fi

SERVER_URL="${SERVER_URL%/}"
AGENT_ARTIFACT_BASE_URL="${AGENT_ARTIFACT_BASE_URL%/}"
AGENT_RELEASE_LAYOUT="${AGENT_RELEASE_LAYOUT:-github}"

if [[ "$AGENT_RELEASE_LAYOUT" != "github" && "$AGENT_RELEASE_LAYOUT" != "default" && "$AGENT_RELEASE_LAYOUT" != "legacy_direct" ]]; then
    echo "ERROR: Invalid --agent-release-layout '$AGENT_RELEASE_LAYOUT'. Must be 'github', 'default', or 'legacy_direct'." >&2
    exit 1
fi

TEST_MODE="${DATRIXOPS_INSTALLER_TEST_MODE:-0}"
TEST_ROOT="${DATRIXOPS_INSTALLER_ROOT:-}"
SYSTEMCTL_BIN="${DATRIXOPS_SYSTEMCTL_BIN:-systemctl}"

if [[ "$TEST_MODE" -ne 1 && "$EUID" -ne 0 ]]; then
    echo "ERROR: Run this installer as root (use sudo)." >&2
    exit 1
fi

if [[ ! "$SERVER_URL" =~ ^https?://[A-Za-z0-9._:-]+$ ]]; then
    echo "ERROR: --server must be a valid HTTP or HTTPS URL." >&2
    exit 1
fi

if [[ "$TEST_MODE" -ne 1 && ! "$AGENT_ARTIFACT_BASE_URL" =~ ^https:// ]]; then
    echo "ERROR: --agent-artifact-base-url must be an HTTPS URL." >&2
    exit 1
fi

if [[ "$SERVER_URL" =~ ^http:// ]]; then
    host_part="$(echo "$SERVER_URL" | sed -e 's#^http://##' -e 's#/.*##' -e 's#:[0-9]*##')"
    if [[ "$host_part" != "localhost" && "$host_part" != "127.0.0.1" && "$ALLOW_INSECURE_HTTP" -ne 1 ]]; then
        echo "ERROR: Insecure HTTP control-plane origin requires --allow-insecure-http flag." >&2
        echo "HTTP control planes should only be used on trusted private networks (LAN/VPN)." >&2
        exit 1
    fi
    if [[ "$ALLOW_INSECURE_HTTP" -eq 1 ]]; then
        echo "WARNING: HTTP control plane transport is unencrypted. Credentials should only be sent over trusted networks." >&2
    fi
fi

if ! printf '%s' "$ENROLLMENT_TOKEN" | grep -Eq '^[A-Za-z0-9_-]{32,255}$'; then
    echo "ERROR: --token is missing or invalid." >&2
    exit 1
fi
if [[ -n "$SERVICES" ]] && ! printf '%s' "$SERVICES" | grep -Eq '^[A-Za-z0-9._@,$ -]+$'; then
    echo "ERROR: --services contains unsupported characters." >&2
    exit 1
fi

case "$(uname -m)" in
    x86_64|amd64)
        AGENT_ARCH="amd64"
        ;;
    aarch64|arm64)
        AGENT_ARCH="arm64"
        ;;
    *)
        echo "ERROR: Unsupported Linux architecture: $(uname -m)" >&2
        exit 1
        ;;
esac

sha256_file() {
    if command -v sha256sum >/dev/null 2>&1; then
        sha256sum "$1" | awk '{print $1}'
    else
        shasum -a 256 "$1" | awk '{print $1}'
    fi
}

API_URL="${SERVER_URL}/api/v1"
INSTALL_DIR="${TEST_ROOT}/usr/local/bin"
CONFIG_DIR="${TEST_ROOT}/etc/datrixops"
ENV_FILE="${CONFIG_DIR}/agent.env"
SERVICE_FILE="${TEST_ROOT}/etc/systemd/system/datrixops-agent.service"
TEMP_DIR="$(mktemp -d)"
BOOTSTRAP_ROLLBACK_TOKEN=""
ENROLLED=0

rollback_bootstrap() {
    if [[ "$ENROLLED" -eq 1 && -n "${BOOTSTRAP_ROLLBACK_TOKEN:-}" ]]; then
        echo "Cleaning up partial Agent installation and rolling back enrollment..." >&2
        "$SYSTEMCTL_BIN" stop datrixops-agent 2>/dev/null || true
        "$SYSTEMCTL_BIN" disable datrixops-agent 2>/dev/null || true

        HTTP_ROLLBACK="$(
            curl --silent --show-error \
                --connect-timeout 5 --max-time 15 \
                --output "${TEMP_DIR}/rollback-response" \
                --write-out '%{http_code}' \
                --header 'Content-Type: application/json' \
                --data "{\"rollback_token\":\"${BOOTSTRAP_ROLLBACK_TOKEN}\"}" \
                "${API_URL}/agent/enroll/rollback" 2>/dev/null || echo "000"
        )"
        if [[ "$HTTP_ROLLBACK" == 2* ]]; then
            rm -f "$SERVICE_FILE" "$ENV_FILE" "${INSTALL_DIR}/datrixops-agent" 2>/dev/null || true
            "$SYSTEMCTL_BIN" daemon-reload 2>/dev/null || true
            echo "Enrollment token successfully released." >&2
        else
            mkdir -p "$CONFIG_DIR"
            chmod 0700 "$CONFIG_DIR" 2>/dev/null || true
            RECOVERY_FILE="${CONFIG_DIR}/bootstrap-recovery.json"
            {
                printf '{\n'
                printf '  "rollback_token": "%s",\n' "$BOOTSTRAP_ROLLBACK_TOKEN"
                printf '  "server_url": "%s"\n' "$SERVER_URL"
                printf '}\n'
            } >"$RECOVERY_FILE"
            chmod 0600 "$RECOVERY_FILE"
            echo "WARNING: Rollback API call returned HTTP ${HTTP_ROLLBACK}." >&2
            echo "Recovery state saved to ${RECOVERY_FILE} (mode 0600). Operator may retry rollback before token expiry." >&2
        fi
    fi
}
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        rollback_bootstrap
    fi
    rm -rf -- "$TEMP_DIR"
}
trap cleanup EXIT
umask 077

if [[ ! "$AGENT_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo "ERROR: --agent-version must be a valid semver version (X.Y.Z)." >&2
    exit 1
fi

# Step 1: Pre-enrollment Artifact Download & Verification
ARTIFACT_NAME="datrixops-agent-linux-${AGENT_ARCH}"

echo "Downloading release metadata..."
VERSION_FILE="${TEMP_DIR}/agent-release.version"
SHA_FILE="${TEMP_DIR}/artifact.sha256"
SIZE_FILE="${TEMP_DIR}/artifact.size"
STAGED_BINARY="${TEMP_DIR}/datrixops-agent"

curl --fail --silent --show-error --location \
    --connect-timeout 10 --max-time 30 \
    --output "$VERSION_FILE" "${AGENT_ARTIFACT_BASE_URL}/agent-release.version" || {
    echo "ERROR: Failed to download agent-release.version metadata." >&2
    exit 1
}

REMOTE_VERSION="$(tr -d '\r\n[:space:]' <"$VERSION_FILE")"
if [[ "$REMOTE_VERSION" != "$AGENT_VERSION" ]]; then
    echo "ERROR: Agent release version mismatch: remote release is $REMOTE_VERSION, requested $AGENT_VERSION." >&2
    exit 1
fi

curl --fail --silent --show-error --location \
    --connect-timeout 10 --max-time 30 \
    --output "$SHA_FILE" "${AGENT_ARTIFACT_BASE_URL}/${ARTIFACT_NAME}.sha256" || {
    echo "ERROR: Failed to download release SHA-256 metadata." >&2
    exit 1
}
curl --fail --silent --show-error --location \
    --connect-timeout 10 --max-time 30 \
    --output "$SIZE_FILE" "${AGENT_ARTIFACT_BASE_URL}/${ARTIFACT_NAME}.size" || {
    echo "ERROR: Failed to download release size metadata." >&2
    exit 1
}

EXPECTED_SHA="$(tr -d '\r\n[:space:]' <"$SHA_FILE")"
EXPECTED_SIZE="$(tr -d '\r\n[:space:]' <"$SIZE_FILE")"

if [[ ! "$EXPECTED_SHA" =~ ^[a-fA-F0-9]{64}$ ]]; then
    echo "ERROR: Release SHA-256 metadata format is invalid." >&2
    exit 1
fi
if [[ ! "$EXPECTED_SIZE" =~ ^[0-9]+$ ]] || [[ "$EXPECTED_SIZE" -le 0 ]]; then
    echo "ERROR: Release size metadata format is invalid." >&2
    exit 1
fi

echo "Downloading DatrixOps Agent binary..."
curl --fail --silent --show-error --location \
    --connect-timeout 10 --max-time 180 \
    --output "$STAGED_BINARY" "${AGENT_ARTIFACT_BASE_URL}/${ARTIFACT_NAME}" || {
    echo "ERROR: Failed to download Agent binary." >&2
    exit 1
}

ACTUAL_SIZE="$(wc -c <"$STAGED_BINARY" | tr -d ' ')"
if [[ "$ACTUAL_SIZE" -ne "$EXPECTED_SIZE" ]]; then
    echo "ERROR: Downloaded binary size (${ACTUAL_SIZE} bytes) does not match expected size (${EXPECTED_SIZE} bytes)." >&2
    exit 1
fi

ACTUAL_SHA="$(sha256_file "$STAGED_BINARY" | tr '[:upper:]' '[:lower:]')"
EXPECTED_SHA_LOWER="$(echo "$EXPECTED_SHA" | tr '[:upper:]' '[:lower:]')"
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA_LOWER" ]]; then
    echo "ERROR: Downloaded binary SHA-256 checksum (${ACTUAL_SHA}) does not match expected (${EXPECTED_SHA})." >&2
    exit 1
fi

if [[ "$(od -An -tx1 -N4 "$STAGED_BINARY" | tr -d ' \n')" != "7f454c46" ]]; then
    echo "ERROR: Downloaded file is not a valid Linux ELF binary." >&2
    exit 1
fi

echo "Pre-enrollment binary verification succeeded (SHA-256 & size match)."

# Step 2: Call Enrollment API
ENROLL_BODY="${TEMP_DIR}/enroll.json"
ENROLL_RESPONSE="${TEMP_DIR}/enroll-response.json"
printf '{"token":"%s","os_family":"linux","architecture":"%s"}' \
    "$ENROLLMENT_TOKEN" "$AGENT_ARCH" >"$ENROLL_BODY"

echo "Enrolling this machine with DatrixOps..."
HTTP_STATUS="$(
    curl --fail-with-body --silent --show-error \
        --connect-timeout 10 --max-time 30 \
        --output "$ENROLL_RESPONSE" \
        --write-out '%{http_code}' \
        --header 'Content-Type: application/json' \
        --data-binary "@${ENROLL_BODY}" \
        "${API_URL}/agent/enroll"
)" || {
    echo "ERROR: Agent enrollment request failed." >&2
    exit 1
}
if [[ "$HTTP_STATUS" != "201" ]]; then
    echo "ERROR: Agent enrollment returned HTTP ${HTTP_STATUS}." >&2
    exit 1
fi

AGENT_TOKEN="$(
    sed -n 's/.*"agent_token":"\([^"]*\)".*/\1/p' "$ENROLL_RESPONSE" | head -n 1
)"
BOOTSTRAP_ROLLBACK_TOKEN="$(
    sed -n 's/.*"bootstrap_rollback_token":"\([^"]*\)".*/\1/p' "$ENROLL_RESPONSE" | head -n 1
)"
if ! printf '%s' "$AGENT_TOKEN" | grep -Eq '^[A-Za-z0-9_-]{32,255}$'; then
    echo "ERROR: Control plane returned an invalid Agent credential." >&2
    exit 1
fi
if ! printf '%s' "$BOOTSTRAP_ROLLBACK_TOKEN" | grep -Eq '^[A-Za-z0-9_-]{32,255}$'; then
    echo "ERROR: Control plane returned an invalid bootstrap rollback credential." >&2
    exit 1
fi
ENROLLED=1

# Step 3: Install & Start Service
install -d -m 0700 "$CONFIG_DIR"
install -d -m 0755 "$INSTALL_DIR"
install -d -m 0755 "$(dirname "$SERVICE_FILE")"

{
    printf 'DATRIXOPS_SERVER_URL=%s\n' "$API_URL"
    printf 'DATRIXOPS_AGENT_TOKEN=%s\n' "$AGENT_TOKEN"
    printf 'DATRIXOPS_SERVICES="%s"\n' "$SERVICES"
    printf 'AGENT_VERSION=%s\n' "$AGENT_VERSION"
    printf 'DATRIXOPS_AGENT_ARTIFACT_BASE_URL=%s\n' "$AGENT_ARTIFACT_BASE_URL"
    printf 'DATRIXOPS_AGENT_RELEASE_LAYOUT=%s\n' "${AGENT_RELEASE_LAYOUT:-github}"
} >"$ENV_FILE"
chmod 0600 "$ENV_FILE"

install -m 0755 "$STAGED_BINARY" "${INSTALL_DIR}/datrixops-agent"
cat >"$SERVICE_FILE" <<SERVICE_EOF
[Unit]
Description=DatrixOps Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=${ENV_FILE}
ExecStart=${INSTALL_DIR}/datrixops-agent
Restart=always
RestartSec=10
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE_EOF
chmod 0644 "$SERVICE_FILE"

"$SYSTEMCTL_BIN" daemon-reload
"$SYSTEMCTL_BIN" enable --now datrixops-agent
sleep 2

if ! "$SYSTEMCTL_BIN" is-active --quiet datrixops-agent; then
    echo "ERROR: DatrixOps Agent service failed to start." >&2
    exit 1
fi

# Step 4: Bounded Wait for Backend First-Heartbeat / Bootstrap Completion
echo "Verifying first heartbeat with control plane..."
BOOTSTRAP_CONFIRMED=0
for retry in $(seq 1 15); do
    STATUS_HTTP="$(
        curl --silent --show-error \
            --connect-timeout 5 --max-time 10 \
            --header "Authorization: Bearer ${AGENT_TOKEN}" \
            "${API_URL}/agent/bootstrap-status" || echo "000"
    )"
    if echo "$STATUS_HTTP" | grep -q '"bootstrap_completed":true'; then
        BOOTSTRAP_CONFIRMED=1
        break
    fi
    sleep 1
done

if [[ "$BOOTSTRAP_CONFIRMED" -ne 1 ]]; then
    echo "ERROR: Control plane did not confirm first heartbeat within timeout." >&2
    exit 1
fi

echo "DatrixOps Agent installed and verified successfully."
