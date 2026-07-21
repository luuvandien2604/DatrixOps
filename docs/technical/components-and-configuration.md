# Backend, Frontend, Database and Configuration

## Backend

`backend/cmd/api/main.go` tạo logger/config/database, chạy AutoMigrate, đăng ký route và scheduler. API dùng Go 1.22 method patterns. Response application được bọc bởi `{success,data,error}`.

Các module chính: auth, server, agent_api, terminal, alert, website, admin, audit và apikey. `server` quản lý fleet/metrics/task, Agent update và deletion state machine; `agent_api` nhận heartbeat/task result và one-time uninstall confirmation. So sánh update dùng numeric version components cho UI, nhưng Agent vẫn chưa enforce đầy đủ mọi quy tắc SemVer/anti-downgrade.

Các endpoint hệ thống:

- `GET /health`
- `GET /ready`
- `GET /api/v1/version`

## Frontend

Next.js App Router nằm trong `frontend/src/app`. `apiClient.ts` dùng `NEXT_PUBLIC_API_URL`, tự gắn access token, refresh một lần khi API trả 401 và retry request. Dashboard state chủ yếu là React state + API polling, không có global state framework.

Public docs dùng catalog `frontend/src/lib/docs.ts`, nội dung `docs/public`, catch-all route `/docs/[...slug]` và không đọc `docs/technical`.

`NEXT_PUBLIC_API_URL` là build-time ARG trong Frontend Dockerfile. Đổi biến này cần rebuild Frontend. Với default `/api/v1`, `next.config.ts` rewrite tới `http://backend:8080`.

Release artifact trong `frontend/public` được copy vào image tại build. Nếu host không mount/serve thư mục này ngoài image, publish Agent xong phải rebuild Frontend để URL release thấy file mới.

## Database

PostgreSQL 16 được dùng qua `pgxpool` (max 25, min 5). Schema thật là tổng của migration `20260712_001` đến `20260720_016`, gồm:

- `users`, `refresh_tokens`
- `servers`, `server_metrics`
- `server_tasks`
- `alert_channels`, `alert_rules`, `alert_state`
- `websites`
- `audit_logs`, `api_keys`
- `cron_jobs`, `cron_executions`
- `terminal_sessions`
- trạng thái remote deletion trên `servers`: `deletion_status`, `deletion_requested_at`, `deletion_error`, uninstall token hash/expiry

AutoMigrate đọc mọi `.sql` theo thứ tự `os.ReadDir` và thực thi mỗi Backend startup. Không có migration ledger/transaction bao toàn bộ set. Migration phải idempotent; backup trước migration phá hủy hoặc data rewrite.

Retention metrics/log chưa được triển khai trong source. PostgreSQL sẽ tăng cho đến khi có policy bên ngoài hoặc feature mới.


## Terminal and deletion fields

Heartbeat `os_info` có các capability phục vụ UI/Backend, gồm trạng thái reverse terminal channel và `remote_uninstall_supported`. Frontend không nên suy luận hỗ trợ chỉ từ chuỗi OS; phải dùng capability Agent báo về.

`servers.deletion_status` dùng các giá trị `active`, `pending`, `uninstalling`, `failed`. Migration tạo partial unique index để chỉ có một task `agent_uninstall` pending/processing trên mỗi server. Raw uninstall token không được lưu; Backend chỉ lưu SHA-256 hash và expiry, còn raw token được chuyển một lần trong task payload cho detached helper.

`DELETE /api/v1/servers/:id` mặc định queue remote uninstall và trả `202`. `?force=true` xóa record ngay, không gỡ Agent. Endpoint helper callback là `POST /api/v1/agent/uninstall/confirm`.

## Configuration reference

| Biến | Thành phần | Bắt buộc/default | Secret | Khi đổi |
|---|---|---|---|---|
| `PORT` | Backend | `8080` | Không | Restart Backend |
| `DATABASE_URL` | Backend | Local DSN default | **Có** | Restart Backend |
| `JWT_SECRET` | Backend | Dev fallback yếu | **Có** | Restart; token cũ invalid |
| `AGENT_VERSION` | Backend | Source/Compose `1.4.3` tại audit | Không | Recreate Backend |
| `NEXT_PUBLIC_API_URL` | Frontend | `/api/v1` | Không | **Rebuild** Frontend |
| `DATRIXOPS_SERVER_URL` | Agent | `http://localhost:8080` | Không | Restart Agent |
| `DATRIXOPS_AGENT_TOKEN` | Agent | Bắt buộc | **Có** | Restart Agent |
| `DATRIXOPS_INTERVAL` | Agent | `5` giây | Không | Restart Agent |
| `DATRIXOPS_SERVICES` | Agent | Rỗng = OS defaults | Không | Restart Agent |
| `DATRIXOPS_TERMINAL_MODE` | Agent Linux | `auto` khi rỗng; hỗ trợ `server/enabled`, `desktop/disabled/off` | Không | Restart Agent |
| `AGENT_RELEASE_BASE_URL` | Publish tool | Bắt buộc HTTPS | Không | Lần publish kế |
| `AGENT_SIGNING_PRIVATE_KEY_FILE` | Publish tool | Khuyến nghị | Đường dẫn nhạy cảm | Lần publish kế |
| `AGENT_SIGNING_PRIVATE_KEY` | Publish tool | Tùy chọn | **Có** | Lần publish kế |
| `AUTO_UPDATE_BACKEND` | Publish script | `1` | Không | Lần publish kế |
| `AGENT_FORCE` | Publish script | `0` | Không | Lần publish kế |
| `AGENT_VERSION` | Signing tool/script | Script truyền | Không | Lần publish kế |
| `AGENT_RELEASE_DIR` | Signing tool | Script truyền staging path | Không | Lần publish kế |

`NODE_ENV`, `NEXT_TELEMETRY_DISABLED`, `HOSTNAME` và `PORT` trong Frontend Dockerfile là runtime container settings cố định. `MIN_SELF_UPDATING_VERSION` là shell constant, không phải environment override.

