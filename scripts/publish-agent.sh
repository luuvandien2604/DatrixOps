#!/bin/bash

# Publish Agent Script
# This script compiles the agent for multiple platforms and generates installation scripts, 
# placing all of them in the Next.js public directory.

set -e

echo "🚀 Publishing DatrixOps Agent (Multi-platform)..."

# Directories
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="$PROJECT_ROOT/agent"
PUBLIC_DIR="$PROJECT_ROOT/frontend/public"

mkdir -p "$PUBLIC_DIR"

echo "📦 Compiling binaries..."
cd "$AGENT_DIR"

# 1. Compile for Linux AMD64
echo " - Linux (amd64)"
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w -X main.Version=1.1.0" -o "$PUBLIC_DIR/datrixops-agent-linux-amd64" ./cmd/agent

# 2. Compile for Linux ARM64
echo " - Linux (arm64)"
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build -ldflags="-s -w -X main.Version=1.1.0" -o "$PUBLIC_DIR/datrixops-agent-linux-arm64" ./cmd/agent

# 3. Compile for macOS AMD64
echo " - macOS (amd64)"
CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -ldflags="-s -w -X main.Version=1.1.0" -o "$PUBLIC_DIR/datrixops-agent-darwin-amd64" ./cmd/agent

# 4. Compile for macOS ARM64
echo " - macOS (arm64)"
CGO_ENABLED=0 GOOS=darwin GOARCH=arm64 go build -ldflags="-s -w -X main.Version=1.1.0" -o "$PUBLIC_DIR/datrixops-agent-darwin-arm64" ./cmd/agent

# 5. Compile for Windows AMD64
echo " - Windows (amd64)"
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-s -w -X main.Version=1.1.0" -o "$PUBLIC_DIR/datrixops-agent-windows-amd64.exe" ./cmd/agent


echo "📜 Generating install scripts..."

# ==============================================================================
# INSTALL.SH (Linux)
# ==============================================================================
cat << 'EOF' > "$PUBLIC_DIR/install.sh"
#!/bin/bash
set -e

echo "================================================="
echo "🚀 DatrixOps Agent Installer (Linux)"
echo "================================================="

TOKEN=$1
SERVER_URL="https://datrixops.vandien.space"
API_URL="${SERVER_URL}/api/v1"
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
EOF
chmod +x "$PUBLIC_DIR/install.sh"


# ==============================================================================
# INSTALL-MAC.SH (macOS)
# ==============================================================================
cat << 'EOF' > "$PUBLIC_DIR/install-mac.sh"
#!/bin/bash
set -e

echo "================================================="
echo "🚀 DatrixOps Agent Installer (macOS)"
echo "================================================="

TOKEN=$1
SERVER_URL="https://datrixops.vandien.space"
API_URL="${SERVER_URL}/api/v1"
INSTALL_DIR="/usr/local/bin"
PLIST_FILE="/Library/LaunchDaemons/com.datrixops.agent.plist"

if [ -z "$TOKEN" ]; then
    echo "❌ Error: Agent token is required."
    echo "Usage: curl -sL ${SERVER_URL}/install-mac.sh | sudo bash -s -- <AGENT_TOKEN>"
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
EOF
chmod +x "$PUBLIC_DIR/install-mac.sh"


# ==============================================================================
# INSTALL.PS1 (Windows)
# ==============================================================================
cat << 'EOF' > "$PUBLIC_DIR/install.ps1"
param (
    [Parameter(Mandatory=$true)]
    [string]$Token
)

Write-Host "=================================================" -ForegroundColor Cyan
Write-Host "[*] DatrixOps Agent Installer (Windows)" -ForegroundColor Cyan
Write-Host "=================================================" -ForegroundColor Cyan

# Ensure admin rights
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Error "Please run PowerShell as Administrator."
    exit 1
}

$ServerUrl = "https://datrixops.vandien.space"
$ApiUrl = "$ServerUrl/api/v1"
$BinaryUrl = "$ServerUrl/datrixops-agent-windows-amd64.exe"
$InstallDir = "C:\Program Files\DatrixOps"
$ExePath = "$InstallDir\datrixops-agent.exe"
$BatPath = "$InstallDir\run_agent.bat"

# Create directory
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir | Out-Null
}

# Stop existing task and process if running
$TaskName = "DatrixOpsAgent"
Write-Host "[*] Stopping existing agent (if running)..."
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Out-Null
Stop-Process -Name "datrixops-agent" -Force -ErrorAction SilentlyContinue | Out-Null

Write-Host "[*] Downloading DatrixOps Agent..."
Invoke-WebRequest -Uri $BinaryUrl -OutFile $ExePath

Write-Host "[*] Creating wrapper script..."
$LogPath = "$InstallDir\agent.log"
$BatContent = @(
    "@echo off",
    "set DATRIXOPS_SERVER_URL=$ApiUrl",
    "set DATRIXOPS_AGENT_TOKEN=$Token",
    "`"$ExePath`" >> `"$LogPath`" 2>&1"
)
$BatContent | Set-Content -Path $BatPath -Encoding ASCII

Write-Host "[*] Creating Scheduled Task to run agent on startup..."

# Action: run agent via bat script so env vars are loaded properly
$Action = New-ScheduledTaskAction -Execute $BatPath

# Trigger: at startup
$Trigger = New-ScheduledTaskTrigger -AtStartup

# Settings: don't stop on battery, auto-restart up to 999 times if the process exits
# (needed so "Restart Agent" from the dashboard actually brings the agent back up,
# not just on reboot). RestartInterval must be between 1 minute and 31 days.
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RunOnlyIfNetworkAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 0)

# Additional trigger: also restart if the process ends unexpectedly (Scheduled Tasks
# only retry via RestartCount when the task itself is considered "failed", so we also
# register an Event Trigger is overkill here — RestartCount handles the common case).

# System account
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# Register task
$TaskName = "DatrixOpsAgent"
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal | Out-Null

Write-Host "[*] Starting DatrixOps Agent..."
Start-ScheduledTask -TaskName $TaskName

Write-Host "[OK] DatrixOps Agent installed successfully!" -ForegroundColor Green
Write-Host "[*] The agent is now running in the background and will auto-start on boot."
Write-Host "=================================================" -ForegroundColor Cyan
EOF


echo "✅ Publish complete!"
echo "You should now rebuild the frontend container (or if running locally, they are ready to serve)."