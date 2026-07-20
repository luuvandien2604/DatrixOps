# DatrixOps — Deployment Guide

> Hướng dẫn triển khai DatrixOps trên cloud server cá nhân.

## Yêu cầu

- Ubuntu 22.04+ hoặc Debian 12+
- Docker & Docker Compose v2
- Tên miền (domain) trỏ về IP server (tùy chọn, cho SSL)

## Development (Local)

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/datrixops.git
cd datrixops

# Khởi động PostgreSQL
docker compose up -d

# Chạy backend
cd backend
go run ./cmd/api

# Chạy frontend (terminal khác)
cd frontend
npm run dev
```

## Production gateway

`docker-compose.prod.yml` exposes Caddy on host port `3000`. Frontend is
internal-only on `frontend:3000`; Caddy sends `/api/v1/*` directly to
`backend:8080` and sends all other requests to Frontend. Keep the existing
Cloudflare Tunnel or external TLS proxy pointed at `http://127.0.0.1:3000`.

When upgrading a deployment that previously exposed Frontend directly on port
3000, stop that old container before starting the new gateway:

```bash
docker compose -f docker-compose.prod.yml stop frontend
docker compose -f docker-compose.prod.yml up -d --build
```

This one-time port handoff prevents a bind conflict. Future deployments can use
the normal `up -d --build` command.

## Web Terminal proxy requirement

The bundled Caddy gateway forwards HTTP Upgrade requests for both
`/api/v1/terminal/browser` and `/api/v1/agent/terminal`, preserves the public
host, and keeps WebSocket streams open. TLS must still terminate at Cloudflare
or another public proxy so both channels use `wss://`.

Do not point the public origin directly at the Next.js Frontend. Next rewrites
remain a development fallback for ordinary HTTP API calls; they are not the
production WebSocket gateway.

Web Terminal is supported only for Linux server Agents. Windows, macOS, and
Linux desktop/personal-workstation Agents report an explicit unsupported state;
the dashboard disables Start Terminal and explains why. On an intentionally
headless Linux host whose default target is incorrectly set to
`graphical.target`, set `DATRIXOPS_TERMINAL_MODE=server` in the Agent service
environment to opt in.

The current terminal hub is in-memory and targets the single-backend deployment
in `docker-compose.prod.yml`. A multi-replica backend must add sticky routing or
a shared terminal broker before scaling horizontally.
