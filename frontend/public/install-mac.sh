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

echo "🛑 Stopping existing service (if any)..."
launchctl unload $PLIST_FILE 2>/dev/null || true
pkill -f datrixops-agent 2>/dev/null || true

mkdir -p "$INSTALL_DIR"
echo "📥 Downloading DatrixOps Agent from $BINARY_URL..."
curl -sL -o "$INSTALL_DIR/datrixops-agent" "$BINARY_URL"
chmod +x "$INSTALL_DIR/datrixops-agent"

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
launchctl unload $PLIST_FILE 2>/dev/null || true
launchctl load -w $PLIST_FILE

echo "✅ DatrixOps Agent installed successfully!"
echo "📡 The agent is now running in the background."
echo "   To check logs, run: tail -f /var/log/datrixops-agent.log"
echo "================================================="
