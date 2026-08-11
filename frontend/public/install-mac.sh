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
  curl -fsSL https://github.com/luuvandien2604/DatrixOps/releases/download/vX.Y.Z/install-mac.sh | sudo bash -s -- \
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
        --server) SERVER_URL="${2:-}"; shift 2 ;;
        --token) ENROLLMENT_TOKEN="${2:-}"; shift 2 ;;
        --agent-version) AGENT_VERSION="${2:-}"; shift 2 ;;
        --agent-artifact-base-url) AGENT_ARTIFACT_BASE_URL="${2:-}"; shift 2 ;;
        --agent-release-layout) AGENT_RELEASE_LAYOUT="${2:-}"; shift 2 ;;
        --services) SERVICES="${2:-}"; shift 2 ;;
        --allow-insecure-http) ALLOW_INSECURE_HTTP=1; shift 1 ;;
        -h|--help) usage; exit 0 ;;
        *) echo "ERROR: Unknown option: $1" >&2; usage >&2; exit 2 ;;
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
LAUNCHCTL_BIN="${DATRIXOPS_LAUNCHCTL_BIN:-launchctl}"

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
    x86_64|amd64) AGENT_ARCH="amd64" ;;
    arm64) AGENT_ARCH="arm64" ;;
    *) echo "ERROR: Unsupported macOS architecture: $(uname -m)" >&2; exit 1 ;;
esac

sha256_file() {
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | awk '{print $1}'
    else
        sha256sum "$1" | awk '{print $1}'
    fi
}

API_URL="${SERVER_URL}/api/v1"
INSTALL_DIR="${TEST_ROOT}/usr/local/bin"
PLIST_FILE="${TEST_ROOT}/Library/LaunchDaemons/com.datrixops.agent.plist"
CONFIG_DIR="${TEST_ROOT}/etc/datrixops"
TEMP_DIR="$(mktemp -d)"
BOOTSTRAP_ROLLBACK_TOKEN=""
ENROLLED=0

rollback_bootstrap() {
    if [[ "$ENROLLED" -eq 1 && -n "${BOOTSTRAP_ROLLBACK_TOKEN:-}" ]]; then
        echo "Cleaning up partial Agent installation and rolling back enrollment..." >&2
        "$LAUNCHCTL_BIN" bootout system "$PLIST_FILE" 2>/dev/null || true

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
            rm -f "$PLIST_FILE" "${INSTALL_DIR}/datrixops-agent" 2>/dev/null || true
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

# Pre-enrollment Artifact Verification
ARTIFACT_NAME="datrixops-agent-darwin-${AGENT_ARCH}"

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

if command -v stat >/dev/null 2>&1; then
    ACTUAL_SIZE="$(stat -f %z "$STAGED_BINARY" 2>/dev/null || stat -c %s "$STAGED_BINARY" 2>/dev/null || wc -c <"$STAGED_BINARY")"
else
    ACTUAL_SIZE="$(wc -c <"$STAGED_BINARY")"
fi
ACTUAL_SIZE="$(echo "$ACTUAL_SIZE" | tr -d ' ')"

if [[ "$ACTUAL_SIZE" -ne "$EXPECTED_SIZE" ]]; then
    echo "ERROR: Downloaded binary size (${ACTUAL_SIZE} bytes) does not match expected (${EXPECTED_SIZE} bytes)." >&2
    exit 1
fi

ACTUAL_SHA="$(sha256_file "$STAGED_BINARY" | tr '[:upper:]' '[:lower:]')"
EXPECTED_SHA_LOWER="$(echo "$EXPECTED_SHA" | tr '[:upper:]' '[:lower:]')"
if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA_LOWER" ]]; then
    echo "ERROR: Downloaded binary SHA-256 checksum (${ACTUAL_SHA}) does not match expected (${EXPECTED_SHA})." >&2
    exit 1
fi

echo "Pre-enrollment binary verification succeeded (SHA-256 & size match)."

# Enrollment Request
printf '{"token":"%s","os_family":"darwin","architecture":"%s"}' \
    "$ENROLLMENT_TOKEN" "$AGENT_ARCH" >"${TEMP_DIR}/enroll.json"
curl --fail-with-body --silent --show-error \
    --connect-timeout 10 --max-time 30 \
    --header 'Content-Type: application/json' \
    --data-binary "@${TEMP_DIR}/enroll.json" \
    --output "${TEMP_DIR}/enroll-response.json" \
    "${API_URL}/agent/enroll"
AGENT_TOKEN="$(
    sed -n 's/.*"agent_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${TEMP_DIR}/enroll-response.json" | head -n 1
)"
BOOTSTRAP_ROLLBACK_TOKEN="$(
    sed -n 's/.*"bootstrap_rollback_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "${TEMP_DIR}/enroll-response.json" | head -n 1
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

install -d -m 0755 "$INSTALL_DIR"
install -d -m 0755 "$(dirname "$PLIST_FILE")"
install -m 0755 "$STAGED_BINARY" "${INSTALL_DIR}/datrixops-agent"

cat >"$PLIST_FILE" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>com.datrixops.agent</string>
    <key>ProgramArguments</key>
    <array><string>${INSTALL_DIR}/datrixops-agent</string></array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>DATRIXOPS_SERVER_URL</key><string>${API_URL}</string>
        <key>DATRIXOPS_AGENT_TOKEN</key><string>${AGENT_TOKEN}</string>
        <key>DATRIXOPS_SERVICES</key><string>${SERVICES}</string>
        <key>AGENT_VERSION</key><string>${AGENT_VERSION}</string>
        <key>DATRIXOPS_AGENT_ARTIFACT_BASE_URL</key><string>${AGENT_ARTIFACT_BASE_URL}</string>
        <key>DATRIXOPS_AGENT_RELEASE_LAYOUT</key><string>${AGENT_RELEASE_LAYOUT:-github}</string>
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>/var/log/datrixops-agent.log</string>
    <key>StandardErrorPath</key><string>/var/log/datrixops-agent.error.log</string>
</dict>
</plist>
PLIST_EOF
chmod 0600 "$PLIST_FILE"

if "$LAUNCHCTL_BIN" print system/com.datrixops.agent >/dev/null 2>&1; then
    "$LAUNCHCTL_BIN" kickstart -k system/com.datrixops.agent
else
    "$LAUNCHCTL_BIN" bootstrap system "$PLIST_FILE"
fi
sleep 2

if ! "$LAUNCHCTL_BIN" print system/com.datrixops.agent >/dev/null 2>&1; then
    echo "ERROR: DatrixOps Agent service failed to start on macOS." >&2
    exit 1
fi

# Bounded Wait for Backend First-Heartbeat / Bootstrap Completion
echo "Verifying first heartbeat with control plane..."
BOOTSTRAP_CONFIRMED=0
for retry in $(seq 1 15); do
    STATUS_HTTP="$(
        curl --silent --show-error \
            --connect-timeout 5 --max-time 10 \
            --header "Authorization: Bearer ${AGENT_TOKEN}" \
            "${API_URL}/agent/bootstrap-status" || echo "000"
    )"
    if echo "$STATUS_HTTP" | grep -Eq '"bootstrap_completed"[[:space:]]*:[[:space:]]*true'; then
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
