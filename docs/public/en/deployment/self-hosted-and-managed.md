---
title: "Self-hosted and Managed"
description: "Compare deployment models, install the DatrixOps Control Plane, and understand operational ownership."
---

DatrixOps always consists of a **Control Plane** and one or more **Agents**.
The deployment model determines who operates the Control Plane. An Agent is
still installed on every monitored server.

## Check the active deployment model

Open **Workspace settings → Deployment & data ownership**:

- **SELF-HOSTED:** the Control Plane and PostgreSQL run on infrastructure controlled by your organization.
- **MANAGED:** a provider operates the Control Plane for you.

The page also shows the public URL, Agent version, retention, registration
policy, and advanced feature flags.

`DEPLOYMENT_MODE` is descriptive metadata. Changing it does not move the
database or turn a single-instance deployment into a multi-tenant SaaS service.

## How the models differ

| Area | Self-hosted | Managed |
| --- | --- | --- |
| Control Plane | Installed on your VPS | Operated by a provider |
| Database and metrics | Stored on your infrastructure | Subject to provider infrastructure and policy |
| TLS, backup, upgrades | Your responsibility | Provider responsibility |
| Agent installation | Required | Required |
| Agent destination | Your own domain | Service domain |

## Install a self-hosted Control Plane

Recommended host: Ubuntu 22.04/24.04 or Debian 12, Docker Engine, Docker Compose
v2, 2 CPU, 2 GB RAM, 20 GB disk, DNS, and inbound TCP 80/443.

```bash
git clone https://github.com/luuvandien2604/DatrixOps.git
cd DatrixOps
cp deploy/.env.example .env
./deploy/generate-secrets.sh
```

Configure:

```dotenv
DATRIXOPS_DOMAIN=monitor.example.com
PUBLIC_URL=https://monitor.example.com
ALLOWED_ORIGINS=https://monitor.example.com
DEPLOYMENT_MODE=self-hosted
AGENT_VERSION=1.5.2
```

Install:

```bash
./deploy/install.sh
```

Open `https://monitor.example.com/setup`, create the first administrator, choose
the timezone, and confirm the public URL. Setup is one-time and public
registration is closed by default.

## Add a server and Agent

1. Open **Servers → Add Server**.
2. Generate the enrollment command for the target operating system.
3. Run it as `root`, with `sudo`, or in Administrator PowerShell.
4. The enrollment token is single-use; the Agent receives its own credential.
5. Wait for **Online** and confirm CPU, memory, and disk data.

Never reuse one server's token on another server.

## Self-hosted operational responsibilities

Backup:

```bash
./deploy/backup.sh
```

Safe upgrade with a pre-upgrade backup:

```bash
./deploy/upgrade.sh
```

Inspect:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml ps
docker compose --env-file .env -f deploy/docker-compose.yml logs --tail=200
```

Keep `.env` and backups outside the web root, restrict SSH, never publish
PostgreSQL port 5432, and enable Web Terminal or remote scripts only after a
security review.

## When to choose Managed

Choose Managed when you do not want to operate TLS, PostgreSQL, backups,
upgrades, or Control Plane uptime. Confirm data residency, retention, backup,
support access, and data export terms with the provider.
