# Upgrade Guide

DatrixOps provides an automated, zero-downtime upgrade path for self-hosted instances.

## Upgrading Self-Hosted DatrixOps

DatrixOps features a 2-tier architecture for seamless upgrades:

### 1. Control Plane & Self-Monitoring Agent Upgrade

To upgrade the DatrixOps Control Plane (Web Dashboard, Backend API, and the host's own self-monitoring agent), run the 1-liner upgrade command directly on the host VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/upgrade.sh | sudo bash
```

### 2. Remote Agent Nodes Upgrade (Zero SSH Required)

For all remote servers/nodes monitored by your DatrixOps instance:

1. As soon as the Control Plane is upgraded, the Web Dashboard automatically checks remote agent heartbeats against the new `AGENT_VERSION`.
2. Any server running an older agent version will display an **Update available** badge on the **Servers** page (`/dashboard/servers`).
3. Operators can trigger an in-place upgrade by clicking **Update Agent** or **Update all agents** directly in the Dashboard UI.
4. The Control Plane dispatches a signed `agent_update` task. The remote Agent automatically downloads the new binary from the Control Plane and performs a seamless background restart without interrupting monitoring.

## Automated Background Updates (Cronjob)

To keep both your **Control Plane Server** and **Host Agent** continuously up-to-date automatically, you can enable daily background updates:

```bash
# Enable automated daily updates (runs daily at 03:00 AM)
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/upgrade.sh | sudo bash -s -- --enable-auto-update

# Disable automated daily updates
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/upgrade.sh | sudo bash -s -- --disable-auto-update

# Quick check if a new release is available (no changes applied)
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/upgrade.sh | bash -s -- --check
```

## Automatic Release Detection & Dashboard Notifications

Self-hosted DatrixOps instances automatically monitor for new releases in the background:

1. **Background Version Checker (`UpdateJob`):**
   The Control Plane backend queries `https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/version.json` every 6 hours (and on startup).
2. **Web Dashboard Notifications:**
   When a newer version (e.g., `v1.5.4`) is published online, the Control Plane automatically marks `update_available = true` and updates `/api/v1/system/info`.
3. **Zero-Downtime Upgrade:**
   Administrators can run the standard `upgrade.sh` command at any time to apply the latest release smoothly.

## How the Upgrade Process Works

1. **Automated Backup:**
   Before making any changes, `./deploy/upgrade.sh` runs `./deploy/backup.sh` to create a timestamped compressed backup (`datrixops-backup-YYYY-MM-DD-HHMMSS.tar.gz`) containing your `.env` configuration and a PostgreSQL database dump.

2. **Dual-Mode Codebase Update:**
   - **Git Mode:** If the project directory is a Git repository, it pulls the latest commit via `git pull --ff-only`.
   - **Git-less / HTTPS Release Mode:** If Git is not installed or Git SSH credentials are absent, it automatically downloads the latest release tarball over HTTPS, preserving `.env` and custom data.

3. **Agent Artifact Update:**
   Fetches updated pre-compiled signed Agent release binaries (`fetch-agent-release.sh`) for all supported operating systems.

4. **Database Migrations:**
   Executes `docker compose run --rm migrate` to apply any new database schema migrations safely.

5. **Container Upgrade & Health Verification:**
   Restarts containers using updated images (`docker compose up -d`) and performs health checks against the `/health/ready` endpoint.

## Data Safety Guarantee

- Upgrades never perform `docker compose down -v`. Your PostgreSQL database volume (`postgres_data`) and configuration remain completely untouched and safe.
