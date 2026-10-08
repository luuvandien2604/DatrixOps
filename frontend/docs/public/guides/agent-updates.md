---
title: Cập nhật phiên bản Agent
description: Nâng cấp Agent tự động từ Dashboard hoặc bằng lệnh thủ công.
---

# Cập nhật phiên bản Agent

DatrixOps giúp việc duy trì các phiên bản Agent trên hệ thống máy chủ trở nên cực kỳ đơn giản. Bạn có thể kích hoạt cập nhật cho từng máy chủ riêng lẻ hoặc nâng cấp toàn bộ dàn máy chủ chỉ với một cú nhấp chuột.

---

## Cơ chế cập nhật an toàn

Quy trình nâng cấp phiên bản Agent diễn ra khép kín và an toàn:

1. **Thông báo phiên bản mới**: Máy chủ trung tâm DatrixOps gửi thông điệp tới các Agent báo hiệu có phiên bản cập nhật.
2. **Xác thực chữ ký số**: Agent tải tệp nhị phân mới về và tự động kiểm tra mã băm **SHA-256** cùng chữ ký số **Ed25519** nhằm chống giả mạo.
3. **Thay thế nguyên tử (Atomic Replacement)**: Tệp chạy mới được thay thế tệp cũ trên đĩa. Nếu kiểm tra chữ ký thất bại, tiến trình sẽ hủy bỏ ngay lập tức và giữ nguyên phiên bản cũ đang chạy.
4. **Tái khởi động dịch vụ**: Agent tự động khởi động lại dịch vụ hệ thống (`systemd`, `launchd` hoặc Windows Service) và kết nối lại bảng điều khiển chỉ sau vài giây.

---

## Phương pháp 1: Cập nhật 1-Click từ giao diện Dashboard

### Cập nhật cho một máy chủ riêng lẻ
1. Truy cập mục **Servers** (`/dashboard/servers`).
2. Khi có phiên bản mới, huy hiệu **Update Available** sẽ hiển thị cạnh số phiên bản máy chủ.
3. Nhấp vào máy chủ để mở trang **Chi tiết máy chủ**.
4. Ở thanh tác vụ phía trên, nhấn nút **Update Agent**.
5. Trạng thái máy chủ sẽ chuyển tạm thời sang **Updating…** và quay lại trạng thái **Online** với số phiên bản mới trong vòng 10 đến 15 giây.

### Cập nhật hàng loạt toàn bộ cụm máy chủ
1. Mở trang **Servers** (`/dashboard/servers`).
2. Khi có nhiều máy chủ đang dùng phiên bản cũ, nút **Update All Agents** sẽ xuất hiện ở góc trên bên phải.
3. Nhấn **Update All Agents** và xác nhận thao tác.
4. Hệ thống sẽ phát lệnh nâng cấp tới các máy chủ theo từng đợt để tránh gây nghẽn mạng và quá tải hệ thống.

---

## Phương pháp 2: Cập nhật thủ công qua dòng lệnh (CLI)

Nếu bạn cần thao tác trực tiếp trên máy chủ hoặc xử lý một máy chủ bị mất kết nối mạng:

### Trên Linux
Chạy trực tiếp lệnh cập nhật:

```bash
sudo datrix-agent update
```

Ngoài ra, bạn cũng có thể chạy lại dòng lệnh cài đặt từ hộp thoại **Add Server**. Trình cài đặt sẽ tự động nhận diện cấu hình cũ, ghi đè tệp chạy mới và khởi động lại dịch vụ `systemd`.

### Trên macOS
Mở Terminal và thực thi:

```bash
sudo datrix-agent update
```

### Trên Windows
Mở PowerShell với quyền Administrator và chạy:

```powershell
datrix-agent.exe update
```

---

## Kiểm tra sau khi cập nhật

Sau khi nâng cấp, hãy xác nhận phiên bản mới:

### Trên giao diện Web
Tải lại trang **Servers** và kiểm tra chuỗi phiên bản đã hiển thị phiên bản mới nhất chưa, huy hiệu thông báo cập nhật đã biến mất.

### Trên máy chủ
Chạy lệnh kiểm tra phiên bản:

```bash
datrix-agent version
```

---

## Bước tiếp theo

- Nếu quá trình cập nhật gặp lỗi, xem thêm tại [Xử lý sự cố thường gặp](/docs/vi/troubleshooting/common-issues).
- Xem hướng dẫn gỡ bỏ máy chủ trong [Gỡ bỏ Agent & Xóa máy chủ](/docs/vi/guides/uninstall-server).
