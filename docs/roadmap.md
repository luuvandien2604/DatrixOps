# DatrixOps — Master Roadmap

> Lộ trình phát triển toàn diện hệ thống quản lý hạ tầng DatrixOps, kết hợp tất cả các tính năng từ cơ bản (MVP) đến nâng cao (Killer features).

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

**Sprint 6: Docker Ecosystem**
- [x] Auto Discovery: Tự phát hiện Docker Container đang chạy.
- [x] Container Metrics: CPU, RAM của từng Container.
- [x] Container Controls: Start, Stop, Restart.
- [ ] Container Pull & Exec (cần policy lệnh và kiểm soát quyền rõ ràng).
- [x] Xem Logs trực tiếp (Docker logs).

---

## 🟠 Tính năng quản trị & Tự động hoá (Phase 4: Automation & Admin)

**Sprint 7: Alerting & Webhooks**
- [x] Rule Engine: Đặt ngưỡng cảnh báo (vd: CPU > 90%, Server Offline, Service Down).
- [x] Notification Channels: Telegram và Discord.
- [ ] Notification Channels: Slack và Email.
- [ ] System Webhooks: Webhook tổng quát cho hệ thống bên ngoài.

**Sprint 8: Quản trị viên & SaaS (Multi-Tenant & Audit)**
- [x] Multi-Tenant SaaS & Roles: Hỗ trợ nhiều người dùng đăng ký, tạo Workspace độc lập. Roles: SuperAdmin, User.
- [x] Nhóm Server (Group) & Gắn Tag (Production, Vietnam, DB).
- [x] Team Access UI cho SuperAdmin (danh sách user, role và số server sở hữu).
- [x] Audit Log nền tảng cho lifecycle server, metadata và remote task.
- [ ] Mở rộng Audit Log sang Alerts, Websites và API Keys.
- [x] Public REST API Key: Cấp API Token cho bên thứ 3 gọi vào DatrixOps.

**Sprint 9: Quản lý hạ tầng (Inventory & Scripts)**
- [x] Fleet Administration: chọn nhiều server và queue Agent Update/Restart/VPS Reboot.
- [x] Technical Inventory: Agent ghi nhận hostname, OS/kernel, architecture, CPU, RAM, disk, private IP và agent version.
- [x] Inventory Metadata: Provider, Region và Environment do operator quản lý.
- [x] Remote Task Foundation: Allowlist, audit actor, idempotency, timeout, expiry và atomic task claiming.
- [ ] Script Library: Thư viện kịch bản (Clean log, Restart Nginx, Backup DB) để chạy nhanh (One-click).
- [ ] Remote Command & Batch Execute: Gửi 1 lệnh (như `apt update`) xuống 1 hoặc 100 VPS cùng lúc và nhận kết quả realtime.
- [ ] Config Management: Đẩy file config (vd: `nginx.conf`) xuống hàng loạt Server.

---

## 🔴 Tính năng đột phá (Phase 5: "Killer" Features)

**Sprint 10: Tương tác trực tiếp (Interactive Tools)**
- [ ] **Web Terminal (SSH Browser):** Truy cập SSH trực tiếp ngay trên Dashboard qua WebSocket/Reverse Tunnel (Không cần mở Port 22 ra Internet).
- [ ] **File Manager:** Duyệt thư mục `/etc`, `/var`, `/home`, Upload/Download/Edit/Chmod file trực tiếp qua Web.
- [ ] **Realtime Log Viewer:** `journalctl` streaming, xem log Nginx/MySQL realtime.

**Sprint 11: Thông minh & Tự động (Smart & Auto)**
- [ ] **Timeline Sự kiện:** Liệt kê mọi thay đổi của VPS trên 1 trục thời gian (vd: Lúc 12h CPU tăng, 12h05 Service Restart).
- [ ] **Auto Discovery (Nâng cao):** Tự phát hiện Database, Web Server và tự động load dashboard tương ứng.
- [x] **Agent Auto Update:** Server đẩy phiên bản Agent mới xuống VPS và agent tự cập nhật qua service manager.

**Sprint 12: Tối ưu hiệu năng & Bảo mật (Performance & Security)**
- [ ] Chuyển giao tiếp Agent-Server sang gRPC/WebSocket (Streaming) thay vì HTTP REST để xử lý hàng vạn Agent.
- [ ] Agent Delta Updates: Chỉ gửi dữ liệu bị thay đổi, tiết kiệm cực độ băng thông.
- [ ] Mutual TLS (mTLS): Chứng thực 2 chiều giữa Agent và Core API, mã hoá toàn bộ.
- [ ] Chống Replay Attack, thiết lập Rate Limit nghiêm ngặt.
- [ ] Plugin System: Cho phép cộng đồng tự code các module thu thập dữ liệu riêng cho Agent.

---

> **Nguyên lý thiết kế:** "Chế độ Lightweight" là kim chỉ nam. Agent luôn phải tiêu thụ < 20MB RAM và < 1% CPU khi nhàn rỗi. Tối đa hoá tính tiện dụng (One-click) cho SRE & DevOps.
