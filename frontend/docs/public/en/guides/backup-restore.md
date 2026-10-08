---
title: Backup & Disaster Recovery
description: Back up SQLite data and configuration, and restore them to a new host.
---

# Backup & Disaster Recovery

Protecting your DatrixOps data—including server configurations, network probe targets, historical telemetry, and alert rules—is straightforward. This guide covers creating automated backups, taking on-demand snapshots, and performing a complete recovery on a new server.

---

## What Gets Backed Up

A complete DatrixOps backup contains two essential components:

1. **Database File (`datrixops.db`)**: The SQLite database storing your server catalog, targets, alert history, metrics, and user accounts.
2. **Environment File (`.env`)**: Your server secrets, JWT signing key, custom domain settings, and SMTP configuration.

---

## Method 1: On-Demand Backup using the `datrix` Tool

The fastest way to back up your instance is via the `datrix` CLI on your host server:

```bash
sudo datrix backup
```

Or execute the deployment script directly:

```bash
sudo /opt/datrixops/deploy/backup.sh
```

### What Happens:
- Uses SQLite's online safe backup API to snapshot the database without stopping services or locking tables.
- Packages the database snapshot and your `.env` configuration into a compressed archive.
- Saves the file to `/opt/datrixops/backups/datrixops-backup-<TIMESTAMP>.tar.gz`.

---

## Method 2: Automated Daily Backups via Cron

To schedule automated daily backups at 03:00 AM, add a root cron job:

1. Open root crontab:
   ```bash
   sudo crontab -e
   ```
2. Add the scheduled backup command:
   ```cron
   0 3 * * * /opt/datrixops/deploy/backup.sh > /var/log/datrixops-backup.log 2>&1
   ```
3. Save and exit.

> [!TIP]
> We recommend using an off-site backup tool (such as `rclone` or `rsync`) to periodically sync the `/opt/datrixops/backups/` directory to Amazon S3, Google Cloud Storage, or another off-site location.

---

## Restoring DatrixOps from a Backup

To restore DatrixOps on the same machine or migrate to a brand new host:

### Step 1: Prepare the Target Server
Ensure Docker and Docker Compose are installed on the target machine.

```bash
git clone https://github.com/luuvandien2604/DatrixOps.git /opt/datrixops
cd /opt/datrixops
```

### Step 2: Stop Running Services
If services are currently running, bring them down:

```bash
sudo docker compose -f deploy/docker-compose.yml down
```

### Step 3: Extract the Backup Archive
Copy your backup archive (e.g., `datrixops-backup-20261008-120000.tar.gz`) to the server and extract it:

```bash
sudo tar -xzf datrixops-backup-20261008-120000.tar.gz -C /opt/datrixops/
```

This restores:
- Your original `.env` file containing existing encryption keys.
- The `datrixops.db` SQLite database file inside `/opt/datrixops/data/`.

### Step 4: Restart the Application Stack
Launch the containers:

```bash
sudo docker compose -f deploy/docker-compose.yml up -d
```

Verify service status:

```bash
sudo datrix status
```

Open your browser and navigate to your dashboard URL. All registered servers, past telemetry records, and network targets will be restored immediately. Connected agents will re-establish communication seamlessly because the server's encryption keys and authentication tokens were preserved.

---

## Next Steps

- Review configuration variables in [Environment Variables (.env)](/docs/reference/configuration).
- Learn troubleshooting steps in [Common Issues & Solutions](/docs/troubleshooting/common-issues).
