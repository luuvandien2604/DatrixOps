---
title: "Self-Hosted Deployment"
description: "Install and operate DatrixOps Community Edition on your infrastructure."
---

DatrixOps Community Edition consists of a self-hosted **Control Plane** and an
Agent installed on every monitored server. PostgreSQL data, metrics, audit
history and configuration stay on infrastructure you manage.

## Install the Control Plane

Recommended host: Linux, 1 CPU, 2 GB RAM, 20 GB disk and inbound TCP port 7800. Run:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/bootstrap.sh | sudo bash
```

The installer prepares Docker, Caddy, secrets, signed Agent artifacts, database
migrations and containers. It creates the first administrator automatically
and prints the credentials. Open `http://<IP>:7800/login` to sign in.

## Operational responsibility

You are responsible for DNS/TLS, firewall rules, backups, upgrades, storage
capacity and host access. DatrixOps does not require sending operational data
to a hosted SaaS service.

## Upgrade

```bash
sudo /opt/datrixops/deploy/upgrade.sh
```

The script creates a backup, updates images and migrations, then checks
readiness. For remote Agents, use **Update Agent** on one canary server before
updating the rest of the fleet.
