# Upgrade Guide

DatrixOps provides an automated, zero-downtime upgrade path for self-hosted instances.

## Upgrading DatrixOps

To upgrade DatrixOps to the latest release, run the upgrade script from your installation directory:

```bash
./deploy/upgrade.sh
```

Or run the 1-liner upgrade command directly:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/upgrade.sh | sudo bash
```

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
