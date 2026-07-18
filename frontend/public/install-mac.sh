#!/bin/bash
set -e

echo "================================================="
echo "🚀 DatrixOps Agent Installer (macOS)"
echo "================================================="

TOKEN=$1
SERVICES=$2
SERVER_URL="https://datrixops.vandien.space"
API_URL="${SERVER_URL}/api/v1"
INSTALL_DIR="/usr/local/bin"
PLIST_FILE="/Library/LaunchDaemons/com.datrixops.agent.plist"

if [ -z "$TOKEN" ]; then
    echo "❌ Error: Agent token is required."
    echo "Usage: curl -sL ${SERVER_URL}/install-mac.sh | sudo bash -s -- <AGENT_TOKEN>"
    exit 1
fi

if [ -n "$SERVICES" ] && ! printf '%s' "$SERVICES" | grep -Eq '^[A-Za-z0-9._@,$ -]+$'; then
    echo "❌ Error: Services contains unsupported characters."
    exit 1
fi

if [ "$EUID" -ne 0 ]; then
    echo "❌ Error: Please run as root (use sudo). Try: curl -sL ${SERVER_URL}/install-mac.sh | sudo bash -s -- <TOKEN>"
    exit 1
fi

ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    BINARY_URL="${SERVER_URL}/datrixops-agent-darwin-amd64"
elif [ "$ARCH" = "arm64" ]; then
    BINARY_URL="${SERVER_URL}/datrixops-agent-darwin-arm64"
else
    echo "❌ Error: Unsupported architecture: $ARCH"
    exit 1
fi

mkdir -p "$INSTALL_DIR"
echo "📥 Downloading DatrixOps Agent from $BINARY_URL..."
UPDATE_FILE="$INSTALL_DIR/.datrixops-agent.update"
curl --fail --silent --show-error --location -o "$UPDATE_FILE" "$BINARY_URL"
if [ ! -s "$UPDATE_FILE" ]; then
    echo "❌ Error: Downloaded agent binary is empty."
    exit 1
fi
chmod +x "$UPDATE_FILE"
mv -f "$UPDATE_FILE" "$INSTALL_DIR/datrixops-agent"

echo "⚙️ Creating launchd service..."
cat << PLIST_EOF > $PLIST_FILE
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.datrixops.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/datrixops-agent</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>DATRIXOPS_SERVER_URL</key>
        <string>$API_URL</string>
        <key>DATRIXOPS_AGENT_TOKEN</key>
        <string>$TOKEN</string>
        <key>DATRIXOPS_SERVICES</key>
        <string>$SERVICES</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/datrixops-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/datrixops-agent.error.log</string>
</dict>
</plist>
PLIST_EOF

echo "🔄 Starting DatrixOps Agent service..."
if launchctl print system/com.datrixops.agent >/dev/null 2>&1; then
    # Keep kickstart as the final command because an update can run as a child
    # of the existing launchd job.
    launchctl kickstart -k system/com.datrixops.agent
else
    launchctl bootstrap system $PLIST_FILE
fi

echo "✅ DatrixOps Agent installed successfully!"
echo "📡 The agent is now running in the background."
echo "   To check logs, run: tail -f /var/log/datrixops-agent.log"
echo "================================================="
