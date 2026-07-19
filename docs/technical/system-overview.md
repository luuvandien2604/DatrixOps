# System Overview

## Mục tiêu và kiến trúc

DatrixOps là monorepo quản lý fleet server nhỏ/trung bình bằng một control plane:

```text
Browser
  │ HTTPS (JWT/API key)
  ▼
Reverse proxy (ngoài repository)
  ├── Next.js frontend :3000
  └── Go backend :8080 ─── PostgreSQL :5432
             ▲
             │ HTTPS heartbeat + task result
             │ WSS reverse terminal channel
        Go Agent trên từng host
```

Backend là một process Go `net/http`. Website và alert scheduler là goroutine trong cùng process, không phải microservice. Reverse proxy/TLS production không được định nghĩa trong repository, vì vậy cấu hình upgrade WebSocket, certificate và origin policy phải được quản lý ở hạ tầng triển khai.

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

Agent duy trì WebSocket outbound `/api/v1/agent/terminal`. Browser xin ticket một lần rồi kết nối `/api/v1/terminal/browser`. Backend relay message, lưu `terminal_sessions`, giới hạn một session active/server và Agent giới hạn 30 phút. Shell chạy dưới identity của Agent service; đây là quyền cao và không phải command allowlist.

