---
title: "Hướng dẫn cài đặt Agent"
description: "Các bước để cài đặt và kích hoạt Agent trên máy chủ của bạn."
role: "public"
order: 2
---

# Hướng dẫn cài đặt Agent

Để hệ thống DatrixOps có thể thu thập thông tin và giám sát máy chủ của bạn, bạn cần cài đặt một phần mềm nhỏ gọi là **Agent**.

## Các bước thực hiện

### Bước 1: Lấy mã cài đặt

1. Đăng nhập vào bảng điều khiển DatrixOps.
2. Chọn menu **Servers** ở thanh điều hướng bên trái.
3. Click vào nút **Add Server**.
4. Màn hình sẽ hiển thị cho bạn một lệnh `curl` kèm theo **Agent Token** dùng một lần. Lệnh này sẽ tự động tải Script cài đặt, gán Token, cấu hình dịch vụ Systemd và khởi chạy Agent.

### Bước 2: Chạy lệnh trên máy chủ

Truy cập SSH vào máy chủ (VPS/Server) mà bạn muốn giám sát bằng quyền `root`, sau đó dán và chạy lệnh đã sao chép.

Ví dụ lệnh cài đặt:

```bash
curl -sSL http://<your_backend_ip>/install-agent.sh | bash -s -- --token YOUR_TOKEN_HERE
```

*(Lưu ý: Thay thế `YOUR_TOKEN_HERE` bằng token lấy từ giao diện web).*

### Bước 3: Xác nhận kết nối

Quay lại bảng điều khiển DatrixOps trên trình duyệt, máy chủ mới của bạn sẽ xuất hiện trong danh sách với trạng thái **Online** màu xanh lá. Điều này đồng nghĩa với việc Agent đã bắt đầu gửi dữ liệu giám sát (heartbeat) thành công.

## Quản lý dịch vụ Agent

Sau khi cài đặt, Agent sẽ chạy ngầm bằng systemd với tên dịch vụ là `datrix-agent`. Bạn có thể sử dụng các lệnh sau để quản lý:

- **Kiểm tra trạng thái:** `systemctl status datrix-agent`
- **Khởi động lại:** `systemctl restart datrix-agent`
- **Xem log (lỗi, hoạt động):** `journalctl -u datrix-agent -f`
- **Dừng Agent:** `systemctl stop datrix-agent`
