# Installation

## Requirements

- Fresh Linux server: Ubuntu 20.04/22.04/24.04, Debian 12, or
  CentOS/RHEL/Rocky Linux.
- At least 1 CPU, 2 GB RAM and 20 GB disk.
- Inbound TCP port 7800 for the initial IP-based panel.
- Outbound HTTPS access to GitHub and GHCR.
- Root or sudo access.

The bundled gateway maps the initial panel to TCP port 7800 and leaves active
host Nginx or Apache services unchanged.

## Install the Control Plane

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/bootstrap.sh | sudo bash
```

The installer:

1. Installs required host tools and Docker Engine/Compose v2 when missing.
2. Downloads DatrixOps into `/opt/datrixops`.
3. Generates `/opt/datrixops/.env` with mode `0600`.
4. Configures Caddy for the detected IP or supplied domain.
5. Downloads and verifies the signed Agent release.
6. Pulls version-pinned images, runs migrations and starts all services.

The installer uses the exact Agent version and release tag pinned by the CE
Server metadata. CE Server and Agent versions are independent; do not assume
the Agent version equals the Server version.

To choose another panel port, preserve the variable through `sudo`:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/bootstrap.sh \
  | sudo DATRIXOPS_PANEL_PORT=17800 bash
```

For an IP installation, open `http://<server-ip>:7800/login`. The installer
creates the first local administrator and prints its email and random password
at completion. The default administrator is `admin@datrixops.local`; set
`DATRIXOPS_ADMIN_EMAIL` when running the installer to override it. A root-readable
copy is stored at
`/opt/datrixops/.admin-credentials` with mode `0600`. Public signup remains
disabled. Run `datrix` as root to open the management menu, or `datrix info`
to show the login URL and saved credentials. Use `datrix reset-password` if
the saved password is unavailable. From a non-root shell, run `sudo datrix`.

## Verify the installation

```bash
cd /opt/datrixops
sudo docker compose --env-file .env -f deploy/docker-compose.yml ps
curl -fsS http://127.0.0.1:7800/health/ready
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
