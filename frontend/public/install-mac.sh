#!/usr/bin/env bash
set -Eeuo pipefail

SERVER_URL=""
ENROLLMENT_TOKEN=""
SERVICES=""
while [[ $# -gt 0 ]]; do
    case "$1" in
        --server) SERVER_URL="${2:-}"; shift 2 ;;
        --token) ENROLLMENT_TOKEN="${2:-}"; shift 2 ;;
        --services) SERVICES="${2:-}"; shift 2 ;;
        *) echo "ERROR: Unknown option: $1" >&2; exit 2 ;;
    esac
done

SERVER_URL="${SERVER_URL%/}"
if [[ "$EUID" -ne 0 ]]; then
    echo "ERROR: Run this installer as root (use sudo)." >&2
    exit 1
fi
if [[ ! "$SERVER_URL" =~ ^https://[A-Za-z0-9._:-]+$ ]] &&
   [[ ! "$SERVER_URL" =~ ^http://(localhost|127\.0\.0\.1)(:[0-9]+)?$ ]]; then
    echo "ERROR: --server must be an HTTPS origin (HTTP is allowed only for localhost)." >&2
    exit 1
fi
if [[ ! "$ENROLLMENT_TOKEN" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
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

API_URL="${SERVER_URL}/api/v1"
INSTALL_DIR="/usr/local/bin"
PLIST_FILE="/Library/LaunchDaemons/com.datrixops.agent.plist"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TEMP_DIR"' EXIT
umask 077

printf '{"token":"%s","os_family":"darwin","architecture":"%s"}' \
    "$ENROLLMENT_TOKEN" "$AGENT_ARCH" >"${TEMP_DIR}/enroll.json"
curl --fail-with-body --silent --show-error \
    --connect-timeout 10 --max-time 30 \
    --header 'Content-Type: application/json' \
    --data-binary "@${TEMP_DIR}/enroll.json" \
    --output "${TEMP_DIR}/enroll-response.json" \
    "${API_URL}/agent/enroll"
AGENT_TOKEN="$(
    sed -n 's/.*"agent_token":"\([^"]*\)".*/\1/p' "${TEMP_DIR}/enroll-response.json" | head -n 1
)"
if [[ ! "$AGENT_TOKEN" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
    echo "ERROR: Control plane returned an invalid Agent credential." >&2
    exit 1
fi

STAGED_BINARY="${TEMP_DIR}/datrixops-agent"
curl --fail --silent --show-error --location \
    --connect-timeout 10 --max-time 180 \
    --output "$STAGED_BINARY" \
    "${SERVER_URL}/datrixops-agent-darwin-${AGENT_ARCH}"
if [[ ! -s "$STAGED_BINARY" ]]; then
    echo "ERROR: Downloaded Agent binary is empty." >&2
    exit 1
fi
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
    </dict>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>/var/log/datrixops-agent.log</string>
    <key>StandardErrorPath</key><string>/var/log/datrixops-agent.error.log</string>
</dict>
</plist>
PLIST_EOF
chmod 0600 "$PLIST_FILE"

if launchctl print system/com.datrixops.agent >/dev/null 2>&1; then
    launchctl kickstart -k system/com.datrixops.agent
else
    launchctl bootstrap system "$PLIST_FILE"
fi
echo "DatrixOps Agent installed successfully."
