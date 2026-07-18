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

## Production

Chi tiết sẽ được bổ sung khi đến Sprint tương ứng.

Dự kiến:
- Docker Compose cho tất cả services (backend, frontend, PostgreSQL, Caddy).
- Caddy reverse proxy + auto SSL (Let's Encrypt).
- GitHub Actions CI/CD: push to main → build images → deploy.

## Web Terminal proxy requirement

The reverse proxy in front of DatrixOps must forward HTTP Upgrade requests for
both `/api/v1/terminal/browser` and `/api/v1/agent/terminal`, preserve the
public `Host` through `X-Forwarded-Host`, and use a read timeout longer than the
30-minute terminal limit. TLS termination is required in production so both
channels use `wss://`.

The current terminal hub is in-memory and targets the single-backend deployment
in `docker-compose.prod.yml`. A multi-replica backend must add sticky routing or
a shared terminal broker before scaling horizontally.
