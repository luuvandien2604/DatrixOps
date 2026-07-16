---
title: "Feature Map — Tính năng chạy ở đâu"
description: "Bảng tra cứu: mỗi tính năng đang chạy hiện tương ứng với những file nào trong source, dùng để debug nhanh."
role: "admin"
order: 2
---

# Feature Map — Tính năng ↔ File source

> Mục tiêu: khi 1 tính năng trên UI có lỗi, tra bảng này để biết cần mở file nào trước, không phải grep cả repo. Chỉ liệt kê tính năng **đã hoạt động thật**, không liệt kê phần "Under Construction".

## Cách đọc bảng

Mỗi tính năng có 3 lớp: **Frontend (UI)** → **Backend (API)** → **Database**. Debug nên đi từ UI xuống, hoặc từ log backend lên nếu lỗi 500.

---

## 1. Đăng ký / Đăng nhập (Auth)

| Lớp | File |
|---|---|
| Frontend | `frontend/src/app/login/page.tsx`, `frontend/src/app/register/page.tsx` |
| API Client | `frontend/src/lib/apiClient.ts` |
| Backend routes | `backend/internal/core/auth/routes.go` |
| Backend logic | `backend/internal/core/auth/handler.go`, `service.go`, `repository.go` |
| DB | bảng `users`, `refresh_tokens` (`backend/migrations/20260712_001_create_auth_tables.sql`) |
| Middleware liên quan | `backend/internal/platform/middleware/*.go` (hàm `RequireAuth`) |

**Ghi chú debug:** Chỉ cho phép 1 tài khoản duy nhất — nếu bảng `users` đã có dữ liệu, gọi `/api/v1/auth/register` sẽ trả 403. Đây là hành vi đúng theo thiết kế (`docs/features/auth.md`), không phải bug.

---

## 2. Trang chủ Dashboard (số liệu tổng quan)

| Lớp | File |
|---|---|
| Frontend | `frontend/src/app/dashboard/page.tsx` |
| Backend | dùng chung API `GET /api/v1/servers` (từ module `server`) và `GET /api/v1/alerts/rules` |

---

## 3. Danh sách & chi tiết Server

| Lớp | File |
|---|---|
| Frontend danh sách | `frontend/src/app/dashboard/servers/page.tsx` |
| Frontend chi tiết (4 tab: Overview/Processes/Services/Docker) | `frontend/src/app/dashboard/servers/[id]/page.tsx` |
| Backend routes | `backend/internal/core/server/routes.go` |
| Backend logic | `backend/internal/core/server/handler.go`, `service.go`, `repository.go` |
| DB | bảng `servers` (`20260712_002_create_servers_table.sql`), cột `snapshot` (`20260714_005_add_snapshot_to_servers.sql`) |

**Ghi chú debug:** Dữ liệu Processes/Services/Docker nằm trong cột JSONB `servers.snapshot`, **không phải bảng riêng**. Muốn xem dữ liệu snapshot thô:
```sql
SELECT snapshot FROM servers WHERE id = '<server_id>';
```

---

## 4. Biểu đồ giám sát real-time (CPU/RAM/Network/Disk)

| Lớp | File |
|---|---|
| Frontend | `frontend/src/app/dashboard/monitoring/page.tsx` (và tab Overview trong `servers/[id]/page.tsx`) |
| Backend routes | `GET /api/v1/servers/{id}/metrics` trong `server/routes.go` |
| Backend logic | `server/handler.go` (hàm `ListMetrics`) |
| DB | bảng `server_metrics` (`20260714_003_create_server_metrics.sql`) |
| Nguồn ghi dữ liệu | `backend/internal/core/agent_api/handler.go` (hàm `Heartbeat` — insert vào `server_metrics` mỗi lần Agent gửi heartbeat) |

**Ghi chú debug:** Nếu biểu đồ không lên dữ liệu mới, kiểm tra insert có lỗi bị nuốt âm thầm không — trong `agent_api/handler.go`, lỗi insert `server_metrics` chỉ `println(...)`, không làm fail request heartbeat.

---

## 5. Docker Actions (Start/Stop/Restart/Logs) — Remote Task

| Lớp | File |
|---|---|
| Frontend | tab Docker trong `frontend/src/app/dashboard/servers/[id]/page.tsx` |
| Backend tạo task | `server/handler.go` (hàm `CreateTask`) → `POST /api/v1/servers/{id}/tasks` |
| Backend xem kết quả | `server/handler.go` (hàm `GetTask`) → `GET /api/v1/servers/{id}/tasks/{taskId}` |
| Backend agent nhận/trả task | `agent_api/handler.go` (`Heartbeat` trả `tasks[]`, `ReportTaskResult` nhận kết quả) |
| Agent thực thi | `agent/cmd/agent/main.go` (hàm `processTask`) |
| DB | bảng `server_tasks` (`20260715_006_create_server_tasks.sql`) |

**Ghi chú debug:** Đây là mô hình **poll**, không phải push — task tạo ra ở trạng thái `pending`, chỉ được Agent nhận khi Agent gửi heartbeat tiếp theo. Độ trễ tối đa = `DATRIXOPS_INTERVAL` (mặc định 10s). Muốn xem task đang kẹt ở đâu:
```sql
SELECT id, type, status, result FROM server_tasks WHERE server_id = '<id>' ORDER BY created_at DESC LIMIT 10;
```

---

## 6. Alerts (Rules + Channels + gửi thông báo)

| Lớp | File |
|---|---|
| Frontend | `frontend/src/app/dashboard/alerts/page.tsx` |
| Backend routes | `backend/internal/core/alert/routes.go` |
| Backend logic | `alert/handler.go`, `repository.go` |
| Scheduler (job chạy nền, tự động check & gửi) | `backend/internal/scheduler/alert_job.go` |
| Gửi thông báo thực tế | `backend/internal/platform/notifier/` (Discord Webhook / Telegram Bot) |
| DB | bảng `alert_rules`, `alert_channels`, `alert_state` (`20260715_007_create_alerting_tables.sql`), cột `user_id` thêm sau (`20260715_008_multi_tenant.sql`) |

**Ghi chú debug:** `AlertJob` chạy ticker **mỗi 1 phút** (không realtime) — log có prefix `component=AlertJob`, filter log theo từ khoá này để xem job có chạy không. Nếu rule không trigger, kiểm tra `alert_rules.enabled` và `alert_channels.enabled` đều phải `true`.

---

## 7. Websites & SSL Monitoring

| Lớp | File |
|---|---|
| Frontend | `frontend/src/app/dashboard/websites/page.tsx` |
| Backend routes | `backend/internal/core/website/routes.go` |
| Backend logic | `website/handler.go`, `service.go`, `repository.go` |
| Scheduler (ping định kỳ + check SSL) | `backend/internal/scheduler/website_job.go` |
| DB | bảng `websites` (`20260714_004_create_websites_table.sql`) |

---

## 8. API Keys

| Lớp | File |
|---|---|
| Frontend | `frontend/src/app/dashboard/manage/api/page.tsx` |
| Backend routes | `backend/internal/core/apikey/routes.go` (`GET/POST /api/v1/apikeys`, `DELETE /api/v1/apikeys/{id}`) |
| Backend logic | `apikey/handler.go` (hàm `ListKeys`, `CreateKey`, `DeleteKey`) |
| DB | bảng `api_keys` (`20260715_010_sprint8_part2.sql`) |

**Ghi chú debug:** Chỉ lưu `key_hash`, key gốc **không thể phục hồi** nếu người dùng làm mất — đây là thiết kế bảo mật, không phải bug.

---

## 9. Audit Log

| Lớp | File |
|---|---|
| Frontend | `frontend/src/app/dashboard/manage/audit/page.tsx` |
| Backend routes | `backend/internal/core/audit/routes.go` (`GET /api/v1/audit-logs`) |
| Backend logic | `audit/handler.go` (hàm `ListLogs`) |
| DB | bảng `audit_logs` (`20260715_010_sprint8_part2.sql`) |

**Ghi chú debug:** Cần xác định module nào đang **ghi** vào audit_logs — kiểm tra các module khác (`server`, `alert`, `apikey`...) có gọi `audit.Repository` hay không; nếu một hành động không xuất hiện trong Audit Log, khả năng cao module đó chưa tích hợp ghi audit.

---

## 10. Admin (quản lý user — superadmin only)

| Lớp | File |
|---|---|
| Backend routes | `backend/internal/core/admin/routes.go` (`GET /api/v1/admin/users`, yêu cầu role `superadmin`) |
| Backend logic | `admin/handler.go`, `repository.go` |
| DB | cột `users.role` (`20260715_008_multi_tenant.sql`) |

**Ghi chú:** Chưa có trang Frontend tương ứng — hiện chỉ có API, `frontend/src/app/dashboard/manage/users/page.tsx` vẫn là "Under Construction".

---

## 11. Agent — vòng lặp thu thập & gửi dữ liệu

| Thành phần | File |
|---|---|
| Vòng lặp chính, xử lý task, auto-update | `agent/cmd/agent/main.go` |
| Đọc config từ biến môi trường | `agent/internal/config/config.go` |
| Thu thập CPU/RAM/Net/Disk | `agent/internal/collector/collector.go` |
| Thu thập Docker containers | `agent/internal/collector/docker.go` |
| Thu thập Processes/Services (snapshot) | `agent/internal/collector/snapshot.go` |
| Gửi HTTP request lên Backend | `agent/internal/client/http.go` |

---

## 12. Update Agent

| Lớp | File |
|---|---|
| Frontend — nút "Update Agent" + dialog xác nhận | `frontend/src/app/dashboard/servers/page.tsx` (state `serverToUpdate`) |
| Frontend gửi lệnh | Gọi `POST /servers/{id}/tasks` với `{ type: 'agent_update', payload: '{}' }` (dùng chung `apiClient`, `frontend/src/lib/apiClient.ts`) |
| Backend tạo task | `server/handler.go` (hàm `CreateTask`) — giống hệt luồng tạo task Docker, chỉ khác `type` |
| Backend agent nhận task | `agent_api/handler.go` (`Heartbeat` trả `tasks[]` chứa task `agent_update`) |
| Agent xử lý task | `agent/cmd/agent/main.go` (hàm `processTask`, case `"agent_update"`) → gọi `go triggerAutoUpdate()` |
| Agent tự update (2 cách kích hoạt) | `agent/cmd/agent/main.go` (hàm `triggerAutoUpdate`) |
| Script cài đặt lại (được auto-update gọi) | `frontend/public/install.sh`, `install-mac.sh`, `install.ps1` (được publish bởi `scripts/publish-agent.sh`) |

**2 cách một agent nhận lệnh update:**
1. **Chủ động từ người dùng** — bấm nút "Update Agent" trên UI → tạo task `agent_update` → agent nhận task ở heartbeat tiếp theo.
2. **Tự động từ backend** — mỗi heartbeat, backend so `req.Version` (agent gửi lên) với version hard-code `"1.1.0"` trong `agent_api/handler.go`; nếu khác, trả `update_required: true` → agent tự trigger update mà **không cần** ai bấm nút.

**Ghi chú debug:**
- Muốn ép agent update dù không đổi code: đổi hằng số version trong `agent_api/handler.go` (`req.Version != "1.1.0"`) — **nhưng đây là version hard-code, không đọc từ config/DB**, sửa xong phải rebuild + deploy lại backend.
- Nếu bấm "Update Agent" mà không thấy gì xảy ra: task vẫn theo mô hình poll (xem mục 5) — đợi tối đa `DATRIXOPS_INTERVAL` giây để agent nhận.
- Tên service thật là **`datrixops-agent`** (có "ops"), không phải `datrix-agent` — kiểm tra bằng `systemctl status datrixops-agent`.
- Không có cơ chế "rollback" nếu bản mới lỗi — auto-update ghi đè trực tiếp binary hiện tại.

---

## 12b. Restart Agent (nội bộ) & Reboot VPS (nút UI)

| Lớp | File |
|---|---|
| Frontend — nút "Reboot VPS" + dialog xác nhận | `frontend/src/app/dashboard/servers/page.tsx` (state `serverToRestart`, dialog "Reboot VPS?") |
| Frontend gửi lệnh | `POST /servers/{id}/tasks` với `{ type: 'vps_reboot', payload: '{}' }` |
| Agent xử lý `vps_reboot` | `agent/cmd/agent/main.go` (case `"vps_reboot"` trong `processTask` → `go triggerReboot()`) |
| Agent xử lý `agent_restart` | `agent/cmd/agent/main.go` (case `"agent_restart"` → `go triggerRestart()`) — **chưa có nút UI nào gọi task này**, để dành cho tool vận hành/CLI sau này |
| Lệnh reboot theo OS | `triggerReboot()`: Linux `reboot`, macOS `shutdown -r now`, Windows `shutdown /r /t 0 /f` |

**Phân biệt 2 task dễ nhầm:**

| Task type | Ảnh hưởng | Dùng khi |
|---|---|---|
| `agent_restart` | Chỉ agent process restart, VPS và các service khác (nginx, docker...) không bị ảnh hưởng | Agent bị treo/lỗi nhẹ, muốn restart mà không downtime cả máy |
| `vps_reboot` | Reboot toàn bộ máy chủ, mọi service trên VPS đều gián đoạn tạm thời | Cần restart thật sự cấp hệ điều hành (kernel update, treo hệ thống...) |

**Cơ chế tự hồi phục sau reboot/crash — ở tầng OS, KHÔNG phải code Go:**

| OS | Sống lại sau crash | Sống lại sau VPS reboot |
|---|---|---|
| Linux | `Restart=always` + `RestartSec=10` (`scripts/publish-agent.sh`, systemd unit `datrixops-agent`) | `systemctl enable datrixops-agent` |
| macOS | `KeepAlive: true` (launchd plist) | `RunAtLoad: true` + `launchctl load -w` |
| Windows | `RestartCount 999` / `RestartInterval 1min` (`New-ScheduledTaskSettingsSet`) | Trigger `AtStartup` |

**Ghi chú debug quan trọng:**
- Cả `triggerRestart()` và `triggerAutoUpdate()` dùng `os.Exit(1)` (KHÔNG phải `0`) — vì Windows Task Scheduler chỉ áp dụng `RestartCount` khi coi task là "failed" (exit code ≠ 0). Nếu sau này sửa code mà đổi lại thành `os.Exit(0)`, **restart/update trên Windows sẽ ngừng hoạt động âm thầm** (Linux/macOS vẫn chạy bình thường vì không quan tâm exit code) — dễ bị bỏ sót khi test chỉ trên Linux.
- `triggerReboot()` report `status: completed` **trước khi** biết lệnh reboot có chạy thành công hay không (do gọi `go triggerReboot()` bất đồng bộ) — nếu Agent không đủ quyền reboot (thiếu `sudo`/không phải SYSTEM account), lỗi chỉ nằm trong log của agent, **không** phản ánh lên `server_tasks.status` hay UI.
- Muốn kiểm tra agent có hiểu 2 task type mới không: agent phải là bản build **sau** khi thêm 2 case này — agent cũ trả `status: failed, result: "Unknown task type"`.

---

## 13. Middleware & hạ tầng dùng chung (ảnh hưởng mọi module)

| Thành phần | File | Mô tả |
|---|---|---|
| Xác thực JWT | `backend/internal/platform/middleware/*.go` | hàm `RequireAuth`, `RequireRole` |
| CORS | cùng file trên | hàm `CORS` — hiện đang mở `Access-Control-Allow-Origin: *` |
| Request logging | cùng file trên | hàm `Logger` |
| Kết nối DB + auto-migrate | `backend/internal/platform/database/` | migrate chạy tự động mỗi lần backend start, đọc file trong `backend/migrations/` |
| Đọc config (.env) | `backend/internal/platform/config/` | `DATABASE_URL`, `PORT`, `JWT_SECRET` |
| Response format chuẩn | `backend/internal/platform/response/` | `response.Success`, `response.Error` |
| Gửi Discord/Telegram | `backend/internal/platform/notifier/` | dùng bởi `alert_job.go` |
| Entry point tổng, nơi tất cả module được đăng ký | `backend/cmd/api/main.go` | thêm module mới phải sửa file này |

---

## Quy tắc chung khi debug bất kỳ tính năng nào

1. Xác định tính năng thuộc module nào trong bảng trên.
2. Xem log Frontend (Network tab của trình duyệt) — request gửi tới path nào, response code gì.
3. Đối chiếu path đó với `routes.go` của module tương ứng để tìm đúng `handler.go`.
4. Nếu lỗi 401 → luôn kiểm tra đúng loại token trước (JWT người dùng vs Agent Token — xem thêm trong [Lỗi thường gặp](/docs/troubleshooting)).
5. Nếu dữ liệu không đúng/không cập nhật → kiểm tra trực tiếp bảng DB tương ứng bằng `psql`, đừng đoán qua UI.