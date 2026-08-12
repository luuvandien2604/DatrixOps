# Upgrade

Run on the self-hosted Control Plane:

```bash
sudo /opt/datrixops/deploy/upgrade.sh
```

The script creates a backup, downloads the current source package, synchronizes
the pinned application and Agent versions, verifies signed Agent artifacts,
pulls container images, runs database migrations, recreates affected services
and checks readiness.

An upgrade restarts containers and may briefly interrupt requests. Do not call
it zero-downtime unless the deployment has been independently designed and
tested for redundant replicas.

## Before upgrading

```bash
cd /opt/datrixops
sudo ./deploy/backup.sh
sudo docker compose --env-file .env -f deploy/docker-compose.yml ps
```

Keep the backup off-host and confirm that the target release and images exist.
Do not delete `postgres_data` or run `docker compose down -v`.

## Upgrade remote Agents

After the Control Plane is upgraded, older Agents show **Update available** in
the Servers page. Use **Update Agent** for one canary server first, confirm its
heartbeat/version, then update the remaining servers in small batches.

Agent updates verify the signed manifest, target OS/architecture, size and
SHA-256 before activation. A failed verification does not activate the binary.

## Verify after upgrading

```bash
cd /opt/datrixops
sudo docker compose --env-file .env -f deploy/docker-compose.yml ps
sudo docker compose --env-file .env -f deploy/docker-compose.yml logs --tail=200
curl -fsS http://127.0.0.1/health/ready
```

Test administrator login, server heartbeats, metrics, alerts and website/TLS
checks. If migration or readiness fails, keep the database volume intact and
follow [Backup and restore](BACKUP_RESTORE.md).

## Optional update check

```bash
sudo /opt/datrixops/deploy/upgrade.sh --check
```

Automatic daily upgrades are available, but manual staged upgrades are safer
for production installations:

```bash
sudo /opt/datrixops/deploy/upgrade.sh --enable-auto-update
sudo /opt/datrixops/deploy/upgrade.sh --disable-auto-update
```
