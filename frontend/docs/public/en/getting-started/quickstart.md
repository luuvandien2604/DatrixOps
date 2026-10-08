---
title: Quickstart Deployment
description: Deploy DatrixOps using Docker Compose and complete initial administrator setup.
---

# Quickstart Deployment

This guide walks you through deploying your own DatrixOps control plane instance. In just a few minutes, you will have the server stack running, secured, and ready to accept agent connections.

---

## System Requirements

Before you begin, ensure your target server meets the following specifications:

- **Operating System**: A clean installation of Ubuntu 22.04/24.04 LTS, Debian 12, or Rocky Linux 9.
- **Hardware Resources**:
  - Minimum: 1 vCPU, 2 GB RAM, 20 GB free disk space.
  - Recommended for fleets over 50 servers: 2 vCPU, 4 GB RAM, 50 GB SSD.
- **Network Ports**:
  - Inbound TCP `80` (HTTP) and `443` (HTTPS).
  - Outbound Internet access for downloading Docker images and packages.

---

## Method 1: Automated Installation (Recommended)

The automated bootstrap script installs Docker, configures directories, sets up environment variables, and launches the application stack with automatic TLS certificates via Caddy.

### Step 1: Run the Bootstrap Script

Log in to your server via SSH as `root` (or a user with `sudo` privileges) and execute:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/bootstrap.sh | sudo bash
```

### Step 2: Configure Setup Options

During the installation prompt:
1. **Choose Access Mode**:
   - **Public IP Mode**: Access directly via `http://<your-server-ip>`.
   - **Custom Domain Mode**: Enter your fully qualified domain name (e.g., `ops.example.com`). Ensure your DNS A/AAAA record points to your server IP; Caddy will automatically provision and renew Let's Encrypt SSL certificates.
2. **Administrator Account**:
   - Provide your preferred administrator email and password, or choose the auto-generated secure credentials.

Once the process finishes, the script outputs your login URL and temporary credentials.

---

## Method 2: Manual Docker Compose Deployment

If you prefer to manage container configurations manually:

### Step 1: Clone the Repository

```bash
git clone https://github.com/luuvandien2604/DatrixOps.git /opt/datrixops
cd /opt/datrixops
```

### Step 2: Configure Environment Variables

Copy the example configuration file:

```bash
cp .env.example .env
```

Open `.env` in your text editor and customize the primary settings:

```ini
# Base domain or IP
CADDY_SITE_ADDRESS=http://192.168.1.100

# Backend authentication secret (generate with: openssl rand -hex 32)
JWT_SECRET=your_super_secret_jwt_key_here

# SQLite database storage directory
DATA_DIR=/opt/datrixops/data
```

### Step 3: Launch Containers

Start the containers in detached mode:

```bash
sudo docker compose -f deploy/docker-compose.yml up -d
```

Verify that all services are healthy:

```bash
sudo docker compose -f deploy/docker-compose.yml ps
```

---

## First-Time Administrator Login

1. Open your web browser and navigate to:
   - `http://<your-server-ip>` (if using Public IP mode)
   - `https://<your-domain>` (if using Domain mode)
2. If this is a fresh setup and no admin was created during installation, the **Setup Wizard** will appear asking you to:
   - Enter your **Email address**.
   - Set a strong **Password** (minimum 8 characters).
   - Enter your **Full Name**.
3. Click **Complete Setup** to initialize your dashboard.
4. You will be redirected to the **Overview** page (`/dashboard`).

> [!TIP]
> If you ever forget your administrator password, run `sudo datrix reset-password` from your server's command line to reset it instantly.

---

## Using the `datrix` Server Management Tool

DatrixOps includes a companion management CLI installed at `/usr/local/bin/datrix`. Run it at any time on your server:

```bash
sudo datrix
```

An interactive menu appears with essential management actions:
- **View Status**: Check health states of the frontend, backend, and database.
- **Show Access Info**: Display login URLs and administrative details.
- **Reset Admin Password**: Quickly reset login credentials without touching the database.
- **View Live Logs**: Stream container logs in real time.
- **Restart Services**: Safely restart the Docker stack.
- **Create Backup**: Perform an on-demand database backup.

---

## Next Steps

Now that your DatrixOps server is up and running:
- Follow [Adding Monitored Servers](/docs/getting-started/add-server) to connect your first Linux, macOS, or Windows host.
- Review [Environment Variables (.env)](/docs/reference/configuration) for advanced configuration options.
