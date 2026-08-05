#!/bin/sh
set -eu

# Token-free in-place updater for an installed Linux or macOS agent.
# Existing service definitions and environment variables remain untouched.

BASE_URL="${DATRIXOPS_SERVER_URL:-${1:-}}"
BINARY_DIR="/usr/local/bin"
BINARY_PATH="${BINARY_DIR}/datrixops-agent"
STAGED_PATH="${BINARY_DIR}/.datrixops-agent.update.tmp"
BACKUP_PATH="${BINARY_DIR}/datrixops-agent.bak"

if [ "$(id -u)" -ne 0 ]; then
    echo "Run this updater with sudo." >&2
    exit 1
fi

if [ -z "$BASE_URL" ] && [ -r /etc/datrixops/agent.env ]; then
    BASE_URL="$(sed -n 's/^DATRIXOPS_SERVER_URL=//p' /etc/datrixops/agent.env | head -n 1)"
fi
if [ -z "$BASE_URL" ] && [ -x /usr/libexec/PlistBuddy ] &&
    [ -r /Library/LaunchDaemons/com.datrixops.agent.plist ]; then
    BASE_URL="$(/usr/libexec/PlistBuddy -c 'Print :EnvironmentVariables:DATRIXOPS_SERVER_URL' /Library/LaunchDaemons/com.datrixops.agent.plist 2>/dev/null || true)"
fi
BASE_URL="${BASE_URL%/api/v1}"
BASE_URL="${BASE_URL%/}"
case "$BASE_URL" in
    https://*) ;;
    http://localhost*|http://127.0.0.1*) ;;
    *)
        echo "Unable to determine a secure DatrixOps Server URL. Pass it as the first argument." >&2
        exit 1
        ;;
esac

os="$(uname -s)"
arch="$(uname -m)"
case "$os/$arch" in
    Linux/x86_64|Linux/amd64) artifact="datrixops-agent-linux-amd64" ;;
    Linux/aarch64|Linux/arm64) artifact="datrixops-agent-linux-arm64" ;;
    Darwin/x86_64|Darwin/amd64) artifact="datrixops-agent-darwin-amd64" ;;
    Darwin/arm64|Darwin/aarch64) artifact="datrixops-agent-darwin-arm64" ;;
    *)
        echo "Unsupported platform: $os/$arch" >&2
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

cleanup() {
    rm -f "$STAGED_PATH"
}
trap cleanup EXIT HUP INT TERM

RELEASE_BASE_URL="${AGENT_RELEASE_BASE_URL:-${BASE_URL}}"

echo "Fetching release metadata for $os/$arch..."
SHA_TMP="${BINARY_DIR}/.artifact.sha256.tmp"
SIZE_TMP="${BINARY_DIR}/.artifact.size.tmp"

curl --fail --location --silent --show-error \
    "$RELEASE_BASE_URL/$artifact.sha256" --output "$SHA_TMP"
curl --fail --location --silent --show-error \
    "$RELEASE_BASE_URL/$artifact.size" --output "$SIZE_TMP"

EXPECTED_SHA="$(tr -d '\r\n[:space:]' <"$SHA_TMP")"
EXPECTED_SIZE="$(tr -d '\r\n[:space:]' <"$SIZE_TMP")"
rm -f "$SHA_TMP" "$SIZE_TMP"

if [ -z "$EXPECTED_SHA" ] || [ -z "$EXPECTED_SIZE" ]; then
    echo "Release metadata is invalid." >&2
    exit 1
fi

echo "Downloading the DatrixOps Agent update..."
curl --fail --location --silent --show-error \
    "$RELEASE_BASE_URL/$artifact" --output "$STAGED_PATH"

if [ ! -s "$STAGED_PATH" ]; then
    echo "Downloaded agent binary is empty." >&2
    exit 1
fi

if command -v stat >/dev/null 2>&1; then
    ACTUAL_SIZE="$(stat -f %z "$STAGED_PATH" 2>/dev/null || stat -c %s "$STAGED_PATH" 2>/dev/null || wc -c <"$STAGED_PATH")"
else
    ACTUAL_SIZE="$(wc -c <"$STAGED_PATH")"
fi
ACTUAL_SIZE="$(echo "$ACTUAL_SIZE" | tr -d ' ')"

if [ "$ACTUAL_SIZE" -ne "$EXPECTED_SIZE" ]; then
    echo "Downloaded binary size ($ACTUAL_SIZE bytes) does not match expected ($EXPECTED_SIZE bytes)." >&2
    exit 1
fi

ACTUAL_SHA="$(sha256_file "$STAGED_PATH")"
if [ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]; then
    echo "Downloaded binary SHA-256 ($ACTUAL_SHA) does not match expected ($EXPECTED_SHA)." >&2
    exit 1
fi

chmod 0755 "$STAGED_PATH"

# Backup current binary
if [ -f "$BINARY_PATH" ]; then
    cp -f "$BINARY_PATH" "$BACKUP_PATH"
fi

# Atomic replacement (same filesystem)
mv -f "$STAGED_PATH" "$BINARY_PATH"
trap - EXIT HUP INT TERM

restart_service() {
    if [ "$os" = "Linux" ]; then
        systemctl restart datrixops-agent
    else
        launchctl kickstart -k system/com.datrixops.agent
    fi
}

check_service_health() {
    if [ "$os" = "Linux" ]; then
        systemctl is-active --quiet datrixops-agent
    else
        launchctl print system/com.datrixops.agent >/dev/null 2>&1
    fi
}

restart_service
sleep 2

if ! check_service_health; then
    echo "ERROR: Updated agent failed health check. Restoring previous binary..." >&2
    if [ -f "$BACKUP_PATH" ]; then
        mv -f "$BACKUP_PATH" "$BINARY_PATH"
        restart_service
    fi
    exit 1
fi

rm -f "$BACKUP_PATH"
echo "DatrixOps Agent updated and restarted successfully."
