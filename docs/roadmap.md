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

- [ ] Monorepo: backend/, agent/, frontend/
- [ ] Docker Compose + PostgreSQL
- [ ] Backend: main.go, Container, HTTP server
- [ ] Backend: platform/ (config, database, logger, middleware, response)
- [ ] Health / Ready / Version endpoints
- [ ] Agent: main.go + config skeleton
- [ ] Frontend: Next.js init
- [ ] README.md, .gitignore

## 🔵 Sprint 2 — Core

- [ ] Module `auth` (login, register, JWT, refresh token)
- [ ] Module `server` (CRUD, agent_token)
- [ ] Agent v1 (heartbeat, OS info)
- [ ] Dashboard v1 (server list, online/offline)

**Cột mốc:** Thêm server → cài agent → nhìn thấy 🟢 online.

---

## 🟢 Sprint 3 — Monitoring

- [ ] Module `metric` (CPU, RAM, Disk, Load Average)
- [ ] Agent v2 (metric collectors)
- [ ] Dashboard: biểu đồ Recharts

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
