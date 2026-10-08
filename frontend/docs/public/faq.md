---
title: "Câu hỏi thường gặp"
description: "Giải đáp chi tiết về kiến trúc hệ thống, Caddy Gateway, SSL, cơ chế .env, Agent và các tính năng của DatrixOps."
---

## 1. Khi Agent đẩy metrics về thì đẩy về Gateway hay Backend bên trong?

**Agent LUÔN đẩy về GATEWAY (Caddy), KHÔNG đẩy trực tiếp về Backend.**
- **Bảo mật:** Backend chỉ chạy trong mạng nội bộ của Docker (`expose: 8080`), hoàn toàn không mở port ra Internet.
- **Reverse Proxy & SSL:** Gateway (Caddy) là cổng duy nhất mở ra Internet (Port 80/443). Gateway chịu trách nhiệm mã hóa/giải mã SSL, sau đó mới định tuyến các request `/api/*` và `/ws/*` vào Backend bên trong mạng Docker.

---

## 2. Gateway Caddy cấp và gia hạn SSL như thế nào? File cert lưu ở đâu?

- **Cơ chế cấp & gia hạn:** Caddy tích hợp sẵn ACME client. Khi biến `CADDY_SITE_ADDRESS` là một tên miền công khai hợp lệ, Caddy tự động liên hệ với Let's Encrypt hoặc ZeroSSL để xin cert qua cổng 80/443. Quá trình gia hạn diễn ra tự động 30 ngày trước khi hết hạn mà không gây gián đoạn dịch vụ.
- **Vị trí lưu Cert:**
  - *Bên trong Container:* `/data/caddy/certificates/...`
  - *Trên máy chủ Host VPS:* Nằm trong Docker Volume `caddy_data` tại `/var/lib/docker/volumes/datrixops_caddy_data/_data/caddy/certificates/`.

---

## 3. Hệ thống có mấy Docker container và chức năng của chúng là gì?

Hệ thống gồm tổng cộng **6 container Docker** (5 container chạy thường trực và 1 container chạy 1 lần khi khởi động):
1. **`gateway` (Caddy):** Cửa ngõ Reverse Proxy tiếp nhận traffic (Port 80/443), tự động SSL.
2. **`database` (PostgreSQL 16):** Cơ sở dữ liệu chính lưu trữ metrics, người dùng, cài đặt.
3. **`migrate` (Init Job):** Chạy cập nhật schema database khi khởi động rồi tự tắt an toàn.
4. **`backend` (Go API):** Xử lý API REST, WebSocket, xác thực và điều khiển hệ thống.
5. **`worker` (Go Engine):** Xử lý ngầm kiểm tra website/SSL, đánh giá cảnh báo và dọn dẹp data cũ.
6. **`frontend` (Next.js 16):** Ứng dụng Web Dashboard phục vụ người dùng.

---

## 4. File `.env` của Caddy là riêng hay chung? Tại sao có symlink?

- **Dùng chung 1 file `.env` duy nhất:** Toàn bộ dịch vụ (Caddy, Backend, Frontend, Worker, Database) đều đọc chung file `/opt/datrixops/.env`.
- **Cơ chế Symlink:** File `/opt/datrixops/deploy/.env` được liên kết tự động (symlink) trỏ về `/opt/datrixops/.env` (`deploy/.env -> ../.env`). Nhờ đó, bất kể bạn dùng CLI `datrix` hay gõ lệnh tay `docker compose` trong thư mục `deploy/`, hệ thống đều nạp cùng một cấu hình duy nhất.

---

## 5. DatrixOps có cần mở cổng SSH (port 22) trên máy chủ khách không?

**Hoàn toàn không.** Agent hoạt động theo cơ chế **Outbound-only** (chủ động kết nối HTTPS/WSS ra ngoài về Control Plane). Bạn không cần mở bất kỳ port inbound nào trên máy chủ khách, kể cả port SSH 22. Tính năng Web Terminal hoạt động qua Reverse WebSocket an toàn.

---

## 6. Chẩn đoán chất lượng mạng (Network Quality) đo lường những gì?

Hệ thống đo lường:
- **ICMP Ping:** Độ trễ khứ hồi (RTT) và tỷ lệ mất gói (`packet_loss: %`).
- **TCP Socket Connect:** Thời gian bắt tay TCP tới port dịch vụ mà không trộn lẫn packet loss giả lập.
- **Gateway Uplink:** Độ trễ tới default gateway của card mạng chính trên Agent.
- **Nhóm Tag linh hoạt:** Phân loại theo Trong nước, Quốc tế, DNS, Database...

---

## 7. Alert Center hỗ trợ gửi cảnh báo qua những kênh nào?

Hỗ trợ 3 kênh phổ biến nhất:
1. **Telegram:** Qua Telegram Bot và Chat ID nhóm/cá nhân.
2. **Discord:** Qua Webhook URL của channel Discord.
3. **Email:** Qua giao thức chuẩn SMTP (hỗ trợ Gmail, Outlook, SMTP server riêng).
Hệ thống có tính năng **Auto-Resolve**, tự động gửi thông báo xanh báo tin hệ thống đã phục hồi.

---

## 8. Làm sao để giải phóng dung lượng ổ cứng VPS do Docker chiếm dụng?

Chạy 2 lệnh dọn dẹp an toàn sau trên VPS:
```bash
# Dọn các layer rác không gắn thẻ
docker image prune -f
# Dọn build cache cũ hơn 7 ngày
docker builder prune -f --filter "until=168h"
```
Khi nâng cấp bằng lệnh `datrix update`, hệ thống cũng tự động kích hoạt quy trình dọn dẹp này kèm cơ chế lọc theo nhãn `datrixops`.
