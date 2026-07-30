#!/bin/sh
set -eu

# Token-free in-place updater for an installed Linux or macOS agent.
# Existing service definitions and environment variables remain untouched.

BASE_URL="${DATRIXOPS_SERVER_URL:-${1:-}}"
BINARY_PATH="/usr/local/bin/datrixops-agent"
STAGED_PATH="/usr/local/bin/.datrixops-agent.update"

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

cleanup() {
    rm -f "$STAGED_PATH"
}
trap cleanup EXIT HUP INT TERM

echo "Downloading the current DatrixOps Agent release for $os/$arch..."
curl --fail --location --silent --show-error \
    "$BASE_URL/$artifact" \
    --output "$STAGED_PATH"

if [ ! -s "$STAGED_PATH" ]; then
    echo "Downloaded agent binary is empty." >&2
    exit 1
fi

magic="$(od -An -tx1 -N4 "$STAGED_PATH" | tr -d ' \n')"
case "$os" in
    Linux)
        [ "$magic" = "7f454c46" ] || {
            echo "Downloaded artifact is not a Linux ELF binary." >&2
            exit 1
        }
        ;;
    Darwin)
        case "$magic" in
            feedface|feedfacf|cefaedfe|cffaedfe|cafebabe) ;;
            *)
                echo "Downloaded artifact is not a macOS Mach-O binary." >&2
                exit 1
                ;;
        esac
        ;;
esac

chmod 0755 "$STAGED_PATH"
mv -f "$STAGED_PATH" "$BINARY_PATH"
trap - EXIT HUP INT TERM

if [ "$os" = "Linux" ]; then
    systemctl restart datrixops-agent
    systemctl is-active --quiet datrixops-agent
else
    launchctl kickstart -k system/com.datrixops.agent
    launchctl print system/com.datrixops.agent >/dev/null
fi

echo "DatrixOps Agent updated and restarted successfully."
