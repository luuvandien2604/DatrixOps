---
title: Environment Variables (.env)
description: Complete reference for DatrixOps server configuration and environment settings.
---

# Environment Variables (`.env`)

DatrixOps is configured via an environment file located at `/opt/datrixops/.env`. This reference outlines each supported variable, its default value, and practical examples for customizing your deployment.

---

## Core Server & Gateway Settings

### `CADDY_SITE_ADDRESS`
- **Description**: Defines how Caddy listens for incoming traffic. If a domain name is provided without a port or protocol, Caddy automatically provisions and manages TLS/SSL certificates via Let's Encrypt.
- **Default**: `http://:80`
- **Examples**:
  - `http://203.0.113.10` (Public IP without SSL)
  - `ops.example.com` (Domain with automatic HTTPS on port 443)

### `PUBLIC_URL`
- **Description**: The public-facing origin URL used for browser redirects and Agent API callbacks. Do not include a trailing slash.
- **Default**: *(Derived from `CADDY_SITE_ADDRESS`)*
- **Example**: `https://ops.example.com`

### `ALLOWED_ORIGINS`
- **Description**: Comma-separated list of browser origins permitted to communicate with the backend API via CORS.
- **Default**: Same as `PUBLIC_URL`
- **Example**: `https://ops.example.com,https://admin.example.com`

---

## Security & Authentication

### `JWT_SECRET`
- **Description**: The cryptographic secret key used to sign and verify user authentication tokens and API keys. Must be a secure random string of at least 32 characters.
- **Generation**: `openssl rand -base64 48`
- **Required**: Yes

### `SETUP_TOKEN`
- **Description**: A one-time secret token required by the setup wizard during initial installation. Prevents unauthorized users from hijacking a freshly deployed instance before an admin account is created.
- **Generation**: `openssl rand -hex 32`

### `ENABLE_PUBLIC_REGISTRATION`
- **Description**: Controls whether new users can register on the login page without an invitation from an existing administrator.
- **Default**: `false`
- **Options**: `true` | `false`

---

## Feature Flags

| Variable | Default | Description |
| :--- | :--- | :--- |
| `ENABLE_WEB_TERMINAL` | `true` | Enables the in-browser remote shell terminal over reverse WebSocket. |
| `ENABLE_SERVICE_CONTROLS` | `true` | Allows starting, stopping, and restarting system services from the dashboard. |
| `ENABLE_READ_ONLY_LOGS` | `true` | Allows operators to inspect container and service logs via the web UI. |
| `ENABLE_REMOTE_SCRIPTS` | `true` | Enables running diagnostic script commands from the control plane. |

---

## Data Retention Policies

DatrixOps automatically prunes historical metrics and audit entries to maintain high performance and prevent unbounded disk growth.

### `METRICS_RETENTION_DAYS`
- **Description**: The number of days to keep high-resolution raw time-series metrics (CPU, RAM, disk, network bandwidth, and target probe results).
- **Default**: `7` (Recommended: 7 to 30 days)

### `OPERATIONAL_RETENTION_DAYS`
- **Description**: The number of days to retain incident logs, user audit trail entries, and historical downtime events.
- **Default**: `90`

---

## Versioning & Agent Distribution

### `DATRIXOPS_VERSION`
- **Description**: The version number of the DatrixOps Control Plane currently deployed.
- **Example**: `1.8.73`

### `AGENT_VERSION`
- **Description**: The target agent release version that the control plane advises connected hosts to run.
- **Example**: `1.5.12`

---

## Applying Configuration Changes

Whenever you modify `/opt/datrixops/.env`, restart the stack to apply the new values:

```bash
sudo datrix restart
```

Or using Docker Compose directly:

```bash
cd /opt/datrixops
sudo docker compose --env-file .env -f deploy/docker-compose.yml up -d
```

---

## Next Steps

- Learn how to back up your `.env` configuration in [Backup & Disaster Recovery](/docs/guides/backup-restore).
- Explore command-line management in [The datrix CLI](/docs/reference/cli).
