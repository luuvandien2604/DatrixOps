# Installation

## Requirements

- Fresh Linux server: Ubuntu 20.04/22.04/24.04, Debian 12, or
  CentOS/RHEL/Rocky Linux.
- At least 1 CPU, 2 GB RAM and 20 GB disk.
- Inbound TCP port 80 (HTTP) and port 443 (HTTPS).
- Outbound HTTPS access to GitHub and GHCR.
- Root or sudo access.

## Install the Control Plane

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/bootstrap.sh | sudo bash
```

The installer:

1. Installs required host tools and Docker Engine/Compose v2 when missing.
2. Downloads DatrixOps into `/opt/datrixops`.
3. Prompts for Access Mode: **Public IP** (`http://<server-ip>`) or **Custom Domain** (`https://<domain>`).
4. Prompts for initial **Administrator Username** (default `admin`) and **Password** (min 12 characters, or auto-generates).
5. Generates `/opt/datrixops/.env` with mode `0600`.
6. Configures Caddy Gateway with automated TLS certificate management for domain setups.
7. Downloads and verifies the signed Agent release.
8. Pulls version-pinned images, runs migrations and starts all services.

The generated environment includes a one-time setup token used by the local
installer to create the first administrator. Agent self-monitoring is installed
only from the signed release bundle; there is no unsigned binary fallback.

The installer uses the exact Agent version and release tag pinned by the CE
Server metadata. CE Server and Agent versions are independent; do not assume
the Agent version equals the Server version.

To automate non-interactive installations, environment variables can be provided:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/bootstrap.sh \
  | sudo DATRIXOPS_ADMIN_USERNAME=myadmin DATRIXOPS_ADMIN_PASSWORD=my_secure_password_123 bash
```

Open `http://<server-ip>/login` (or `https://<domain>/login`) to sign in.
The administrator password is shown once at the end of installation if auto-generated,
and is never stored in plaintext. The root-readable `/opt/datrixops/.admin-credentials`
file contains only the username. Public signup remains disabled.

Run `datrix` as root to open the management menu, or `datrix info` to show the login URL
and username. Use `datrix reset-password` if the password is lost. From a non-root shell, run `sudo datrix`.

## Verify the installation

```bash
cd /opt/datrixops
sudo docker compose --env-file .env -f deploy/docker-compose.yml ps
curl -fsS http://127.0.0.1/health/ready
```

Inspect logs if a service is not healthy:

```bash
sudo docker compose --env-file .env -f deploy/docker-compose.yml logs --tail=200
```

## Add an Agent

Open **Dashboard → Servers → Add Server**, select the target platform and copy
the generated command. Do not reuse a command from another server or paste its
enrollment token into chat, tickets or Git.

The Linux service is named `datrixops-agent.service`. Agents initiate outbound
HTTPS connections to the Control Plane; normal metrics collection does not
require an inbound port on the monitored host.

## Important paths

| Item | Path |
| --- | --- |
| Application | `/opt/datrixops` |
| Secrets and runtime config | `/opt/datrixops/.env` |
| Agent config on Linux | `/etc/datrixops/agent.env` |
| Agent binary on Linux | `/usr/local/bin/datrixops-agent` |
| Database | Docker volume `postgres_data` |
