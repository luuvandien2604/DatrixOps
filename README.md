# DatrixOps

> **Build small. Design for growth.**
> **Only implement what you need today. Design so tomorrow is easy.**

Personal Infrastructure Manager — Công cụ quản lý hạ tầng cá nhân dành cho những người quản lý VPS/Cloud Server.

## Mục tiêu

Thay vì SSH vào từng máy để kiểm tra CPU, RAM, Disk, Docker containers hay SSL certificates, DatrixOps tập trung tất cả vào một dashboard duy nhất.

## Tech Stack

| Thành phần | Công nghệ |
| :--- | :--- |
| Frontend | Next.js + TypeScript + Tailwind CSS |
| Core API | Go (`net/http` Go 1.22+) |
| Agent | Go (single binary) |
| Database | PostgreSQL |
| Deploy | Docker Compose |
| CI/CD | GitHub Actions |

## Kiến trúc

```
                 Browser
                    │
             Next.js Dashboard
                    │
              REST API (Go)
                    │
              PostgreSQL
                    │
        ┌───────────┴───────────┐
        │                       │
   Agent (Go)              Scheduler
```

## Tài liệu

- [System Overview](docs/architecture/system-overview.md)
- [Database Schema](docs/database/schema.md)
- [REST API](docs/api/rest-api.md)
- [Coding Style](docs/development/coding-style.md)
- [Roadmap](docs/roadmap.md)
- [ADRs](docs/adr/)

## Development

```bash
# Khởi động PostgreSQL
docker compose up -d

# Chạy backend
cd backend && go run ./cmd/api

# Chạy frontend
cd frontend && npm run dev
```

## License

MIT
