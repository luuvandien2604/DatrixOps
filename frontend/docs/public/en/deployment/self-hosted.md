---
title: "Self-Hosted Deployment"
description: "Comprehensive guide to installing, managing via datrix CLI, upgrading, backing up, and restoring DatrixOps Community Edition."
---

DatrixOps Community Edition (CE) is a complete self-hosted monitoring platform consisting of a centralized **Control Plane** and lightweight **DatrixOps Agents** deployed on target infrastructure. All PostgreSQL database records, telemetry metrics, logs, and audit trails reside entirely within your own infrastructure.

---

## 1. System Requirements

| Resource | Minimum Recommended | Notes |
| :--- | :--- | :--- |
| **Operating System** | Ubuntu 20.04+, Debian 11+, CentOS/RHEL 8+, AlmaLinux | Architecture: `x86_64` (amd64) or `aarch64` (arm64) |
| **CPU** | 1 Core | 2 Cores recommended for monitoring > 50 servers |
| **RAM** | 2 GB | Minimum 1.5 GB available memory |
| **Disk** | 20 GB SSD | Depends on telemetry retention policies |
| **Inbound Ports** | `80/TCP`, `443/TCP` | Open on host firewall and cloud Security Groups |

---

## 2. Automated 1-Line Installation

Connect to your Linux host via SSH with `root` or `sudo` privileges and run:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/bootstrap.sh | sudo bash
```

### What the installer handles automatically:
1. **Dependency Verification:** Automatically installs `docker`, `docker compose`, `curl`, `openssl`, and `jq` if missing.
2. **Access Mode Selection:**
   * **Public IP (Default):** Accessible immediately at `http://<VPS_IP>` (standard port 80).
   * **Custom Domain:** Enter your domain (e.g., `monitor.example.com`). The built-in Caddy Gateway automatically provisions and renews **free Let's Encrypt TLS / SSL certificates**.
3. **Administrator Credentials:** Configure your administrative username (default `admin`) and set or auto-generate a secure 32-character password.
4. **Self-Monitoring Auto-Enrollment:** Installs the DatrixOps Agent locally and connects the Control Plane host directly to your dashboard for instant real-time telemetry.
5. **CLI Registration:** Installs the global `datrix` management command in `/usr/local/bin/datrix`.

---

## 3. System Management with the `datrix` CLI

After installation, manage the entire platform using the unified `datrix` command.

### 📋 Interactive Management Menu

Run `datrix` without arguments to open the terminal management interface:

```bash
datrix
```
*(Or `sudo datrix` if running under a standard user account)*

The interactive dashboard displays:

```text
============================================================
  DatrixOps Management
============================================================
  1) Show login information
  2) Show service status
  3) Reset administrator password
  4) Follow service logs
  5) Restart services
  6) Upgrade DatrixOps
  7) Create backup
  0) Exit
============================================================
Select:
```

### ⚡ Direct Non-Interactive CLI Commands

Execute platform tasks directly without entering the menu:

| Command | Purpose | Example |
| :--- | :--- | :--- |
| `datrix info` | Display login URL, CE Server & Agent versions, and administrator username | `datrix info` |
| `datrix status` | Inspect Docker container health and local Agent service status | `datrix status` |
| `datrix reset-password` | Securely reset the administrator password | `datrix reset-password admin` |
| `datrix logs` | Follow live real-time container log output (press Ctrl+C to exit) | `datrix logs` |
| `datrix restart` | Restart all platform containers and the local Agent service | `datrix restart` |
| `datrix update` | Create an automatic pre-upgrade backup and upgrade to the latest CE release | `datrix update` |
| `datrix backup` | Generate a full compressed backup (PostgreSQL dump + `.env` secrets) | `datrix backup` |
| `datrix help` | Show command usage and options | `datrix help` |

---

## 4. Version Upgrades

DatrixOps features an automated, atomic upgrade process with **mandatory automated pre-upgrade backups**.

### Method 1: Direct Upgrade via CLI

```bash
sudo datrix update
```

### Method 2: Check for Updates Without Upgrading

```bash
sudo /opt/datrixops/deploy/upgrade.sh --check
```
*Sample Output:*
```text
============================================================
  DatrixOps Release Update Check
============================================================
  Installed Version : v1.8.2
  Latest Version    : v1.8.3
============================================================
[WARN] New version v1.8.3 is available! Run upgrade to apply.
```

### Method 3: Forced Reinstallation (`--force`)

To rebuild corrupted containers or re-synchronize codebase files:

```bash
sudo /opt/datrixops/deploy/upgrade.sh --force
```

### Method 4: Daily Automated Upgrades (Auto-Update Cron)

Enable unattended daily upgrades scheduled at 03:00 AM system time:

```bash
# Enable daily automated upgrades
sudo /opt/datrixops/deploy/upgrade.sh --setup-cron

# Disable daily automated upgrades
sudo /opt/datrixops/deploy/upgrade.sh --disable-auto-update
```
*(Cron configuration is stored in `/etc/cron.d/datrixops-auto-update`, logging to `/var/log/datrixops-auto-upgrade.log`).*

---

## 5. Backup & Disaster Recovery

### Creating a Backup

Run:
```bash
sudo datrix backup
```
* Compressed `.tar.gz` archives are saved in `/opt/datrixops/backups/`.
* The archive contains:
  1. `database.dump`: Binary PostgreSQL dump containing all users, server records, audit logs, and metrics.
  2. `environment.env`: Copy of your `.env` configuration (`JWT_SECRET`, `POSTGRES_PASSWORD`, etc.).
  3. `manifest.txt`: Timestamps and Git commit metadata.

### Restoring from Backup

When migrating to a new host or recovering from an outage:

```bash
sudo /opt/datrixops/deploy/restore.sh /opt/datrixops/backups/datrixops-backup-YYYY-MM-DD-HHMMSS.tar.gz --yes
```

> [!WARNING]
> Restoring replaces the active PostgreSQL database with the backup archive data. The `--yes` flag is mandatory.

---

## 6. Administrator Password Reset

If you lose access to the administrative dashboard:

```bash
sudo datrix reset-password
```
Enter a new password (min 12 characters). It will be securely hashed and updated immediately in the PostgreSQL database.

---

## 7. Advanced Configuration & Environment Variables

Platform configuration is stored in `/opt/datrixops/.env` (or `/opt/datrixops/deploy/.env`):

```bash
# Edit configuration
sudo nano /opt/datrixops/.env

# Restart services to apply changes
sudo datrix restart
```

### Key Environment Variables:

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PUBLIC_URL` | `http://<IP>` or `https://<domain>` | Canonical base URL used for dashboard access and Agent callbacks |
| `CADDY_SITE_ADDRESS` | `http://<IP>` or `<domain>` | Host configuration for Caddy automated reverse proxy and SSL |
| `DATRIXOPS_HTTP_PORT` | `80` | Host external HTTP port |
| `DATRIXOPS_HTTPS_PORT` | `443` | Host external HTTPS port |
| `AGENT_VERSION` | `1.5.9` | Default Agent release distributed by the server |
