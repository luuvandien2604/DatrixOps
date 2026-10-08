---
title: Sao lưu & Khôi phục dữ liệu
description: Sao lưu dữ liệu SQLite, cấu hình hệ thống và di chuyển sang máy chủ mới.
---

# Sao lưu & Khôi phục dữ liệu

Việc bảo vệ dữ liệu DatrixOps của bạn—bao gồm danh sách máy chủ, mục tiêu đo kiểm mạng, lịch sử chỉ số và các quy tắc cảnh báo—rất nhanh gọn và trực quan. Tài liệu này hướng dẫn cách tạo bản sao lưu thủ công, lên lịch sao lưu tự động và quy trình khôi phục nguyên vẹn hệ thống sang máy chủ mới.

---

## Thành phần của bản sao lưu

Một bản sao lưu hoàn chỉnh của DatrixOps bao gồm hai tệp quan trọng nhất:

1. **Tệp cơ sở dữ liệu (`datrixops.db`)**: Cơ sở dữ liệu SQLite lưu trữ danh mục máy chủ, mục tiêu đo mạng, lịch sử sự cố cảnh báo, số liệu phần cứng và tài khoản người dùng.
2. **Tệp biến môi trường (`.env`)**: Chứa chuỗi khóa bí mật JWT, tên miền Caddy và thông tin cấu hình gửi mail SMTP.

---

## Phương pháp 1: Sao lưu tức thời với công cụ `datrix`

Cách nhanh nhất để tạo bản sao lưu là dùng công cụ `datrix` trực tiếp trên máy chủ:

```bash
sudo datrix backup
```

Hoặc chạy trực tiếp tệp script sao lưu:

```bash
sudo /opt/datrixops/deploy/backup.sh
```

### Quá trình thực hiện:
- Sử dụng cơ chế chụp ảnh an toàn trực tuyến (online backup API) của SQLite mà không cần dừng dịch vụ hay khóa bảng ghi.
- Đóng gói tệp dữ liệu cùng tệp cấu hình `.env` vào một tệp nén dung lượng nhỏ.
- Lưu trữ tệp sao lưu tại thư mục `/opt/datrixops/backups/datrixops-backup-<THOI_GIAN>.tar.gz`.

---

## Phương pháp 2: Lên lịch sao lưu tự động hàng ngày qua Cron

Để hệ thống tự động sao lưu định kỳ vào 03:00 sáng mỗi ngày, hãy thiết lập cron job cho tài khoản root:

1. Mở trình chỉnh sửa crontab của root:
   ```bash
   sudo crontab -e
   ```
2. Thêm dòng lệnh sau vào cuối tệp:
   ```cron
   0 3 * * * /opt/datrixops/deploy/backup.sh > /var/log/datrixops-backup.log 2>&1
   ```
3. Lưu lại và thoát.

> [!TIP]
> Bạn nên kết hợp sử dụng các công cụ như `rclone` hoặc `rsync` để đồng bộ định kỳ thư mục `/opt/datrixops/backups/` lên các dịch vụ lưu trữ đám mây bên ngoài (như S3, Google Drive, Wasabi) để đề phòng sự cố cháy nổ phần cứng máy chủ.

---

## Khôi phục hệ thống từ bản sao lưu

Để khôi phục DatrixOps khi gặp sự cố hoặc chuyển sang máy chủ hoàn toàn mới:

### Bước 1: Chuẩn bị máy chủ mới
Cài đặt Docker và Docker Compose trên máy chủ mới, sau đó tải mã nguồn:

```bash
git clone https://github.com/luuvandien2604/DatrixOps.git /opt/datrixops
cd /opt/datrixops
```

### Bước 2: Dừng các container đang chạy
Nếu hệ thống đang chạy tạm, hãy hạ các container xuống:

```bash
sudo docker compose -f deploy/docker-compose.yml down
```

### Bước 3: Giải nén tệp sao lưu
Chép tệp sao lưu (ví dụ: `datrixops-backup-20261008-120000.tar.gz`) vào máy chủ và giải nén:

```bash
sudo tar -xzf datrixops-backup-20261008-120000.tar.gz -C /opt/datrixops/
```

Thao tác này sẽ khôi phục:
- Tệp cấu hình gốc `.env` chứa nguyên vẹn các khóa bí mật mã hóa cũ.
- Tệp cơ sở dữ liệu `datrixops.db` bên trong thư mục `/opt/datrixops/data/`.

### Bước 4: Khởi động lại cụm dịch vụ
Khởi chạy lại các container:

```bash
sudo docker compose -f deploy/docker-compose.yml up -d
```

Kiểm tra trạng thái hoạt động:

```bash
sudo datrix status
```

Mở trình duyệt và truy cập vào địa chỉ bảng điều khiển của bạn. Toàn bộ danh sách máy chủ, lịch sử dữ liệu và các cấu hình cảnh báo sẽ hiển thị đầy đủ ngay lập tức. Các Agent trên máy chủ vệ tinh sẽ tự động kết nối lại trơn tru vì khóa bí mật và mã xác thực không bị thay đổi.

---

## Bước tiếp theo

- Xem bảng mô tả chi tiết cấu hình tại [Biến môi trường .env](/docs/vi/reference/configuration).
- Tham khảo các bước khắc phục lỗi tại [Xử lý sự cố thường gặp](/docs/vi/troubleshooting/common-issues).
