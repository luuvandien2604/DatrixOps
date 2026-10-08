---
title: Biến môi trường .env
description: Bảng tham chiếu đầy đủ các biến môi trường của máy chủ DatrixOps.
---

# Biến môi trường cấu hình (`.env`)

DatrixOps được cấu hình linh hoạt thông qua tệp môi trường đặt tại `/opt/datrixops/.env`. Tài liệu này giải thích chi tiết ý nghĩa từng biến, giá trị mặc định và ví dụ thực tế giúp bạn tùy biến hệ thống theo nhu cầu.

---

## Cấu hình cổng kết nối & Tên miền (Gateway)

### `CADDY_SITE_ADDRESS`
- **Mô tả**: Xác định cách Caddy tiếp nhận các kết nối mạng gửi đến. Nếu bạn điền một tên miền chuẩn (không kèm cổng port hay giao thức), Caddy sẽ tự động đăng ký và gia hạn chứng chỉ Let's Encrypt SSL qua cổng 443.
- **Mặc định**: `http://:80`
- **Ví dụ thực tế**:
  - `http://203.0.113.10` (Chạy qua địa chỉ IP công khai, không mã hóa SSL)
  - `ops.tenmien.com` (Chạy qua tên miền riêng, tự động kích hoạt HTTPS)

### `PUBLIC_URL`
- **Mô tả**: Địa chỉ URL công khai dùng cho các chuyển hướng trên trình duyệt và các cuộc gọi API từ Agent về máy chủ. Không thêm dấu gạch chéo `/` ở cuối.
- **Mặc định**: *(Tự động suy ra từ `CADDY_SITE_ADDRESS`)*
- **Ví dụ**: `https://ops.tenmien.com`

### `ALLOWED_ORIGINS`
- **Mô tả**: Danh sách các tên miền trình duyệt được phép gọi API qua cơ chế CORS (phân tách bởi dấu phẩy).
- **Mặc định**: Tương tự giá trị `PUBLIC_URL`
- **Ví dụ**: `https://ops.tenmien.com,https://admin.tenmien.com`

---

## Bảo mật & Xác thực tài khoản

### `JWT_SECRET`
- **Mô tả**: Khóa bí mật dùng để ký và giải mã các mã thông báo đăng nhập (JWT token) và mã khóa API. Phải là một chuỗi ngẫu nhiên có độ dài tối thiểu 32 ký tự.
- **Cách sinh chuỗi**: `openssl rand -base64 48`
- **Bắt buộc**: Có

### `SETUP_TOKEN`
- **Mô tả**: Mã bí mật dùng một lần cho giao diện khởi tạo lần đầu (Setup Wizard). Ngăn chặn người lạ chiếm quyền quản trị khi máy chủ vừa cài đặt xong mà chưa tạo tài khoản admin.
- **Cách sinh chuỗi**: `openssl rand -hex 32`

### `ENABLE_PUBLIC_REGISTRATION`
- **Mô tả**: Cho phép hoặc chặn người lạ tự ý đăng ký tài khoản mới ngoài màn hình đăng nhập mà không có lời mời từ quản trị viên.
- **Mặc định**: `false` (Khuyến nghị giữ `false` để đảm bảo an toàn)
- **Tùy chọn**: `true` | `false`

---

## Bật / Tắt tính năng hệ thống (Feature Flags)

| Biến môi trường | Mặc định | Mô tả chức năng |
| :--- | :--- | :--- |
| `ENABLE_WEB_TERMINAL` | `true` | Bật/tắt tính năng mở terminal dòng lệnh trực tiếp trên trình duyệt. |
| `ENABLE_SERVICE_CONTROLS` | `true` | Cho phép khởi động, dừng hoặc restart dịch vụ hệ thống từ giao diện web. |
| `ENABLE_READ_ONLY_LOGS` | `true` | Cho phép xem nhật ký container và dịch vụ trên Dashboard. |
| `ENABLE_REMOTE_SCRIPTS` | `true` | Cho phép chạy các kịch bản lệnh chẩn đoán từ bảng điều khiển. |

---

## Chính sách lưu trữ dữ liệu (Data Retention)

DatrixOps tự động dọn dẹp các bản ghi số liệu cũ định kỳ để tối ưu hiệu năng và tránh làm đầy ổ cứng.

### `METRICS_RETENTION_DAYS`
- **Mô tả**: Số ngày lưu trữ số liệu chuỗi thời gian chi tiết (CPU, RAM, Disk, băng thông mạng và kết quả đo kiểm chất lượng mạng).
- **Mặc định**: `7` ngày (Khuyến nghị: 7 đến 30 ngày)

### `OPERATIONAL_RETENTION_DAYS`
- **Mô tả**: Số ngày lưu trữ nhật ký sự cố cảnh báo, lịch sử truy vết người dùng (Audit Trail) và các lần gián đoạn dịch vụ.
- **Mặc định**: `90` ngày

---

## Phiên bản hệ thống & Phân phối Agent

### `DATRIXOPS_VERSION`
- **Mô tả**: Phiên bản phát hành của máy chủ trung tâm DatrixOps đang chạy.
- **Ví dụ**: `1.8.73`

### `AGENT_VERSION`
- **Mô tả**: Phiên bản phát hành mục tiêu của Agent mà máy chủ khuyến nghị các máy con cập nhật lên.
- **Ví dụ**: `1.5.12`

---

## Áp dụng thay đổi cấu hình

Mỗi khi bạn chỉnh sửa tệp `/opt/datrixops/.env`, hãy khởi động lại cụm dịch vụ để cập nhật giá trị mới:

```bash
sudo datrix restart
```

Hoặc dùng trực tiếp lệnh Docker Compose:

```bash
cd /opt/datrixops
sudo docker compose --env-file .env -f deploy/docker-compose.yml up -d
```

---

## Bước tiếp theo

- Xem hướng dẫn sao lưu tệp cấu hình tại [Sao lưu & Khôi phục dữ liệu](/docs/vi/guides/backup-restore).
- Tìm hiểu các lệnh quản trị trong [Lệnh CLI datrix](/docs/vi/reference/cli).
