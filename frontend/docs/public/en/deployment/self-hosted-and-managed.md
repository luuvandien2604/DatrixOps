---
title: "Self-Hosted and Managed"
description: "Compare deployment models, install the DatrixOps Control Plane, and understand operational ownership."
---

DatrixOps always consists of a **Control Plane** and one or more **Agents**. The deployment model determines who operates the Control Plane. An Agent is installed on every monitored server.

## Check the Active Deployment Model

Open **Workspace settings → Deployment & data ownership**:

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

The self-hosted upgrade workflow consists of two streamlined steps:

### 1. Upgrade the Control Plane Host
To upgrade the Control Plane (Web Dashboard, Backend API, and host self-monitoring agent) to the latest version, run:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/upgrade.sh | sudo bash
```

The script automatically backs up your database, fetches the latest release, applies migrations, and restarts services safely.

### 2. Upgrade Remote Monitored Agents (Satellite Nodes)
👉 **No SSH access required for remote servers!**

- Once the Control Plane is upgraded, the Web Dashboard automatically detects any remote target servers running older Agent versions and labels them **`Update available`**.
- Operators simply click **"Update Agent"** (or select multiple servers and click **"Update all agents"**) directly from the Web Dashboard.
- The Control Plane queues an in-place update task. Remote Agents download the signed binary from the Control Plane and restart automatically in the background.
