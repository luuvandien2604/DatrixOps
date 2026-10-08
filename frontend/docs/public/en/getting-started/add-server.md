---
title: Adding Monitored Servers
description: Generate Agent Tokens and install the Agent on Linux, macOS, and Windows with one command.
---

# Adding Monitored Servers

To begin monitoring a server, you must install the lightweight DatrixOps Agent on it. The agent runs as a background system daemon, collects hardware and OS metrics, and securely transmits telemetry back to your DatrixOps control plane.

---

## How Agent Registration Works

DatrixOps uses token-based enrollment:
1. You request a new server enrollment in the Dashboard.
2. The Dashboard generates a unique, one-time enrollment command with a cryptographically signed **Agent Token**.
3. You run the command on the target machine.
4. The Agent downloads, registers itself with the DatrixOps server, and begins streaming metrics over an outbound TLS connection.

> [!NOTE]
> The Agent only initiates **outbound** connections to your DatrixOps server on port `80` (HTTP) or `443` (HTTPS/WSS). You do **not** need to open any incoming firewall ports on the target machine.

---

## Step 1: Open the Add Server Dialog

1. Sign in to your DatrixOps Dashboard.
2. From the sidebar navigation, click **Servers** (`/dashboard/servers`).
3. In the top-right corner, click the **Add Server** button.
4. In the dialog that opens:
   - Enter a **Server Name** (e.g., `web-production-01` or `db-primary`).
   - Select the target operating system tab: **Linux**, **macOS**, or **Windows**.

---

## Step 2: Run the Installation Command

### On Linux (Ubuntu, Debian, CentOS, Rocky, AlmaLinux)

Copy the generated command and execute it as `root` (or prefix with `sudo`) in your server's terminal:

```bash
curl -fsSL https://<your-datrix-domain>/api/v1/agent/install.sh | sudo bash -s -- \
  --server https://<your-datrix-domain> \
  --token <YOUR_AGENT_TOKEN>
```

**What the installer does automatically:**
- Detects system architecture (`amd64` or `arm64`).
- Downloads the official signed `datrix-agent` binary to `/usr/local/bin/datrix-agent`.
- Writes the configuration file to `/etc/datrix-agent/agent.yaml`.
- Registers and starts a `systemd` background service named `datrix-agent`.
- Enables auto-start on system boot.

### On macOS

1. Select the **macOS** tab in the **Add Server** modal.
2. Open **Terminal** on your Mac.
3. Paste and run the installation script:

```bash
curl -fsSL https://<your-datrix-domain>/api/v1/agent/install-darwin.sh | bash -s -- \
  --server https://<your-datrix-domain> \
  --token <YOUR_AGENT_TOKEN>
```

The script configures a `launchd` daemon (`com.datrixops.agent`) that runs in the background.

### On Microsoft Windows

1. Select the **Windows** tab in the **Add Server** modal.
2. Open **PowerShell** as **Administrator**.
3. Run the automated PowerShell installation command:

```powershell
& ([scriptblock]::Create((irm https://<your-datrix-domain>/api/v1/agent/install.ps1))) `
  -Server "https://<your-datrix-domain>" `
  -Token "<YOUR_AGENT_TOKEN>"
```

The installer registers a native Windows Service named `DatrixAgent` and starts it immediately.

---

## Step 3: Verify Connection Status

1. Return to the **Servers** page on your DatrixOps Dashboard.
2. Within 5 to 10 seconds, the new server will appear with a green **Online** status indicator.
3. Click on the server name to open its **Server Details** page, where live CPU, memory, disk, and network charts will begin populating immediately.

---

## Checking Agent Service on the Host

If you need to verify the agent directly on the server:

### On Linux
```bash
# Check service status
sudo systemctl status datrix-agent

# View recent service logs
sudo journalctl -u datrix-agent -f
```

### On macOS
```bash
sudo launchctl list | grep datrix
```

### On Windows
```powershell
Get-Service -Name DatrixAgent
```

---

## Next Steps

- Explore real-time metrics and systemd management in [Server & Resource Monitoring](/docs/features/servers).
- Configure ping and TCP latency checks in [Network Quality Diagnostics](/docs/features/network-quality).
- Set up alerts in [Alerts & Notifications](/docs/features/alerts) to get warned if this server goes offline.
