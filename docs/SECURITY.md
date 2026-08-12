# Security

## Self-hosting baseline

- Use HTTPS for domain deployments.
- Keep `/opt/datrixops/.env` and backup archives mode `0600` and off Git.
- Use unique high-entropy PostgreSQL and JWT secrets.
- Keep PostgreSQL on the internal Compose network.
- Restrict host SSH, Docker and sudo access.
- Store backups encrypted and off-host; test restore regularly.

Enrollment tokens are short-lived and single-use. Permanent Agent credentials
are unique per server and stored hashed by new enrollments. Do not share the
installation command generated for a server.

## Signed Agent updates

Agent releases use an Ed25519-signed manifest plus per-artifact size and
SHA-256 verification. The Agent embeds only the public verification key. The
release private key is not installed on self-hosted Control Planes or monitored
servers.

## High-risk features

The following features are disabled by default:

```dotenv
ENABLE_WEB_TERMINAL=false
ENABLE_REMOTE_SCRIPTS=false
ENABLE_SERVICE_CONTROLS=false
ENABLE_READ_ONLY_LOGS=false
```

Enable only what is required. Web Terminal and remote operations run with the
permissions of the Agent service and do not replace SSH/console recovery,
least-privilege hardening or host backups.

## Incident response

If a user/session secret is exposed, rotate it, revoke affected sessions and
inspect audit logs. If an Agent enrollment token is exposed, remove the pending
server registration and generate a new command.

Report vulnerabilities privately through the repository's GitHub Security
Advisories rather than opening a public issue with exploit details.
