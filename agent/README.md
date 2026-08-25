# DatrixOps Agent

The DatrixOps Agent runs on each monitored server and sends host metrics,
inventory, process lists, container stats and task results to your DatrixOps Control Plane.

## Installation

To add a server to your Control Plane:
1. Open **Dashboard → Servers → Add Server**.
2. Select the target operating system (Linux, macOS, or Windows).
3. Run the generated one-line command on that host. It includes a secure, short-lived enrollment token and the pinned release version.

## Key Features & Security

- **Outbound Only**: The Agent establishes secure outbound HTTPS/WSS connections to your Control Plane; no open inbound firewall ports are required.
- **Ed25519 Signed Releases**: In-app binary updates require an Ed25519-signed manifest, matching platform architecture, size, and SHA-256 checksum verification before activation.
- **Multi-Platform**: Native support for Linux (`systemd`), macOS (`launchd`), and Windows (Windows Service).
- **Process & Docker Telemetry**: Low-overhead real-time metrics for CPU, RAM, Disk, Network, System Services, Cron jobs, and Docker containers.
- **Reverse Web Terminal**: Secure, audited reverse shell channel manageable directly from the Control Plane UI.

## Service Management

### Linux (`systemd`)

```bash
# Service status & live logs
sudo systemctl status datrixops-agent
sudo journalctl -u datrixops-agent -f --no-pager

# Restart service
sudo systemctl restart datrixops-agent

# Configuration location
/etc/datrixops/agent.env (chmod 0600)
```

### macOS (`launchd`)

```bash
# Service status
sudo launchctl print system/com.datrixops.agent

# Restart service
sudo launchctl kickstart -k system/com.datrixops.agent
```

### Windows (Service)

```powershell
Get-Service -Name DatrixOpsAgent
Restart-Service -Name DatrixOpsAgent
```

## Manual Binary Upgrade

If an older Agent needs to be updated directly via terminal without modifying existing tokens or configuration:

```bash
# Linux amd64
sudo systemctl stop datrixops-agent
sudo curl -fsSL https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.9/datrixops-agent-linux-amd64 -o /usr/local/bin/datrixops-agent
sudo chmod +x /usr/local/bin/datrixops-agent
sudo systemctl start datrixops-agent
```

