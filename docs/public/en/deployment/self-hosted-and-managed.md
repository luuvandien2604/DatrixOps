---
title: "Self-Hosted and Managed"
description: "Compare deployment models, install the DatrixOps Control Plane, and understand operational ownership."
---

DatrixOps always consists of a **Control Plane** and one or more **Agents**. The deployment model determines who operates the Control Plane. An Agent is installed on every monitored server.

## Check the Active Deployment Model

Open **Instance settings → Deployment & data ownership**:

- **SELF-HOSTED:** the Control Plane and PostgreSQL run on infrastructure controlled by your organization.
- **MANAGED:** a provider operates the Control Plane for you.

The page also shows the public URL, Agent version, retention, registration policy, and advanced feature flags.

## How the Models Differ

| Area | Self-Hosted | Managed |
| --- | --- | --- |
| Control Plane | Installed on your VPS | Operated by a provider |
| Database and metrics | Stored on your infrastructure | Subject to provider policy |
| TLS, backup, upgrades | Self-managed | Provider responsibility |
| Agent installation | Required | Required |
| Agent destination | Your VPS IP or Domain | Service domain |

## Install a Self-Hosted Control Plane

Recommended host: Linux (Ubuntu 20.04/22.04/24.04, Debian 12, CentOS/RHEL/Rocky), 1 CPU, 2 GB RAM, 20 GB disk, TCP 80/443.

Run the automated 1-liner installer as root on your VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/install.sh | sudo bash
```

The script automatically:
1. Installs Docker Engine, Docker Compose v2, and Nginx (if missing).
2. Auto-detects your VPS Public IP and generates secure `.env` secrets.
3. Downloads pre-compiled signed Agent release binaries and launches DatrixOps containers.

After installation completes, open `http://<your-vps-ip>/setup` in your browser to complete administrator setup.

## Upgrading Self-Hosted DatrixOps

To upgrade the Control Plane and Host Agent to the latest version, run the 1-liner upgrade script:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/upgrade.sh | sudo bash
```

The script automatically backs up your database, fetches the latest release tarball/git changes, updates pre-compiled Agent release binaries, applies schema migrations, and restarts containers safely.

### Background Version Checker & Auto-Updates

- **Background Checker**: Control Plane automatically checks `deploy/version.json` online every 6 hours and displays update banners on the Web Dashboard when a new release is available.
- **Check Update Status**:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/upgrade.sh | bash -s -- --check
  ```
- **Enable Daily Automated Upgrade**:
  ```bash
  curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/upgrade.sh | sudo bash -s -- --enable-auto-update
  ```
