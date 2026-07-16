# AGENTS.md — DatrixOps System Context

> File này dành cho AI coding agent (Claude Code, Cursor, Copilot...) đọc trước khi debug hoặc code trong repo này. Nội dung là sự thật đối chiếu trực tiếp với source, không phải kế hoạch/roadmap.

## 1. Hệ thống là gì

DatrixOps là công cụ giám sát & quản lý VPS cá nhân, gồm 3 thành phần trong 1 monorepo:

```
Browser → Frontend (Next.js, :3000) → Backend API (Go net/http, :8080) → PostgreSQL
                                              ↑
                              Agent (Go binary, chạy trên từng VPS qua systemd)
                              gửi heartbeat mỗi 10s → /api/v1/agent/heartbeat
```

Backend là **1 process Go duy nhất** — không có microservice, scheduler chạy bằng goroutine ngay trong process backend (`backend/cmd/api/main.go`).

## 2. Cấu trúc thư mục

```
backend/
  cmd/api/main.go              # entrypoint — MỌI module mới phải đăng ký route ở đây
  internal/core/<module>/      # mỗi module: handler.go + service.go + repository.go + routes.go
    auth/ server/ agent_api/ alert/ website/ apikey/ audit/ admin/
  internal/platform/           # hạ tầng dùng chung: config, database, middleware, response, notifier, logger
  internal/scheduler/          # alert_job.go (1p/lần), website_job.go
  migrations/                  # *.sql, auto-chạy mỗi lần backend start (KHÔNG chạy tay)

agent/
  cmd/agent/main.go            # vòng lặp heartbeat + xử lý task + auto-update
  internal/collector/          # thu thập CPU/RAM/Disk/Net (collector.go), Docker (docker.go), snapshot (snapshot.go)
  internal/client/http.go      # gọi API backend
  internal/config/config.go    # đọc env: DATRIXOPS_SERVER_URL, DATRIXOPS_AGENT_TOKEN, DATRIXOPS_INTERVAL

frontend/
  src/app/dashboard/           # các trang UI, xem mục 5
  src/lib/apiClient.ts         # HTTP client gọi backend
  src/lib/docs.ts              # đọc file .md trong docs/user-guide/ để render trang /docs

docs/user-guide/               # docs cho người dùng, đọc bởi frontend/src/lib/docs.ts (frontmatter title/description/role/order)
```

## 3. Hai cơ chế auth — ĐỪNG NHẦM khi debug 401

| Loại | Dùng cho | Header | Verify ở đâu |
|---|---|---|---|
| JWT | Frontend → mọi API `/api/v1/*` (trừ agent) | `Authorization: Bearer <jwt>` | `middleware.RequireAuth`, verify bằng `JWT_SECRET` |
| Agent Token | Agent → `/api/v1/agent/heartbeat`, `/api/v1/agent/tasks/result` | `Authorization: Bearer <agent_token>` | So trực tiếp cột `servers.agent_token` trong `agent_api/handler.go`, KHÔNG qua middleware chung |

Lỗi 401 trên endpoint agent ≠ JWT hết hạn. Luôn kiểm tra `SELECT agent_token FROM servers WHERE id=...` trước.

## 4. Database — sự thật theo migration, KHÔNG theo docs/database/schema.md (doc đó là plan cũ, sai lệch)

```
users(id, email, password_hash, role)                     -- role thêm sau ở 008
refresh_tokens(id, user_id FK, token, expires_at)
servers(id, user_id FK, name, ip_address, agent_token UNIQUE, status, os_info JSONB,
        snapshot JSONB DEFAULT '{}', group_name, tags JSONB)   -- snapshot chứa processes/services/docker
server_metrics(id, server_id FK, cpu_usage, memory_used, memory_total, net_in, net_out, disk_read, disk_write, created_at)
server_tasks(id, server_id FK, type, payload JSONB, status[pending|processing|completed|failed], result JSONB)
alert_rules(id, user_id FK, server_id FK nullable, metric, operator, threshold, duration_minutes, enabled)
alert_channels(id, user_id FK, type[discord|telegram], config JSONB, enabled)
alert_state(rule_id FK, server_id FK, status, last_triggered_at)   -- PK kép (rule_id, server_id)
websites(id, user_id FK, name, url, status, ssl_issuer, ssl_valid_to, ssl_days_remaining, last_check)
audit_logs(id, user_id FK, action, resource_type, resource_id, details JSONB)
api_keys(id, user_id FK, name, key_hash UNIQUE, last_used_at)   -- key gốc KHÔNG lưu, không recover được
```

Migration mới → thêm file `backend/migrations/YYYYMMDD_NNN_*.sql`, tự chạy khi backend start qua `db.AutoMigrate()`. Không cần chạy tay, không cần migration tool riêng.

## 5. Feature ↔ File map (tính năng ĐANG hoạt động thật)

| Feature | Frontend | Backend route file | Backend logic | DB table |
|---|---|---|---|---|
| Auth | `app/login`, `app/register` | `core/auth/routes.go` | `auth/handler.go` | `users`, `refresh_tokens` |
| Server list/detail | `dashboard/servers/page.tsx`, `servers/[id]/page.tsx` | `core/server/routes.go` | `server/handler.go` | `servers` |
| Metrics chart | tab Overview trong `servers/[id]`, `dashboard/monitoring/page.tsx` | `server/routes.go` (`ListMetrics`) | `server/handler.go` | `server_metrics` |
| Docker actions (start/stop/restart/logs) | tab Docker trong `servers/[id]` | `server/routes.go` (`CreateTask`/`GetTask`) | `server/handler.go` + `agent_api/handler.go` | `server_tasks` |
| Update Agent | nút trên `dashboard/servers/page.tsx` | cùng route `CreateTask`, `type: agent_update` | `agent_api/handler.go` (`Heartbeat` so version) | `server_tasks` |
| Alerts | `dashboard/alerts/page.tsx` | `core/alert/routes.go` | `alert/handler.go` + `scheduler/alert_job.go` (chạy mỗi 1 phút) | `alert_rules`, `alert_channels`, `alert_state` |
| Websites & SSL | `dashboard/websites/page.tsx` | `core/website/routes.go` | `website/handler.go` + `scheduler/website_job.go` | `websites` |
| API Keys | `dashboard/manage/api/page.tsx` | `core/apikey/routes.go` | `apikey/handler.go` | `api_keys` |
| Audit Log | `dashboard/manage/audit/page.tsx` | `core/audit/routes.go` | `audit/handler.go` | `audit_logs` |
| Admin (superadmin) | chưa có UI | `core/admin/routes.go` | `admin/handler.go` | `users.role` |

**Chưa hoạt động (chỉ là `<Construction />` placeholder trong frontend, KHÔNG code backend tương ứng):** Network, Performance, Security, Logs, Manage → Backup, Manage → Config, Manage → Users, Manage → Servers.

## 6. Agent — vòng lặp chi tiết (`agent/cmd/agent/main.go`)

1. Start → gửi heartbeat ngay + snapshot đầy đủ.
2. Sau đó mỗi `DATRIXOPS_INTERVAL` giây (mặc định **10s**) → gửi heartbeat cơ bản (CPU/RAM/Net/Disk).
3. Snapshot đầy đủ (processes/services/docker) chỉ gửi lại **mỗi 60 giây**.
4. Backend trả `{ update_required, tasks[] }` trong MỌI response heartbeat.
5. Task nhận được → `go processTask()` chạy song song, không block heartbeat tiếp theo.
6. Task types hỗ trợ: `docker_start`, `docker_stop`, `docker_restart`, `docker_logs`, `agent_update`.
7. `update_required = true` khi `req.Version != "1.1.0"` (**hard-code** trong `agent_api/handler.go`, không đọc config/DB).
8. Update = tải script cài lại + `os.Exit(0)` → systemd (`Restart=always`) tự khởi động lại bằng binary mới. Không có "restart" riêng biệt, không có rollback.

### ⚠️ Bug/gotcha đã biết khi test local
Agent gọi `{ServerURL}/agent/heartbeat`, KHÔNG tự thêm `/api/v1`. Production set `DATRIXOPS_SERVER_URL=https://host/api/v1` qua `scripts/publish-agent.sh`, nhưng default trong `agent/internal/config/config.go` là `http://localhost:8080` (thiếu `/api/v1`). Test local phải set thủ công:
```bash
export DATRIXOPS_SERVER_URL=http://localhost:8080/api/v1
```

## 7. Playbook debug theo triệu chứng

| Triệu chứng | Kiểm tra |
|---|---|
| Server Offline dù VPS sống | `journalctl -u datrix-agent -f`; check URL request có `/api/v1` không; check `agent_token` khớp DB |
| Heartbeat 401 | Không phải JWT — so `servers.agent_token` với header gửi lên |
| Metric không lên dù Online | `SELECT * FROM server_metrics WHERE server_id=... ORDER BY created_at DESC LIMIT 5;` — lỗi insert bị `println`, không fail request nên dễ bị bỏ sót |
| Tab Docker trống | Snapshot chỉ gửi mỗi 60s — đợi hoặc `SELECT snapshot FROM servers WHERE id=...` |
| Task (Docker action / Update Agent) không chạy | Model là **poll**, không push — độ trễ tối đa = `DATRIXOPS_INTERVAL`; check `SELECT status,result FROM server_tasks WHERE server_id=... ORDER BY created_at DESC;` |
| Alert không gửi | `alert_rules.enabled` và `alert_channels.enabled` phải `true`; job chạy mỗi 1 phút, log có `component=AlertJob` |
| Agent không tự lên lại sau update | `systemctl status datrix-agent` — cần `Restart=always` |

## 8. Chạy dev local

```bash
docker compose up -d                                   # Postgres :5432
cd backend && go run ./cmd/api                          # :8080, auto-migrate khi start
cd frontend && npm run dev                               # :3000, NEXT_PUBLIC_API_URL → /api/v1
cd agent && DATRIXOPS_AGENT_TOKEN=<token> \
  DATRIXOPS_SERVER_URL=http://localhost:8080/api/v1 \
  go run ./cmd/agent
```

## 9. Khi thêm tính năng mới — quy tắc bắt buộc

1. **Bảng DB mới** → file migration mới trong `backend/migrations/`, tên `YYYYMMDD_NNN_*.sql`.
2. **API mới** → package mới trong `backend/internal/core/<module>/` theo đúng pattern 4 file (`handler.go`/`service.go`/`repository.go`/`routes.go`), rồi gọi `RegisterRoutes(mux, ...)` trong `backend/cmd/api/main.go`.
3. **Agent thu thập thêm field** → sửa `agent/internal/collector/`, và field JSON phải khớp CHÍNH XÁC ở cả agent (`agent/internal/client/http.go`) lẫn backend (`backend/internal/core/agent_api/handler.go`) — 2 struct riêng biệt, không dùng chung type.
4. **Agent chạy hành động mới** → thêm `case` trong `processTask()` (`agent/cmd/agent/main.go`), và đảm bảo phía tạo task cho phép `type` đó.
5. **Route Frontend đã có nhưng chưa code** → các trang "Under Construction" liệt kê ở mục 5, chỉ cần xoá `<Construction />` và viết logic thật.
6. **Docs cho người dùng** → thêm file `.md` với frontmatter `title/description/role/order` vào `docs/user-guide/`, rồi thêm entry vào mảng `docsNavigation` trong `frontend/src/app/docs/layout.tsx` để hiện trên sidebar (thêm file .md không tự động hiện trên sidebar, sidebar là mảng hard-code).

## 10. Điểm dễ gây nhầm lẫn khi đọc repo (đã xác minh thực tế, không phải giả định)

- `docs/database/schema.md` là **plan cũ**, KHÔNG khớp migration thật — luôn tin migration, không tin file doc đó.
- CORS đang mở `Access-Control-Allow-Origin: *` (`backend/internal/platform/middleware/`) — cân nhắc khi debug lỗi liên quan bảo mật/cross-origin.
- `role: "admin"` trong frontmatter docs **không thực sự chặn quyền xem trang chi tiết** — chỉ ẩn khỏi danh sách `/docs`, trang `/docs/{slug}` vẫn truy cập trực tiếp được nếu biết URL (xem `frontend/src/app/docs/[slug]/DocViewer.tsx`).
