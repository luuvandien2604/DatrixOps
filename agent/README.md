# DatrixOps Agent

The DatrixOps Agent runs on each monitored host and sends metrics, system services, cron executions, process lists, and container telemetry to the DatrixOps Control Plane.

## Installation

To enroll a host into your Control Plane:
1. Open **Dashboard → Servers → Add Server**.
2. Select the target operating system (**Linux**, **macOS**, or **Windows**).
3. Copy and run the generated one-line enrollment command on that host.

## Architecture & Security

- **Outbound Connections**: The Agent initiates outbound HTTPS and secure WebSocket connections to the Control Plane. No inbound ports need to be opened on the monitored host.
- **Signed Binary Updates**: Remote updates verify Ed25519 cryptographic signatures and SHA-256 integrity hashes before activating new binaries.
- **Multi-Platform Daemon**: Runs natively via `systemd` (Linux), `launchd` (macOS), or `Windows Service` (Windows).
- **Reverse Web Terminal**: Secure, audited remote terminal channel manageable from the Control Plane dashboard.

## Service Management

### Linux (`systemd`)

```bash
# Service status & live logs
sudo systemctl status datrixops-agent
sudo journalctl -u datrixops-agent -f --no-pager

# Restart service
sudo systemctl restart datrixops-agent

# Configuration location
/etc/datrixops/agent.env (mode 0600)
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


