#!/bin/bash
set -e

echo "================================================="
echo "🚀 DatrixOps Agent Installer"
echo "================================================="

# Variables
TOKEN=$1
SERVER_URL="https://datrixops.vandien.space"
API_URL="${SERVER_URL}/api/v1"
BINARY_URL="${SERVER_URL}/datrixops-agent"
INSTALL_DIR="/usr/local/bin"
SERVICE_FILE="/etc/systemd/system/datrixops-agent.service"

if [ -z "$TOKEN" ]; then
    echo "❌ Error: Agent token is required."
    echo "Usage: curl -sL ${SERVER_URL}/install.sh | sudo bash -s -- <AGENT_TOKEN>"
    exit 1
fi

if [ "$EUID" -ne 0 ]; then
    echo "❌ Error: Please run as root (use sudo)."
    exit 1
fi

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

echo ""
echo "✅ DatrixOps Agent installed successfully!"
echo "📡 The agent is now running in the background and sending metrics to your dashboard."
echo "   To check logs, run: sudo journalctl -u datrixops-agent -f"
echo "================================================="
