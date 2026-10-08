---
title: "Frequently Asked Questions"
description: "Detailed answers on system architecture, Caddy Gateway, SSL certificates, single .env configuration, and DatrixOps features."
---

## 1. Does the Agent push traffic to the Gateway or directly to the internal Backend?

**The Agent ALWAYS connects to the GATEWAY (Caddy), NEVER directly to the Backend.**
- **Security:** The backend container runs purely within Docker's internal bridge network (`expose: 8080`) and is never published directly to the Internet.
- **Reverse Proxy & SSL:** The Gateway (Caddy) is the sole public ingress point (Ports 80/443). It terminates SSL and proxies `/api/*` and `/ws/*` traffic into the internal backend.

---

## 2. How does Caddy issue and renew SSL certificates? Where are certs stored?

- **Issuance & Renewal:** Caddy features an embedded ACME client. When `CADDY_SITE_ADDRESS` is set to a public domain, Caddy automatically obtains free certificates from Let's Encrypt or ZeroSSL. It automatically renews certificates in-memory 30 days before expiration without service downtime.
- **Certificate Storage:**
  - *Inside Container:* `/data/caddy/certificates/...`
  - *On Host VPS:* Stored within the `caddy_data` volume at `/var/lib/docker/volumes/datrixops_caddy_data/_data/caddy/certificates/`.

---

## 3. How many Docker containers are running and what are their roles?

The stack consists of **6 Docker containers** (5 long-running services and 1 one-time migration job):
1. **`gateway` (Caddy):** Ingress reverse proxy on ports 80/443 with automatic HTTPS.
2. **`database` (PostgreSQL 16):** Primary relational and time-series database.
3. **`migrate` (Init Job):** Applies database schema migrations on startup, then exits cleanly.
4. **`backend` (Go API):** Core REST API, WebSocket relay, authentication, and task queue.
5. **`worker` (Go Engine):** Asynchronous background engine for website probing, alerts, and retention pruning.
6. **`frontend` (Next.js 16):** Operator web application interface.

---

## 4. Is the `.env` file shared or separate for Caddy? Why is there a symlink?

- **One Single `.env` File:** All services (Caddy, Backend, Frontend, Worker, Database) read from the central `/opt/datrixops/.env` file.
- **Automatic Symlink:** `/opt/datrixops/deploy/.env` is symlinked to the root `.env` (`deploy/.env -> ../.env`). This guarantees that whether running `datrix` or native `docker compose` commands, the configuration remains 100% unified.

---

## 5. Does DatrixOps require open inbound SSH ports (port 22) on client servers?

**No.** The Agent operates strictly **Outbound-only**. No inbound ports need to be opened on client machines. Web Terminal connects via secure Reverse WebSockets.

---

## 6. What does Network Quality Diagnostics measure?

- **ICMP Ping:** Round-trip latency (RTT) and packet loss percentage (`packet_loss: %`).
- **TCP Socket Connect:** Pure TCP handshake connection latency without synthetic packet loss.
- **Gateway Uplink:** Local default gateway latency to detect local physical switch/cable bottlenecks.
- **Dynamic Tag Groups:** Flexible tag categorization (Domestic, International, DNS, Database).

---

## 7. Which channels are supported by the Alert Center?

DatrixOps supports 3 primary notification channels:
1. **Telegram:** Via Telegram Bot Token and Chat ID.
2. **Discord:** Via Discord Webhook URLs.
3. **Email:** Standard SMTP (Gmail, Outlook, custom mail servers).
Features automated **Auto-Resolve** notifications when systems recover.

---

## 8. How to free up VPS disk space consumed by Docker?

Run these safe cleanup commands on the host:
```bash
# Prune dangling untagged layers
docker image prune -f
# Prune build cache older than 7 days
docker builder prune -f --filter "until=168h"
```
The `datrix update` command automatically runs this cleanup while filtering specifically for DatrixOps project labels.
