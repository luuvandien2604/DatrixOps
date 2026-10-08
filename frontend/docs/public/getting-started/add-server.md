---
title: Thêm máy chủ cần giám sát
description: Tạo mã Agent Token và cài đặt Agent 1 dòng lệnh trên Linux, macOS, Windows.
---

# Thêm máy chủ cần giám sát

Để bắt đầu giám sát một máy chủ, bạn cần cài đặt gói DatrixOps Agent gọn nhẹ lên máy chủ đó. Agent sẽ chạy như một dịch vụ nền của hệ điều hành, tự động thu thập các chỉ số phần cứng, tình trạng hệ điều hành và gửi dữ liệu về máy chủ DatrixOps trung tâm qua kết nối an toàn.

---

## Cơ chế đăng ký Agent

DatrixOps sử dụng cơ chế đăng ký dựa trên mã xác thực (Token):
1. Bạn yêu cầu thêm máy chủ mới trên giao diện Dashboard.
2. Hệ thống sinh ra một chuỗi lệnh cài đặt duy nhất kèm **Agent Token** được ký số bảo mật.
3. Bạn chạy dòng lệnh đó trực tiếp trên máy chủ mục tiêu.
4. Agent tự động tải về, đăng ký định danh với DatrixOps server và bắt đầu truyền dữ liệu qua kết nối TLS bảo mật.

> [!NOTE]
> Agent chỉ khởi tạo các kết nối **chiều đi (outbound)** từ máy chủ tới DatrixOps server qua cổng `80` (HTTP) hoặc `443` (HTTPS/WSS). Bạn **không cần mở bất kỳ cổng Inbound nào** trên tường lửa của máy chủ cần giám sát.

---

## Bước 1: Mở hộp thoại Thêm máy chủ

1. Đăng nhập vào bảng điều khiển DatrixOps Dashboard.
2. Trên thanh điều hướng bên trái, nhấn vào mục **Servers** (`/dashboard/servers`).
3. Ở góc trên cùng bên phải màn hình, nhấn nút **Add Server**.
4. Trong cửa sổ hiện lên:
   - Nhập **Tên máy chủ** (ví dụ: `web-production-01` hoặc `db-primary`).
   - Chọn tab hệ điều hành tương ứng: **Linux**, **macOS** hoặc **Windows**.

---

## Bước 2: Chạy lệnh cài đặt Agent

### Trên Linux (Ubuntu, Debian, CentOS, Rocky, AlmaLinux)

Sao chép toàn bộ dòng lệnh được sinh ra và dán vào cửa sổ dòng lệnh máy chủ với quyền `root` (hoặc có `sudo`):

```bash
curl -fsSL https://<ten-mien-datrix-cua-ban>/api/v1/agent/install.sh | sudo bash -s -- \
  --server https://<ten-mien-datrix-cua-ban> \
  --token <AGENT_TOKEN_CUA_BAN>
```

**Những gì kịch bản cài đặt tự động thực hiện:**
- Tự động nhận diện kiến trúc CPU của máy chủ (`amd64` hoặc `arm64`).
- Tải tệp nhị phân `datrix-agent` chính thức về thư mục `/usr/local/bin/datrix-agent`.
- Ghi tệp cấu hình tại `/etc/datrix-agent/agent.yaml`.
- Đăng ký và kích hoạt dịch vụ chạy ngầm `systemd` mang tên `datrix-agent`.
- Kích hoạt chế độ tự khởi động cùng hệ thống khi máy chủ reboot.

### Trên macOS

1. Chọn tab **macOS** trong hộp thoại **Add Server**.
2. Mở ứng dụng **Terminal** trên máy Mac của bạn.
3. Dán và thực thi đoạn mã cài đặt:

```bash
curl -fsSL https://<ten-mien-datrix-cua-ban>/api/v1/agent/install-darwin.sh | bash -s -- \
  --server https://<ten-mien-datrix-cua-ban> \
  --token <AGENT_TOKEN_CUA_BAN>
```

Kịch bản sẽ tự động cấu hình dịch vụ ngầm qua `launchd` (`com.datrixops.agent`).

### Trên Microsoft Windows

1. Chọn tab **Windows** trong hộp thoại **Add Server**.
2. Mở cửa sổ **PowerShell** với quyền **Administrator**.
3. Chạy lệnh cài đặt tự động bằng PowerShell:

```powershell
& ([scriptblock]::Create((irm https://<ten-mien-datrix-cua-ban>/api/v1/agent/install.ps1))) `
  -Server "https://<ten-mien-datrix-cua-ban>" `
  -Token "<AGENT_TOKEN_CUA_BAN>"
```

Trình cài đặt sẽ đăng ký một Windows Service hệ thống tên là `DatrixAgent` và khởi chạy ngay lập tức.

---

## Bước 3: Xác nhận trạng thái kết nối

1. Quay lại trang **Servers** trên bảng điều khiển DatrixOps.
2. Trong vòng 5 đến 10 giây, máy chủ mới sẽ xuất hiện trong danh sách kèm biểu tượng trạng thái màu xanh lá **Online**.
3. Nhấp vào tên máy chủ để mở trang **Chi tiết máy chủ**, các biểu đồ thời gian thực về CPU, RAM, Disk và Network sẽ bắt đầu hiển thị dữ liệu liên tục.

---

## Kiểm tra dịch vụ Agent trên máy chủ

Nếu bạn muốn kiểm tra trạng thái hoạt động của Agent trực tiếp trên máy chủ:

### Trên Linux
```bash
# Kiểm tra trạng thái dịch vụ systemd
sudo systemctl status datrix-agent

# Xem nhật ký hoạt động thời gian thực
sudo journalctl -u datrix-agent -f
```

### Trên macOS
```bash
sudo launchctl list | grep datrix
```

### Trên Windows
```powershell
Get-Service -Name DatrixAgent
```

---

## Bước tiếp theo

- Khám phá các chỉ số chi tiết và quản lý tiến trình trong [Giám sát máy chủ & Dịch vụ](/docs/vi/features/servers).
- Cấu hình đo kiểm độ trễ ping và kết nối mạng tại [Chẩn đoán chất lượng mạng](/docs/vi/features/network-quality).
- Thiết lập thông báo tự động khi máy chủ gặp sự cố tại [Cảnh báo & Kênh thông báo](/docs/vi/features/alerts).
