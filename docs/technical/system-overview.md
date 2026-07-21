# System Overview

## Mục tiêu và kiến trúc

DatrixOps là monorepo quản lý fleet server nhỏ/trung bình bằng một control plane:

```text
Browser / Agent
  │ HTTPS + WSS
  ▼
Cloudflare/Nginx origin
  │ toàn bộ traffic → host :3000
  ▼
Bundled Caddy gateway
  ├── /api/v1/* → Go backend :8080 ─── PostgreSQL :5432
  └── còn lại   → Next.js frontend :3000
                           ▲
                           │ HTTPS heartbeat + task result
                           │ WSS reverse terminal channel
                      Go Agent trên từng host
```

Backend là một process Go `net/http`. Website và alert scheduler là goroutine trong cùng process, không phải microservice. Repository có `deploy/Caddyfile` và service `gateway` trong production Compose để phân luồng API/Frontend và giữ WebSocket Upgrade. TLS public vẫn do Cloudflare/Nginx hoặc hạ tầng origin quản lý. Public Nginx không được route riêng `/api/` thẳng vào Backend vì sẽ bypass gateway.

## Luồng heartbeat và dữ liệu

1. Agent thu thập CPU, RAM, network, disk và gắn `Version`.
2. Agent gửi `POST /api/v1/agent/heartbeat` với Agent Token.
3. Backend cập nhật `servers`, `last_seen_at`, `os_info`, IP và snapshot/inventory khi có.
4. Backend chèn một hàng `server_metrics`.
5. Backend expire task quá hạn rồi atomically claim tối đa 5 task bằng `FOR UPDATE SKIP LOCKED`.
6. Response trả `latest_version`, `update_available` và task.
7. Agent thực hiện task song song, báo kết quả qua `/api/v1/agent/tasks/result`.

Core metrics gửi theo `DATRIXOPS_INTERVAL` (default source hiện là 5 giây). Full snapshot được Agent chủ động giới hạn khoảng 60 giây.

## Authentication

| Luồng | Credential | Xác minh |
|---|---|---|
| Browser → Backend | JWT HS256 hoặc API key `dtx_…` | `middleware.RequireAuth` |
| Login refresh | Opaque refresh token trong DB | `auth.Service.Refresh` và rotation |
| Agent heartbeat/task result | Per-server Agent Token | Direct lookup `servers.agent_token` |
| Browser terminal ticket | JWT | Ticket endpoint qua `RequireAuth` |
| Agent terminal WebSocket | Agent Token | Terminal hub |

Access token sống 15 phút; refresh token sống 7 ngày và được rotate. Frontend lưu token trong local/session storage và dùng single refresh promise để tránh nhiều refresh đồng thời.

## Server registration

Frontend gọi `POST /api/v1/servers`. Backend sinh `agent_token`, liên kết server với `user_id` và trả dữ liệu để UI dựng installer command. Installer ghi API base URL và token vào systemd unit, launchd plist hoặc Windows batch/Scheduled Task.

## Agent update end-to-end

```text
AGENT_VERSION backend
  → UI báo Update available
  → server_tasks(agent_update, target_version, release_base_url)
  → heartbeat claim task
  → Agent verify manifest/signature/artifact
  → stage/replace + restart
  → heartbeat báo target version
  → Backend chuyển task processing → completed
```

Agent task report `completed` chỉ có nghĩa staging/activation đã được yêu cầu. `ReportTaskResult` giữ update ở `processing`; heartbeat đúng target version mới là confirmation.

## Reverse terminal

Agent Linux headless duy trì WebSocket outbound `/api/v1/agent/terminal`. Browser xin ticket một lần rồi kết nối `/api/v1/terminal/browser`. Backend relay message, lưu `terminal_sessions`, giới hạn một session active/server và Agent giới hạn 30 phút. Agent chỉ phát `session_ready` sau khi PTY/shell được tạo thành công; Frontend không coi browser socket mở là shell đã sẵn sàng.

Linux PTY phải có controlling terminal thật. Acceptance check là `tty` trả `/dev/pts/N`, `ps` hiển thị `TT=pts/N`, `TPGID` khác `-1`, và không còn cảnh báo job control. Shell chạy dưới identity của Agent service; đây là quyền cao và không phải command allowlist.

## Remote Agent removal

Xóa server mặc định là một state machine thay vì hard-delete ngay:

```text
DELETE server → 202 + deletion_status=pending
→ heartbeat claim agent_uninstall
→ Agent chuẩn bị transient systemd helper
→ deletion_status=uninstalling
→ helper dừng/xóa service và binary
→ one-time confirm callback
→ Backend xóa server + cascade
```

Backend chỉ queue khi Agent online, Linux và heartbeat báo `remote_uninstall_supported=true`. `?force=true` là recovery path chỉ xóa record và có thể để lại Agent trên host. Chi tiết tại [Web Terminal and Remote Agent Removal](terminal-and-agent-removal.md).

