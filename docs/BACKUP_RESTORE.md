# Backup and restore

Create a backup:

```bash
./deploy/backup.sh
```

The mode-0600 archive contains a PostgreSQL custom-format logical dump, the
exact `.env`, and a manifest with timestamp and Git commit. It contains
secrets; encrypt it with your backup system and store it off-host.

Restore replaces the target database:

```bash
./deploy/restore.sh /secure/path/datrixops-backup-YYYY-MM-DD-HHMMSS.tar.gz --yes
```

On a clean host, restore copies the archived environment file before starting
PostgreSQL. The script rejects unsafe archive paths, restores with
`pg_restore`, runs migrations and starts all services.

## Restore test

At least once per release:

1. Provision a clean host or isolated VM.
2. Install the same DatrixOps release without creating user data.
3. Copy the backup over an encrypted channel.
4. Run restore.
5. Verify `/health/ready`, admin login, server count, website history, alert
   rules and Agent reconnection.
6. Record the recovery time and securely delete the test copy.

An untested backup is not considered recoverable.
