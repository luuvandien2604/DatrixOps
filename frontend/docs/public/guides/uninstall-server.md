---
title: Gỡ bỏ Agent & Xóa máy chủ
description: Gỡ bỏ Agent an toàn, dọn dẹp tiến trình và xóa máy chủ khỏi Dashboard.
---

# Gỡ bỏ Agent & Xóa máy chủ

Khi bạn hủy máy chủ ảo (VPS), ngừng sử dụng máy chủ vật lý hoặc tái cấu trúc lại hạ tầng mạng, bạn có thể gỡ bỏ hoàn toàn máy chủ đó khỏi DatrixOps một cách sạch sẽ.

---

## Phương pháp 1: Gỡ cài đặt từ xa qua Dashboard (Khuyến nghị)

Nếu máy chủ hiện đang ở trạng thái **Online**, DatrixOps hỗ trợ gửi lệnh tự gỡ cài đặt từ xa:

1. Vào mục **Servers** (`/dashboard/servers`) và nhấp chọn máy chủ cần xóa.
2. Chọn tab **Settings**.
3. Cuộn xuống khu vực cảnh báo **Danger Zone**.
4. Nhấn nút **Uninstall Agent & Remove Server**.
5. Trong hộp thoại xác nhận, nhập tên máy chủ để xác thực thao tác.

### Những gì hệ thống tự động xử lý:
- Máy chủ DatrixOps gửi lệnh gỡ cài đặt tới Agent qua kênh kết nối bảo mật.
- Agent tự động dừng tiến trình dịch vụ nền (`systemd`, `launchd` hoặc Windows Service).
- Hủy đăng ký dịch vụ hệ thống, xóa tệp nhị phân tại `/usr/local/bin/datrix-agent` và xóa toàn bộ thư mục cấu hình `/etc/datrix-agent`.
- Bản ghi máy chủ và toàn bộ dữ liệu lịch sử đo kiểm được xóa sạch khỏi cơ sở dữ liệu DatrixOps.

---

## Phương pháp 2: Xóa bắt buộc (Force Delete cho máy chủ Offline)

Nếu máy chủ ảo của bạn đã bị xóa trên nhà cung cấp cloud, hỏng ổ cứng hoặc mất kết nối vĩnh viễn, lệnh gỡ cài đặt từ xa sẽ không thể gửi tới Agent.

Trong trường hợp này:
1. Mở tab **Settings** của máy chủ đó.
2. Tại khu vực **Danger Zone**, nhấn nút **Force Delete Server**.
3. Xác nhận xóa máy chủ.
4. DatrixOps sẽ lập tức dọn dẹp bản ghi máy chủ, các mục tiêu đo kiểm mạng liên quan và các quy tắc cảnh báo khỏi cơ sở dữ liệu mà không cần đợi Agent phản hồi.

---

## Phương pháp 3: Gỡ cài đặt thủ công trực tiếp trên máy chủ

Nếu bạn đã xóa máy chủ trên Dashboard trước hoặc muốn tự tay gỡ bỏ Agent bằng dòng lệnh:

### Trên Linux (systemd)

Chạy các lệnh sau dưới quyền `root` (hoặc dùng `sudo`):

```bash
# 1. Dừng và vô hiệu hóa dịch vụ agent
sudo systemctl stop datrix-agent
sudo systemctl disable datrix-agent

# 2. Xóa tệp cấu hình dịch vụ systemd
sudo rm -f /etc/systemd/system/datrix-agent.service
sudo systemctl daemon-reload
sudo systemctl reset-failed

# 3. Xóa tệp thực thi và thư mục cấu hình
sudo rm -f /usr/local/bin/datrix-agent
sudo rm -rf /etc/datrix-agent
```

### Trên macOS

```bash
# 1. Dừng dịch vụ launchd
sudo launchctl bootout system/com.datrixops.agent

# 2. Xóa tệp cấu hình và tệp thực thi
sudo rm -f /Library/LaunchDaemons/com.datrixops.agent.plist
sudo rm -f /usr/local/bin/datrix-agent
sudo rm -rf /etc/datrix-agent
```

### Trên Microsoft Windows

Mở cửa sổ **PowerShell** với quyền **Administrator**:

```powershell
# 1. Dừng và hủy dịch vụ Windows Service
Stop-Service -Name DatrixAgent -ErrorAction SilentlyContinue
sc.exe delete DatrixAgent

# 2. Xóa thư mục cài đặt
Remove-Item -Path "C:\Program Files\DatrixAgent" -Recurse -Force
```

---

## Bước tiếp theo

- Thêm máy chủ thay thế mới tại [Thêm máy chủ cần giám sát](/docs/vi/getting-started/add-server).
- Xem tổng quan toàn bộ cụm máy chủ tại [Giám sát máy chủ & Dịch vụ](/docs/vi/features/servers).
