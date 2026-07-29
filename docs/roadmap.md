# DatrixOps — Master Roadmap

> Lộ trình phát triển toàn diện hệ thống quản lý hạ tầng DatrixOps, kết hợp tất cả các tính năng từ cơ bản (MVP) đến nâng cao (Killer features).

---

## Hướng ưu tiên triển khai

**Ưu tiên gần (triển khai trước):**
1. Hoàn thiện Cron Execution Telemetry UX: copy wrapper command, migration guide và trạng thái `Not instrumented`/`Reported`/`Failed`.
2. Mở rộng Audit Log cho các thao tác rủi ro: Alerts, Websites, API Keys, script execution, terminal sessions và update policy.
3. Polish Realtime Log Viewer read-only: live-tail theo phiên cho nguồn log đã chọn, không mở shell tuỳ ý.
4. Thêm test delivery và health state cho Email SMTP channel.
5. Mở rộng Script Library theo allowlist thực tế: ưu tiên diagnostics/dry-run trước thao tác thay đổi trạng thái.
6. File Manager read-only hoặc Config Viewer nếu cần quan sát file cấu hình/log an toàn.

**Ưu tiên sau khi nền bảo mật ổn định:**
- Slack Notification.
- Remote Command bản giới hạn, dựa trên Script Library và policy/approval.
- Config Management có dry-run, validation, versioning và rollback.
- File Manager read-only trước; upload/edit/chmod để sau.

**Tạm hoãn / cần quyết định kiến trúc trước:**
- Docker Exec/Pull hàng loạt.
- Arbitrary Remote Command & Batch Execute.
- File Manager có quyền ghi.
- gRPC/WebSocket migration, Agent Delta Updates, mTLS/PKI và Plugin System.

---

## 🟢 Đã hoàn thành (Phase 1 & 2)

**Sprint 1 & 2: Nền tảng (Foundation & Core)**
- [x] Kiến trúc Monorepo (Frontend Next.js, Backend Go, Agent Go).
- [x] Quản lý User (Login, Register, JWT Auth).
- [x] Quản lý Server: Thêm/Xóa server, Sinh Agent Token.
- [x] Agent v1: Kết nối, gửi Heartbeat.
- [x] Dashboard: Hiển thị danh sách Server và trạng thái Online/Offline.

**Sprint 3: Giám sát tài nguyên cơ bản (Resource Monitoring)**
- [x] Metrics Thu thập: CPU (Usage, Load Avg, Cores), RAM (Used, Free, Cache), Disk (Used, Free, IOPS), Network (Up/Down).
- [x] Backend: Lưu Time-series data, Downsampling.
- [x] Dashboard: Biểu đồ thời gian thực (Realtime) & Xem lại lịch sử (Time Range Selector).

**Sprint 4: Giám sát dịch vụ độc lập (Service Monitoring)**
- [x] HTTP/Website Monitoring: Ping URL, độ trễ (Latency).
- [x] SSL Monitoring: Lấy thông tin Issuer, đếm ngược ngày hết hạn.
- [x] Background Scheduler: Chạy ngầm tự động quét Website/SSL mỗi phút.

---

## 🟡 Đang thực hiện & Chuẩn bị (Phase 3: Deep Monitoring)

**Sprint 5: Giám sát chuyên sâu (Infrastructure & System)**
- [x] **Thông tin hệ thống chi tiết:** OS, Kernel, Public/Private IP, Virtualization (KVM/Docker), Uptime.
- [x] **Top Processes:** Giám sát các tiến trình đang ngốn CPU/RAM nhất (Gồm PID, Owner, Search).
- [x] **Service Status:** Giám sát các dịch vụ như Nginx, MySQL, Redis, Docker (Running/Stopped).
- [x] **Cross-platform Service Monitoring:** systemd trên Linux, launchd trên macOS, Windows Service Control Manager và danh sách service tuỳ biến theo agent.
- [x] **Native Service Controls:** Start, Stop, Restart và Reload có xác nhận, task status và allowlist service do agent báo cáo.
- [x] **Package Updates:** Hiển thị số lượng Package hệ thống cần cập nhật và nút Update 1-click.
- [x] **Cron Discovery:** Agent phát hiện user crontab, `/etc/crontab` và `/etc/cron.d` mà nó có quyền đọc.
- [ ] **Cron Execution Telemetry:** Ghi nhận lịch sử chạy thực tế, Last run, Next run và exit status (không suy diễn dữ liệu khi chưa có telemetry).
  - Đã triển khai contract telemetry `last_run_at`/`next_run_at`/`last_status`, agent ước tính `next_run_at` từ lịch cron và UI phân biệt rõ “Not instrumented”.
  - Đã thêm endpoint agent-scoped để nhận execution record thật, lưu `cron_executions`, cập nhật `last_run_at`/`last_status` và hiển thị recent runs trong dashboard.
  - Đã thêm agent wrapper `cron-run` opt-in để chạy command thật, giữ nguyên exit code và gửi telemetry bằng agent token.
  - Đã thêm UX copy wrapper command theo từng cron job.
  - Đã thêm migration guide public docs và link trực tiếp từ tab Cron.
  - Còn lại: trạng thái hướng dẫn cấu hình thủ công rõ hơn trong dashboard nếu cần.
  - Tạm hoãn: cơ chế native/managed runner nếu muốn tự động bọc cron jobs thay vì operator cấu hình thủ công.

**Sprint 6: Docker Ecosystem**
- [x] Auto Discovery: Tự phát hiện Docker Container đang chạy.
- [x] Container Metrics: CPU, RAM của từng Container.
- [x] Container Controls: Start, Stop, Restart.
- [ ] Container Pull & Exec (**tạm hoãn**: cần policy lệnh, approval và kiểm soát quyền rõ ràng).
- [x] Xem Logs trực tiếp (Docker logs).

---

## 🟠 Tính năng quản trị & Tự động hoá (Phase 4: Automation & Admin)

**Sprint 7: Alerting & Webhooks**
- [x] Rule Engine: Đặt ngưỡng cảnh báo (vd: CPU > 90%, Server Offline, Service Down).
- [x] Notification Channels: Telegram và Discord.
- [x] Notification Channels: Email SMTP.
  - Đã thêm SMTP config cho alert channel, validate `smtp_host`, `smtp_port`, `from`, `to`, hỗ trợ TLS/STARTTLS và không trả secret/password khi list channel.
  - Còn lại nếu cần: nút test email riêng cho từng channel.
- [x] System Webhooks: Webhook tổng quát cho hệ thống bên ngoài.
  - Đã thêm DB schema, backend CRUD, HMAC-SHA256 signing, masked URL response, test delivery, delivery history và UI quản lý trong Workspace Settings.
  - Đã nối dispatch tự động cho `server.offline`, `server.online`, `server.degraded`, `cron.failed`, `service.down`, `agent.update_failed` và `agent.update_resolved`.
  - Đã thêm retry/backoff giới hạn, trạng thái `dead` sau khi hết retry và hiển thị attempt/next retry trong Settings.

**Sprint 8: Quản trị viên & SaaS (Multi-Tenant & Audit)**
- [x] Multi-Tenant SaaS & Roles: Hỗ trợ nhiều người dùng đăng ký, tạo Workspace độc lập. Roles: SuperAdmin, User.
- [x] Nhóm Server (Group) & Gắn Tag (Production, Vietnam, DB).
- [x] Team Access UI cho SuperAdmin (danh sách user, role và số server sở hữu).
- [x] Audit Log nền tảng cho lifecycle server, metadata và remote task.
- [x] Mở rộng Audit Log sang Alerts, Websites và API Keys.
- [x] Public REST API Key: Cấp API Token cho bên thứ 3 gọi vào DatrixOps.

**Sprint 9: Quản lý hạ tầng (Inventory & Scripts)**
- [x] Fleet Administration: chọn nhiều server và queue Agent Update/Restart/VPS Reboot.
- [x] Local SSH Handoff: tạo/copy lệnh SSH và mở SSH client cục bộ mà không lưu credential trên DatrixOps.
- [x] Technical Inventory: Agent ghi nhận hostname, OS/kernel, architecture, CPU, RAM, disk, private IP và agent version.
- [x] Inventory Metadata: Provider, Region và Environment do operator quản lý.
- [x] Remote Task Foundation: Allowlist, audit actor, idempotency, timeout, expiry và atomic task claiming.
- [x] Script Library: Thư viện kịch bản allowlist để chạy nhanh có kiểm soát.
  - Đã thêm catalog DB, backend policy theo OS, confirmation bắt buộc cho script thay đổi trạng thái, timeout/output limit, UI chạy script trong server detail và audit queue/completion.
  - Agent chỉ chạy script ID đã hardcode allowlist; không nhận command tuỳ ý từ UI/API.
- [ ] Remote Command & Batch Execute (**tạm hoãn**: chỉ triển khai sau Script Library, audit, approval và command allowlist).
- [ ] Config Management (**triển khai sau**): Đẩy file config có dry-run, validation, versioning và rollback.

---

## 🔴 Tính năng đột phá (Phase 5: "Killer" Features)

**Sprint 10: Tương tác trực tiếp (Interactive Tools)**
- [x] **Web Terminal (Reverse Shell):** Terminal tương tác cho Linux, macOS và Windows qua outbound WebSocket của Agent; dùng one-time ticket, same-origin validation, thời hạn 30 phút, một session/server và audit metadata.
- [ ] **File Manager:** Ưu tiên read-only trước; Upload/Edit/Chmod **tạm hoãn** vì rủi ro cao.
- [~] **Realtime Log Viewer:** read-only log viewer.
  - Đã thêm fetch read-only qua agent cho Linux `journalctl`, Nginx access/error với timeout/output cap và audit.
  - Còn lại: live-tail streaming theo phiên và UI chọn Docker container/log source chi tiết.

**Sprint 11: Thông minh & Tự động (Smart & Auto)**
- [ ] **Timeline Sự kiện:** Liệt kê mọi thay đổi của VPS trên 1 trục thời gian (vd: Lúc 12h CPU tăng, 12h05 Service Restart).
- [ ] **Auto Discovery (Nâng cao):** Tự phát hiện Database, Web Server và tự động load dashboard tương ứng.
- [x] **Agent Auto Update:** Server đẩy phiên bản Agent mới xuống VPS và agent tự cập nhật qua service manager.

**Sprint 12: Tối ưu hiệu năng & Bảo mật (Performance & Security)**
- [ ] Chuyển giao tiếp Agent-Server sang gRPC/WebSocket (Streaming) thay vì HTTP REST để xử lý hàng vạn Agent (**tạm hoãn đến khi có bottleneck thực tế**).
- [ ] Agent Delta Updates: Chỉ gửi dữ liệu bị thay đổi, tiết kiệm cực độ băng thông (**tạm hoãn đến khi data model ổn định**).
- [ ] Mutual TLS (mTLS): Chứng thực 2 chiều giữa Agent và Core API, mã hoá toàn bộ (**cần thiết kế PKI trước**).
- [ ] Chống Replay Attack, thiết lập Rate Limit nghiêm ngặt.
- [ ] Plugin System: Cho phép cộng đồng tự code các module thu thập dữ liệu riêng cho Agent (**tạm hoãn đến khi core collector ổn định**).

---

> **Nguyên lý thiết kế:** "Chế độ Lightweight" là kim chỉ nam. Agent luôn phải tiêu thụ < 20MB RAM và < 1% CPU khi nhàn rỗi. Tối đa hoá tính tiện dụng (One-click) cho SRE & DevOps.

Checklist tiến độ chi tiết: [`docs/implementation-checklist.md`](implementation-checklist.md).
