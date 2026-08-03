# DatrixOps 🚀

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.25%2B-00ADD8.svg)](https://golang.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org)
[![Docker](https://img.shields.io/badge/Docker-Containers-2496ED.svg)](https://www.docker.com)
[![Open Source Agent](https://img.shields.io/badge/Agent-Open_Source_100%25-brightgreen.svg)](https://github.com/luuvandien2604/datrixops-agent)

**DatrixOps** is an open-source, self-hosted personal infrastructure manager for Linux servers and Docker. It also monitors websites, TLS certificates, alerts, logs, and remote operational workflows from one control plane.

Built with **Go (Backend API & Agent)** and **Next.js 15 (Frontend Dashboard)**, DatrixOps offers 1-click automated setup, 100% data privacy, real-time alerting, remote log inspection, and an integrated Web Terminal.

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

- **Open Source Agent Repo**: [`datrixops-agent`](https://github.com/luuvandien2604/datrixops-agent) — Inspect every line of telemetry code. Zero backdoors, zero telemetry tracking.
- **Community Edition (Self-Hosted)**: Run your own complete monitoring stack locally on your VPS with 100% data privacy.
- **Edition boundary**: Community defaults to `DATRIXOPS_EDITION=community` and `DEPLOYMENT_MODE=self-hosted`; Cloud deployments use `DATRIXOPS_EDITION=cloud` with managed operations in a private overlay.

---

## ⚡ Quick Start (Automated 1-Liner Installation)

### 1. Install DatrixOps Control Plane (Server)

**Requirements**: Linux Server (Ubuntu 20.04/22.04/24.04, Debian 12, CentOS/RHEL/Rocky Linux), 1 CPU, 2 GB RAM, Ports 80 & 443 open.

Run the 1-click automated installer on your primary VPS as `root`:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/install.sh | sudo bash
```

The installer automatically:
1. Installs Docker Engine, Docker Compose v2, and Nginx (if missing).
2. Auto-detects your VPS Public IP and generates secure `.env` credentials.
3. Pulls official pre-built GHCR images and starts DatrixOps containers.

Once completed, open `http://<your-vps-ip>/setup` in your browser to create your initial Administrator account.

---

### 2. Install DatrixOps Agent (Target Hosts)

To monitor additional Linux servers, run the agent installer from your DatrixOps Dashboard:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/datrixops-agent/main/install-agent.sh | sudo bash -s -- --token YOUR_AGENT_TOKEN --server https://your-datrixops-vps-ip/api/v1
```

---

## 🛠️ Operations & Maintenance

### Upgrade DatrixOps (Zero-Downtime Pull Update)
```bash
sudo ./deploy/upgrade.sh
```
*(Automatically creates pre-upgrade backups, pulls latest GHCR container images, applies DB migrations, and restarts services in seconds).*

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
- [Edition Strategy](docs/EDITION_STRATEGY.md)
- [Cloud Compatibility Contracts](docs/CLOUD_COMPATIBILITY.md)
- [Repository Split Audit](docs/REPOSITORY_SPLIT_AUDIT.md)

---

## 📄 License

DatrixOps Community Edition is licensed under the [Apache 2.0 License](LICENSE).
