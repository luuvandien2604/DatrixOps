# DatrixOps

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.25%2B-00ADD8.svg)](https://golang.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![Docker](https://img.shields.io/badge/Docker-Containers-2496ED.svg)](https://www.docker.com)

DatrixOps Community Edition is an open-source, self-hosted control plane for
monitoring and operating Linux servers, Docker workloads, websites, TLS
certificates, alerts and remote workflows. Your control plane, PostgreSQL data
and operational history remain on infrastructure you manage.

## What is included

- Host CPU, memory, disk and network metrics.
- Process, service and Docker inventory.
- Website and TLS certificate monitoring.
- Alerting through Telegram and Discord.
- Remote logs, service controls and an optional Web Terminal.
- An auditable Go Agent for Linux, macOS and Windows.
- Backup, restore and signed Agent update workflows.

## Install Community Edition

Recommended host: a fresh Ubuntu 20.04/22.04/24.04, Debian 12, or
CentOS/RHEL/Rocky Linux server with 1 CPU, 2 GB RAM, 20 GB disk and inbound
ports 80/443. The installer reserves those ports for the bundled Caddy gateway.

Run as root:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/bootstrap.sh | sudo bash
```

The installer downloads the source package to `/opt/datrixops`, generates
secrets, verifies the signed Agent release, pulls version-pinned container
images, runs migrations and starts the stack.

After installation, open:

```text
http://<server-ip>/setup
```

For a configured domain, use `https://<your-domain>/setup`.

## Add monitored servers

Open **Dashboard → Servers → Add Server** and copy the generated command for
the target operating system. The command contains a short-lived enrollment
token and must only be used on the intended server.

## Operations

```bash
# Upgrade with a pre-upgrade backup
sudo /opt/datrixops/deploy/upgrade.sh

# Create a backup
sudo /opt/datrixops/deploy/backup.sh

# Inspect services
cd /opt/datrixops
sudo docker compose --env-file .env -f deploy/docker-compose.yml ps
```

## Documentation

- [Installation](docs/INSTALLATION.md)
- [Upgrade](docs/UPGRADE.md)
- [Backup and restore](docs/BACKUP_RESTORE.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Security](docs/SECURITY.md)
- [REST API](docs/api/rest-api.md)
- [Dashboard user guide](frontend/docs/public/dashboard/overview.md)

## License

DatrixOps Community Edition is licensed under the [Apache 2.0 License](LICENSE).
