# DatrixOps 🚀

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.25%2B-00ADD8.svg)](https://golang.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![Docker](https://img.shields.io/badge/Docker-Containers-2496ED.svg)](https://www.docker.com)
[![Open Source Agent](https://img.shields.io/badge/Agent-Open_Source_100%25-brightgreen.svg)](agent/)

**DatrixOps** is an open-source, self-hosted personal infrastructure manager for Linux servers and Docker. It also monitors websites, TLS certificates, alerts, logs, and remote operational workflows from one control plane.

Built with **Go (Backend API & Agent)** and **Next.js 16 (Frontend Dashboard)**, DatrixOps offers automated setup, 100% data privacy, real-time alerting, remote log inspection, and an integrated Web Terminal.

---

## 🏛️ Architecture & Open Source Strategy

```text
                                DatrixOps

                            ┌─────────────────┐
                            │ Open Source     │
                            │  System Agent   │
                            └────────┬────────┘
                                     │
                 ┌───────────────────┴───────────────────┐
                 │                                       │
                 ▼                                       ▼
    Community Edition (Open Source)              DatrixOps Cloud (Managed SaaS)
┌───────────────────────────────────────┐   ┌───────────────────────────────────────┐
│ • Self-Hosted Control Plane           │   │ • Everything in Community Edition     │
│ • Host Metrics (CPU, RAM, Disk, Net)  │   │ • 🤖 AI Diagnosis & Automation        │
│ • Website & SSL Expiry Monitoring     │   │ • ☁️ Automated Cloud Backups          │
│ • Centralized Remote Log Viewer       │   │ • 🏢 Team Workspaces & Multi-Org      │
│ • Web Terminal & Container Control    │   │ • ⚡ Managed Infrastructure & SLA     │
│ • Telegram & Discord Alerts           │   │ • 🔄 Automatic Zero-Downtime Updates  │
└───────────────────────────────────────┘   └───────────────────────────────────────┘
```

- **Open Source Agent**: The complete Agent source is included in [`agent/`](agent/) so its telemetry and remote-operation behavior can be audited with the rest of Community Edition.
- **Community Edition (Self-Hosted)**: Run your own complete monitoring stack locally on your VPS with 100% data privacy.
- **Edition boundary**: Community defaults to `DATRIXOPS_EDITION=community` and `DEPLOYMENT_MODE=self-hosted`; Cloud deployments use `DATRIXOPS_EDITION=cloud` with managed operations in a private overlay.

---

## ⚡ Quick Start (Community Edition)

> **Release requirement:** the installer uses the versions pinned in [`deploy/.env.example`](deploy/.env.example). A matching GitHub Release and all four GHCR images (`backend`, `worker`, `migrate`, and `frontend`) must already be public. Do not run the installer if either check below fails.

```bash
# Signed Agent release assets
curl -fsSI https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.5/agent-release.version

# Repeat this check for backend, worker, migrate, and frontend
docker manifest inspect ghcr.io/luuvandien2604/datrixops-backend:1.5.5 >/dev/null
```

### 1. Install DatrixOps Control Plane (Server)

**Requirements**: A fresh Linux server (Ubuntu 20.04/22.04/24.04, Debian 12, or CentOS/RHEL/Rocky Linux), 1 CPU, 2 GB RAM, ports 80 and 443 open, and no production web server that depends on those ports. The installer requires root access and installs Docker Engine/Compose when needed.

Run the 1-click automated installer on your primary VPS as `root`:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/install.sh | sudo bash
```

The installer automatically:
1. Installs the required host tools and Docker Engine/Compose v2 when missing.
2. Frees ports 80/443 for the bundled Caddy gateway, detects the public IP or domain, and generates secure `.env` credentials.
3. Downloads and verifies the signed Agent release, pulls the version-pinned GHCR images, runs database migrations, and starts the stack.

Once completed, open `http://<your-vps-ip>/setup` for an IP-based installation or `https://<your-domain>/setup` for a domain-based installation, then create the initial Administrator account.

---

### 2. Install DatrixOps Agent (Target Hosts)

To monitor another server, open **Dashboard → Servers → Add Server** and copy the generated command. It contains a short-lived enrollment token, the correct Control Plane URL, the pinned Agent version, and the signed artifact URL; do not reuse a command from README or another server.

---

## 🛠️ Operations & Maintenance

### Release

- [Release Community Edition](docs/RELEASE_CE.md) — quy trình hai lệnh cho admin.
- [Release DatrixOps Cloud](docs/RELEASE_CLOUD.md) — sync CE và publish Cloud riêng.

### Upgrade DatrixOps
```bash
sudo ./deploy/upgrade.sh
```
*(Creates a pre-upgrade backup, pulls the pinned GHCR images, applies database migrations, and restarts the affected services.)*

### Backup & Restore
```bash
# Create Backup
sudo ./deploy/backup.sh

# Restore Backup
sudo ./deploy/restore.sh /opt/datrixops/backups/datrixops-backup-YYYY-MM-DD-HHMMSS.tar.gz --yes
```

---

## 📚 Documentation & Technical Guides

- [Installation Guide](docs/INSTALLATION.md)
- [Open-Source Agent Guide](docs/AGENTS.md)
- [Upgrade & Maintenance Guide](docs/UPGRADE.md)
- [Backup and Restore Guide](docs/BACKUP_RESTORE.md)
- [Security Architecture](docs/SECURITY.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [CE Release Guide](docs/RELEASE_CE.md)
- [Cloud Release Guide](docs/RELEASE_CLOUD.md)
- [Edition Strategy](docs/EDITION_STRATEGY.md)
- [Cloud Compatibility Contracts](docs/CLOUD_COMPATIBILITY.md)

---

## 📄 License

DatrixOps Community Edition is licensed under the [Apache 2.0 License](LICENSE).
