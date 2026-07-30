# Upgrade

Run upgrades from a clean working tree:

```bash
./deploy/upgrade.sh
```

The script creates a logical database/config backup, fast-forwards source,
fetches the configured signed Agent release, rebuilds images, runs the single
migration container, starts services and waits for readiness. If readiness
fails it rebuilds the previous revision.

Migrations are recorded in `schema_migrations` with a SHA-256 checksum and run
inside a transaction. Never edit a migration that has shipped; add a new
versioned migration.

Upgrade does not remove named volumes. Never use `docker compose down -v` for
an upgrade. Review release notes and migration notes before changing major
versions.
