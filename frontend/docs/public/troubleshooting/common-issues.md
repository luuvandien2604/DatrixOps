---
title: Xử lý sự cố thường gặp
description: Khắc phục lỗi Agent offline, lỗi kết nối mạng, terminal và cấp phát chứng chỉ.
---

# Xử lý sự cố thường gặp

Tài liệu này tổng hợp các bước chẩn đoán và khắc phục nhanh những sự cố thường gặp nhất trong quá trình cài đặt, kết nối máy chủ và vận hành DatrixOps.

---

## 1. Máy chủ báo trạng thái "Offline" hoặc mất tín hiệu

### Hiện tượng
- Máy chủ mới cài Agent nhưng vẫn ở trạng thái `Offline` hoặc `Pending`.
- Máy chủ đang theo dõi bình thường đột ngột chuyển sang màu đỏ báo mất tín hiệu.

### Các bước chẩn đoán & khắc phục

#### Bước 1: Kiểm tra dịch vụ Agent trên máy chủ
Truy cập SSH vào máy chủ đang bị offline và kiểm tra dịch vụ ngầm:

```bash
sudo systemctl status datrix-agent
```

Nếu dịch vụ đang ở trạng thái dừng (`inactive`) hoặc bị lỗi (`failed`), hãy khởi động lại:

```bash
sudo systemctl restart datrix-agent
```

#### Bước 2: Xem nhật ký lỗi gần nhất
Kiểm tra chi tiết thông báo lỗi của dịch vụ:

```bash
sudo journalctl -u datrix-agent -n 50 --no-pager
```

#### Bước 3: Kiểm tra kết nối mạng chiều đi (Outbound) tới DatrixOps
Đảm bảo máy chủ có thể gửi tín hiệu ra ngoài tới DatrixOps server qua cổng HTTPS/WSS:

```bash
curl -Iv https://<ten-mien-datrix-cua-ban>/health
```

- Nếu lệnh bị treo (timed out), tường lửa máy chủ, Security Group hoặc proxy nội bộ đang chặn lưu lượng chiều đi cổng `443`.
- Nếu báo lỗi chứng chỉ SSL (`certificate signed by unknown authority`), hãy kiểm tra lại chứng chỉ HTTPS trên máy chủ DatrixOps trung tâm.

---

## 2. Web Terminal không kết nối được hoặc bị Time Out

### Hiện tượng
- Màn hình Web Terminal hiện dòng chữ `Connecting to server…` một lúc rồi báo lỗi timeout.
- Console của trình duyệt báo lỗi `WebSocket connection failed`.

### Nguyên nhân & Cách khắc phục

#### Nguyên nhân: Reverse Proxy bên ngoài thiếu cấu hình WebSocket
Nếu bạn đặt máy chủ sau một Reverse Proxy bên ngoài (như Nginx, Traefik, HAProxy hoặc AWS ALB):
Hãy chắc chắn proxy đã cấu hình chuyển tiếp đầy đủ header WebSocket:

```nginx
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_set_header Host $host;
```

*(Lưu ý: Cổng Caddy tích hợp sẵn trong DatrixOps đã tự động hỗ trợ WebSocket).*

#### Nguyên nhân: Cloudflare chưa bật chế độ WebSocket
Nếu tên miền của bạn đang bật đám mây màu cam (Proxy) qua Cloudflare:
1. Đăng nhập vào bảng điều khiển Cloudflare.
2. Vào mục cấu hình **Network**.
3. Đảm bảo tùy chọn **WebSockets** đang được gạt sang **ON**.

---

## 3. Đo kiểm chất lượng mạng báo mất gói 100% (Packet Loss)

### Hiện tượng
- Các mục tiêu ICMP ping báo `100% packet loss` hoặc nhãn `Critical` dù máy chủ vẫn truy cập Internet bình thường.

### Nguyên nhân & Cách khắc phục

#### Nguyên nhân: Mục tiêu đích chặn gói tin ICMP Ping
Nhiều hệ thống tường lửa doanh nghiệp hoặc CDN quốc tế mặc định chặn hoàn toàn các gói tin ICMP echo request.
- **Cách khắc phục**: Chuyển phương thức kiểm tra từ `ICMP (Ping)` sang `TCP (Socket)` và điền cổng đang mở của đích đến (ví dụ: cổng `443` hoặc `80`).

#### Nguyên nhân: Quyền tạo Socket thô trên Linux (Raw Socket)
Trên một số môi trường Linux tối giản (như Alpine Linux hoặc Docker container chạy không có quyền `NET_RAW`), tiện ích ping cần được cấp quyền:

```bash
sudo setcap cap_net_raw+ep /usr/local/bin/datrix-agent
```

---

## 4. Lỗi tự động cấp phát chứng chỉ SSL tên miền (Caddy)

### Hiện tượng
- Khi điền `CADDY_SITE_ADDRESS=ops.tenmien.com`, trình duyệt báo `Lỗi kết nối SSL` hoặc `Không thể truy cập trang web`.

### Các bước kiểm tra

1. **Kiểm tra bản ghi DNS**:
   Đảm bảo bản ghi `A` hoặc `AAAA` của tên miền đã trỏ chính xác về địa chỉ IP công khai của máy chủ:
   ```bash
   dig +short ops.tenmien.com
   ```
2. **Kiểm tra mở cổng Inbound 80 và 443**:
   Let's Encrypt bắt buộc cổng `80` (HTTP-01 challenge) và `443` phải thông suốt để xác thực tên miền:
   ```bash
   sudo ufw status
   # Nếu cổng đang đóng, hãy mở:
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   ```
3. **Xem nhật ký hoạt động của Caddy**:
   ```bash
   sudo datrix logs
   ```
   Tìm các dòng có tiền tố `[caddy]` để xem chi tiết thông báo lỗi từ nhà cấp chứng chỉ ACME.

---

## 5. Quên mật khẩu quản trị viên (Admin)

Nếu bạn bị mất mật khẩu đăng nhập vào bảng điều khiển:

1. Truy cập SSH vào máy chủ cài đặt DatrixOps trung tâm.
2. Chạy công cụ quản trị CLI:
   ```bash
   sudo datrix reset-password
   ```
3. Nhập tên tài khoản và gõ mật khẩu mới theo hướng dẫn trên màn hình. Mật khẩu mới sẽ có hiệu lực ngay lập tức mà không cần khởi động lại container.

---

## Bước tiếp theo

- Xem thêm các giải đáp thắc mắc tại [Câu hỏi thường gặp (FAQ)](/docs/vi/troubleshooting/faq).
- Tra cứu danh mục biến môi trường trong [Biến môi trường .env](/docs/vi/reference/configuration).
