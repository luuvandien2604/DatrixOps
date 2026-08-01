# DatrixOps

DatrixOps is a self-hosted infrastructure monitoring control plane for Linux servers, websites and TLS certificates. It includes a Go API and worker, PostgreSQL, a Next.js dashboard, Caddy and a lightweight Agent.

## Quick Start (Automated 1-Liner Installation)

Requirements: Linux server (Ubuntu 20.04/22.04/24.04, Debian 12, CentOS/RHEL/Rocky), inbound TCP 80/443.

Run the automated installer on your VPS as root:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/install.sh | sudo bash
```

The installation script automatically:
1. Installs Docker Engine, Docker Compose v2, and Nginx (if missing).
2. Auto-detects your VPS Public IP address and generates secure `.env` secrets.
3. Downloads pre-compiled signed Agent release binaries and launches DatrixOps containers via Docker Compose.

After installation completes, open `http://<your-vps-ip>/setup` in your browser to create your initial administrator account.

## Manual Repository Setup (Developer Mode)

If you prefer cloning the repository manually for development:

```bash
git clone https://github.com/luuvandien2604/DatrixOps.git
cd DatrixOps
./deploy/install.sh
```

## Operations & Upgrades

- **Upgrade DatrixOps (Git & Git-less Dual Mode):**
  ```bash
  ./deploy/upgrade.sh
  ```
  *(Automatically backs up data, fetches the latest release, runs database migrations, and updates running containers without requiring Git SSH keys).*

- **Backup & Restore:**
  ```bash
  ./deploy/backup.sh
  ./deploy/restore.sh /path/to/datrixops-backup-YYYY-MM-DD-HHMMSS.tar.gz --yes
  ```

PostgreSQL data is stored safely in the `postgres_data` named Docker volume.

## Documentation

- [Installation Guide](docs/INSTALLATION.md)
- [Upgrade Guide](docs/UPGRADE.md)
- [Backup and Restore](docs/BACKUP_RESTORE.md)
- [Security Model](docs/SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Development Guide](docs/DEVELOPMENT.md)
- [Technical Architecture](docs/technical/system-overview.md)

License: MIT.
