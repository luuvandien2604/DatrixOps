# DatrixOps — Roadmap

> Lộ trình phát triển theo module. Dừng ở bất kỳ giai đoạn nào, công cụ vẫn sử dụng được.
> Để việc sử dụng hằng ngày quyết định tính năng tiếp theo.

---

## Quy trình phát triển mỗi Module (6 bước)

1. **Feature Spec** → `docs/features/{module}.md`
2. **Database** → Migration
3. **API** → Cập nhật `docs/api/rest-api.md`
4. **Backend** → handler, service, repository, routes
5. **Frontend** → Pages, components
6. **Testing** → Happy path, error path

---

## 🔵 Sprint 0 — Foundation

- [x] `docs/architecture/system-overview.md`
- [x] `docs/database/schema.md`
- [x] `docs/api/rest-api.md`
- [x] `docs/development/coding-style.md`
- [x] `docs/roadmap.md`

## 🔵 Sprint 1 — Bootstrap

- [x] Monorepo: backend/, agent/, frontend/
- [x] Docker Compose + PostgreSQL
- [x] Backend: main.go, Container, HTTP server
- [x] Backend: platform/ (config, database, logger, middleware, response)
- [x] Health / Ready / Version endpoints
- [x] Agent: main.go + config skeleton
- [x] Frontend: Next.js init
- [x] README.md, .gitignore

## 🔵 Sprint 2 — Core

- [x] Module `auth` (login, register, JWT, refresh token)
- [x] Module `server` (CRUD, agent_token)
- [x] Agent v1 (heartbeat, OS info)
- [x] Dashboard v1 (server list, online/offline)

**Cột mốc:** Thêm server → cài agent → nhìn thấy 🟢 online.

---

## 🟢 Sprint 3 — Monitoring

- [x] Module `metric` (CPU, RAM, Disk, Load Average)
- [x] Agent v2 (metric collectors)
- [x] Dashboard: biểu đồ Recharts

**Cột mốc:** Mở dashboard → thấy CPU 15%, RAM 42%.

---

## 🟢 Sprint 4 — Service Monitoring

- [ ] Module `website` (HTTP ping, latency)
- [ ] Module `ssl` (Certificate expiration check)
- [ ] Scheduler (background jobs cho website + SSL check)

**Cột mốc:** Biết website online/down, SSL còn 45 ngày.

---

## 🟡 Sprint 5 — Infrastructure

- [ ] Module `docker` (container list, status)
- [ ] Agent v3 (docker collector)
- [ ] Module `process` (top processes)

**Cột mốc:** Biết container nào đang chạy, process nào ngốn tài nguyên.

---

## 🟠 Sprint 6 — Automation

- [ ] Module `alert` (rule engine, Telegram notification)
- [ ] Module `script` (chạy lệnh từ xa qua Agent)

**Cột mốc:** Nhận Telegram khi disk đầy. Restart service từ dashboard.

---

## 🔴 Future (Thêm khi có nhu cầu thực tế)

- Log viewer
- SSH shortcut
- Backup status
- Package updates
- GPU metrics
- Kubernetes
- Proxmox / VMware

Xem thêm: `docs/decisions/future-ideas.md`
