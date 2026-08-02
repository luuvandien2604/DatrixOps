# Installation Guide

DatrixOps can be deployed in two simple ways: as a **Self-Hosted Control Plane** on your primary server, and by installing the **Open-Source DatrixOps Agent** on target Linux hosts.

---

## 🖥️ 1. Control Plane Server Installation

### Host Requirements
- **OS**: Ubuntu 20.04 / 22.04 / 24.04, Debian 12, CentOS / RHEL / Rocky Linux.
- **Hardware**: Minimum 1 CPU Core, 2 GB RAM, 20 GB Disk space.
- **Network**: Inbound TCP ports `80` and `443` open; outbound HTTPS access.

### Automated 1-Click Installer (Recommended)

Run the following command as `root` or with `sudo` on your server:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/install.sh | sudo bash
```

#### What the installer does:
1. Installs Docker Engine, Docker Compose v2, and Nginx if missing.
2. Auto-detects your server's Public IP address and generates strong random passwords for PostgreSQL and JWT auth in `/opt/datrixops/.env`.
3. Pulls pre-built production container images from GitHub Container Registry (`ghcr.io/luuvandien2604/*`).
4. Launches the database, runs schema migrations automatically, and starts backend and frontend services via Docker Compose.

### Initial Web Setup Wizard
1. Open your browser and navigate to `http://<your-vps-ip>/setup`.
2. The initial wizard verifies database health, locks registration, and creates the primary Administrator account.
3. Log in to access your DatrixOps Control Plane dashboard.

---

## 🤖 2. Agent Installation on Target VPS

To monitor remote Linux servers:

1. Log in to your DatrixOps Dashboard and navigate to **Servers** ➔ **Add Server**.
2. Copy the generated 1-click Agent Installation command:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/datrixops-agent/main/install-agent.sh | sudo bash -s -- --token <YOUR_AGENT_TOKEN> --server https://<your-vps-ip>/api/v1
```

The agent runs as a lightweight `systemd` service (`datrix-agent`), consuming less than 15MB RAM and under 0.5% CPU.

---

## 📂 Configuration & Storage Locations

- **System Path**: `/opt/datrixops`
- **Environment & Secrets**: `/opt/datrixops/.env` (Mode 0600)
- **Database Storage**: Docker Volume `postgres_data`
- **Logs Inspection**:
  ```bash
  cd /opt/datrixops && docker compose logs -f
  ```
