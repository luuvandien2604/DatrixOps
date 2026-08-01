# Installation

## Host Requirements

- Ubuntu 20.04/22.04/24.04, Debian 12, or CentOS/RHEL/Rocky Linux.
- At least 1 CPU, 2 GB RAM and 20 GB persistent disk space for a standard deployment.
- Inbound TCP ports 80 and 443; outbound HTTPS access for downloading container images and Agent release packages.

## Automated Installation (Recommended)

Run the automated 1-liner installer as root on your VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/install.sh | sudo bash
```

The installer script automatically handles the entire setup:
1. Installs Docker Engine, Docker Compose v2, and Nginx if they are not already installed on the server.
2. Auto-detects your VPS Public IP address (or prompts for a custom domain) and configures `.env` with secure generated secrets.
3. Downloads pre-compiled, signed Agent release binaries or compiles them locally if online releases are unavailable.
4. Executes database migrations and starts DatrixOps containers in detached mode (`docker compose up -d`).

## Manual / Git Installation

If you are setting up a development instance or cloning the repository manually:

```bash
git clone https://github.com/luuvandien2604/DatrixOps.git
cd DatrixOps
./deploy/install.sh
```

## Initial Setup Wizard

1. Open `http://<your-vps-ip>/setup` (or `https://<your-domain>/setup`) in your web browser.
2. The setup wizard verifies database connectivity, locks public registration, and creates the first administrator account.
3. Once created, log in to access the DatrixOps Control Plane.

## Storage and Logs

- **Database:** Stored in named Docker volume `postgres_data`.
- **Caddy Certificates:** Stored in `caddy_data` and `caddy_config`.
- **Configuration:** Stored in `.env` (mode 0600).
- **View Container Logs:** `docker compose -f deploy/docker-compose.yml logs -f`

Container logs are configured to automatically rotate at 10 MB per file, keeping up to 5 historical log files per container.
