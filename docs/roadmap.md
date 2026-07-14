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
- [ ] **Thông tin hệ thống chi tiết:** OS, Kernel, Public/Private IP, Virtualization (KVM/Docker), Uptime.
- [ ] **Top Processes:** Giám sát các tiến trình đang ngốn CPU/RAM nhất (Gồm PID, Owner, Search).
- [ ] **Service Status:** Giám sát các dịch vụ như Nginx, MySQL, Redis, Docker (Running/Stopped).
- [ ] **Package Updates:** Hiển thị số lượng Package hệ thống cần cập nhật và nút Update 1-click.
- [ ] **Cron Monitoring:** Giám sát lịch sử chạy Cronjob (Last run, Next run).

**Sprint 6: Docker Ecosystem**
- [ ] Auto Discovery: Tự phát hiện Docker Container đang chạy.
- [ ] Container Metrics: CPU, RAM của từng Container.
- [ ] Container Controls: Start, Stop, Restart, Pull, Exec.
- [ ] Xem Logs trực tiếp (Docker logs).

---

## 🟠 Tính năng quản trị & Tự động hoá (Phase 4: Automation & Admin)

**Sprint 7: Alerting & Webhooks**
- [ ] Rule Engine: Đặt ngưỡng cảnh báo (vd: CPU > 90%, Server Offline, Service Down).
- [ ] Notification Channels: Gửi cảnh báo qua Telegram, Discord, Slack, Email.
- [ ] System Webhooks: Gắn webhook để tích hợp hệ thống bên ngoài.

**Sprint 8: Quản trị viên (RBAC & Audit)**
- [ ] Roles: Admin, Operator, Viewer.
- [ ] Nhóm Server (Group) & Gắn Tag (Production, Vietnam, DB).
- [ ] Audit Log: Ghi log mọi thao tác (Ai đã restart VPS, xoá file, chạy lệnh).
- [ ] Public REST API Key: Cấp API Token cho bên thứ 3 gọi vào DatrixOps.

**Sprint 9: Quản lý hạ tầng (Inventory & Scripts)**
- [ ] Inventory: Ghi nhận thông tin Provider, Region, Spec phần cứng của VPS.
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
- [ ] **Agent Auto Update:** Server đẩy phiên bản Agent mới xuống VPS và tự động cập nhật không gây gián đoạn.

**Sprint 12: Tối ưu hiệu năng & Bảo mật (Performance & Security)**
- [ ] Chuyển giao tiếp Agent-Server sang gRPC/WebSocket (Streaming) thay vì HTTP REST để xử lý hàng vạn Agent.
- [ ] Agent Delta Updates: Chỉ gửi dữ liệu bị thay đổi, tiết kiệm cực độ băng thông.
- [ ] Mutual TLS (mTLS): Chứng thực 2 chiều giữa Agent và Core API, mã hoá toàn bộ.
- [ ] Chống Replay Attack, thiết lập Rate Limit nghiêm ngặt.
- [ ] Plugin System: Cho phép cộng đồng tự code các module thu thập dữ liệu riêng cho Agent.

---

> **Nguyên lý thiết kế:** "Chế độ Lightweight" là kim chỉ nam. Agent luôn phải tiêu thụ < 20MB RAM và < 1% CPU khi nhàn rỗi. Tối đa hoá tính tiện dụng (One-click) cho SRE & DevOps.
