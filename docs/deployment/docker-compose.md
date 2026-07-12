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
