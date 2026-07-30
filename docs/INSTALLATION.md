# Installation

## Host prerequisites

- Ubuntu 22.04/24.04 or Debian 12.
- Docker Engine and Docker Compose v2.
- At least 2 CPU, 2 GB RAM and 20 GB persistent disk for a small deployment.
- A DNS A/AAAA record pointing to the host.
- TCP 80 and 443 inbound; outbound HTTPS for images and Agent releases.

PostgreSQL and Backend are internal Compose services. Do not publish port 5432
or 8080. Only Caddy exposes 80/443.

## Install

```bash
git clone https://github.com/luuvandien2604/DatrixOps.git
cd DatrixOps
cp deploy/.env.example .env
./deploy/generate-secrets.sh
```

Set these values in `.env`:

```dotenv
DATRIXOPS_DOMAIN=monitor.example.com
PUBLIC_URL=https://monitor.example.com
ALLOWED_ORIGINS=https://monitor.example.com
AGENT_VERSION=1.0.0
```

Then run `./deploy/install.sh`. The script validates configuration, downloads
and verifies the versioned Agent artifacts, runs the migration container,
builds the application and prints service state.

Open `/setup`. The one-time wizard verifies the database, creates the first
administrator, and stores the system name, IANA timezone and public URL.
Public registration is disabled by default and setup locks after the first
account exists.

## Storage and logs

- Database: Compose volume `postgres_data`.
- Caddy certificates/state: `caddy_data` and `caddy_config`.
- Application configuration: `.env` (mode 0600).
- Logs: `docker compose -f deploy/docker-compose.yml logs`.
- Container logs rotate at 10 MB, five files per container.

Keep `.env` and backups outside public web roots.
