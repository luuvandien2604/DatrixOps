---
title: The datrix CLI
description: Command-line options for running, testing, stopping, and debugging the agent.
---

# The `datrix` & `datrix-agent` CLI Reference

DatrixOps provides two companion command-line tools:
1. **`datrix`**: Installed on your main control plane server to manage containers, backups, passwords, and logs.
2. **`datrix-agent`**: Installed on monitored hosts to manage agent service lifecycle, diagnostics, and cron telemetry.

---

## Part 1: Control Plane CLI (`datrix`)

The `datrix` tool is installed at `/usr/local/bin/datrix` on your primary server.

### Interactive Menu
Running `sudo datrix` without arguments opens an interactive navigation menu:

```bash
sudo datrix
```

### Direct Subcommands

| Command | Description |
| :--- | :--- |
| `sudo datrix info` | Displays dashboard access URLs, public/domain address, and admin username. |
| `sudo datrix status` | Inspects Docker container states (`caddy`, `backend`, `frontend`). |
| `sudo datrix reset-password` | Resets the administrator password interactively without modifying database files manually. |
| `sudo datrix logs` | Streams live container logs to the terminal (`Ctrl+C` to exit). |
| `sudo datrix restart` | Safely restarts the Docker Compose container stack. |
| `sudo datrix backup` | Creates an immediate compressed backup archive in `/opt/datrixops/backups/`. |
| `sudo datrix upgrade` | Pulls the latest release images, applies migrations, and restarts services. |

---

## Part 2: Agent CLI (`datrix-agent`)

The `datrix-agent` binary is located at `/usr/local/bin/datrix-agent` on monitored Linux and macOS machines (or in `C:\Program Files\DatrixAgent\` on Windows).

### Checking Version & Build Information
```bash
datrix-agent version
```
*Output:*
```text
datrix-agent version v1.4.2 (darwin/arm64, commit: a1b2c3d, built: 2026-10-01)
```

### Checking Agent Service Status
Verifies configuration file validity and test communication with the control plane:

```bash
sudo datrix-agent status
```
*Output:*
```text
Configuration : /etc/datrix-agent/agent.yaml [VALID]
Control Plane : https://ops.example.com [CONNECTED]
Agent ID      : agt_8f3a92bc17d0
Uptime        : 14d 8h 22m
```

### Running an On-Demand Metric Probe
Collects hardware metrics and network probe targets immediately, printing them to the terminal without waiting for the scheduled report interval:

```bash
sudo datrix-agent test
```

### Self-Updating the Agent
Downloads the latest verified binary from your control plane, performs Ed25519 signature checks, replaces the executable, and restarts the system daemon:

```bash
sudo datrix-agent update
```

### Cron Job Telemetry Wrapper
Wraps scheduled commands to record start time, duration, exit codes, and output:

```bash
datrix-agent cron wrap --job "<JOB_NAME>" -- <COMMAND>
```

**Example:**
```bash
datrix-agent cron wrap --job "nightly-db-dump" -- /usr/local/bin/dump-db.sh --all
```

---

## Next Steps

- Review environment variables in [Environment Variables (.env)](/docs/reference/configuration).
- Troubleshoot agent issues in [Common Issues & Solutions](/docs/troubleshooting/common-issues).
