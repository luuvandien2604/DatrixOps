# DatrixOps

DatrixOps is a self-hosted infrastructure monitoring control plane for Linux
servers, websites and TLS certificates. It includes a Go API and worker,
PostgreSQL, a Next.js dashboard, Caddy and a lightweight Agent.

## Quick start

Requirements: Ubuntu 22.04/24.04 or Debian 12, Docker Engine with Compose v2,
a DNS name pointing at the host, and inbound TCP 80/443.

```bash
git clone https://github.com/luuvandien2604/DatrixOps.git
cd DatrixOps
cp deploy/.env.example .env
./deploy/generate-secrets.sh
```

Edit `.env`, set `DATRIXOPS_DOMAIN`, `PUBLIC_URL`, `ALLOWED_ORIGINS` and a
released `AGENT_VERSION`, then run:

```bash
./deploy/install.sh
```

Open `https://your-domain.example/setup`, create the initial administrator,
then use **Servers → Add Server** to generate a 15-minute, single-use Agent
enrollment command.

High-risk Agent features (Web Terminal, remote scripts and service controls)
are disabled by default. Monitoring, Agent enrollment, website checks, alerts,
notifications, backups and upgrades do not require them.

## Operations

```bash
./deploy/backup.sh
./deploy/upgrade.sh
./deploy/restore.sh /path/to/datrixops-backup-YYYY-MM-DD-HHMMSS.tar.gz --yes
```

PostgreSQL is stored in the `postgres_data` named volume. Upgrade never runs
`docker compose down -v`.

## Documentation

- [Installation](docs/INSTALLATION.md)
- [Agent installation](docs/AGENT_INSTALLATION.md)
- [Upgrade](docs/UPGRADE.md)
- [Backup and restore](docs/BACKUP_RESTORE.md)
- [Alerts](docs/ALERTS.md)
- [Notifications](docs/NOTIFICATIONS.md)
- [Security](docs/SECURITY.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Development](docs/DEVELOPMENT.md)
- [Release process](docs/RELEASE_PROCESS.md)
- [Implementation audit](docs/AUDIT.md)

## Supported scope

The current target is a single self-hosted instance. Linux headless is the
primary Agent platform. Windows and macOS collectors remain secondary. See the
audit for partial features and validation still required before calling a
release production-ready.

License: MIT.
