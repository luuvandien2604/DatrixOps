#!/bin/bash
set -e

echo "================================================="
echo "🚀 DatrixOps Agent Installer (Linux)"
echo "================================================="

TOKEN=$1
SERVICES=$2
SERVER_URL="https://datrixops.vandien.space"
API_URL="${SERVER_URL}/api/v1"
INSTALL_DIR="/usr/local/bin"
SERVICE_FILE="/etc/systemd/system/datrixops-agent.service"

if [ -z "$TOKEN" ]; then
    echo "❌ Error: Agent token is required."
    echo "Usage: curl -sL ${SERVER_URL}/install.sh | sudo bash -s -- <AGENT_TOKEN>"
    exit 1
fi

if [ -n "$SERVICES" ] && ! printf '%s' "$SERVICES" | grep -Eq '^[A-Za-z0-9._@,$ -]+$'; then
    echo "❌ Error: Services contains unsupported characters."
    exit 1
fi

if [ "$EUID" -ne 0 ]; then
    echo "❌ Error: Please run as root (use sudo)."
    exit 1
fi

ARCH=$(uname -m)
if [ "$ARCH" = "x86_64" ]; then
    BINARY_URL="${SERVER_URL}/datrixops-agent-linux-amd64"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    BINARY_URL="${SERVER_URL}/datrixops-agent-linux-arm64"
else
    echo "❌ Error: Unsupported architecture: $ARCH"
    exit 1
fi

echo "🛑 Stopping existing service (if any)..."
systemctl stop datrixops-agent 2>/dev/null || true
pkill -f datrixops-agent 2>/dev/null || true

echo "📥 Downloading DatrixOps Agent from $BINARY_URL..."
curl -sL -o "$INSTALL_DIR/datrixops-agent" "$BINARY_URL"
chmod +x "$INSTALL_DIR/datrixops-agent"

echo "⚙️ Creating Systemd service..."
cat << SERVICE_EOF > $SERVICE_FILE
[Unit]
Description=DatrixOps Agent
After=network.target

[Service]
Type=simple
Environment="DATRIXOPS_SERVER_URL=$API_URL"
Environment="DATRIXOPS_AGENT_TOKEN=$TOKEN"
Environment="DATRIXOPS_SERVICES=$SERVICES"
ExecStart=$INSTALL_DIR/datrixops-agent
Restart=always
RestartSec=10
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
SERVICE_EOF

echo "🔄 Starting DatrixOps Agent service..."
systemctl daemon-reload
systemctl enable datrixops-agent
systemctl restart datrixops-agent

echo "✅ DatrixOps Agent installed successfully!"
echo "📡 The agent is now running in the background and sending metrics to your dashboard."
echo "   To check logs, run: sudo journalctl -u datrixops-agent -f"
echo "================================================="
