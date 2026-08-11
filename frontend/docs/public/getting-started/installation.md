---
title: "Cài đặt Agent"
description: "Cài đặt, xác nhận kết nối và gỡ DatrixOps Agent trên Linux, macOS và Windows."
---

Mục tiêu là cài Agent dưới service manager của hệ điều hành mà không phải chạy binary thủ công sau mỗi lần khởi động.

## Cài trên Linux

Trong **Servers → Add Server**, sao chép lệnh có token của server. Dạng lệnh tương ứng:

```bash
curl -fsSL https://monitor.example.com/install.sh | sudo bash -s -- \
    --agent-version 1.5.5 \
    --agent-artifact-base-url https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.5 \
  --server https://monitor.example.com \
  --token "<ENROLLMENT_TOKEN>"
```

Installer nhận diện `x86_64/amd64` hoặc `aarch64/arm64`, đặt binary tại `/usr/local/bin/datrixops-agent`, tạo `datrixops-agent.service`, bật tự khởi động và restart service.

Kiểm tra:

```bash
sudo systemctl status datrixops-agent
sudo journalctl -u datrixops-agent -n 100 --no-pager
```

## Cài trên macOS

Chạy lệnh dashboard cung cấp trong Terminal:

```bash
curl -fsSL https://monitor.example.com/install-mac.sh | sudo bash -s -- \
    --agent-version 1.5.5 \
    --agent-artifact-base-url https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.5 \
  --server https://monitor.example.com \
  --token "<ENROLLMENT_TOKEN>"
```

Installer hỗ trợ Intel và Apple Silicon, tạo LaunchDaemon `com.datrixops.agent` và ghi log vào `/var/log/datrixops-agent.log`.

Kiểm tra:

```bash
sudo launchctl print system/com.datrixops.agent
tail -n 100 /var/log/datrixops-agent.log
```

## Cài trên Windows

Mở PowerShell bằng **Run as Administrator**, tải script theo lệnh dashboard và truyền token:

```powershell
.\install.ps1 -ServerUrl "https://monitor.example.com" -Token "<ENROLLMENT_TOKEN>" -AgentVersion "1.5.5" -AgentArtifactBaseUrl "https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.5"
Get-ScheduledTask -TaskName "DatrixOpsAgent"
```

Agent được đặt trong `C:\Program Files\DatrixOps` và chạy bằng Scheduled Task dưới tài khoản `SYSTEM`.

> **Tip:** Dùng chính lệnh trên modal Add Server. Lệnh đó đã gắn đúng token; các đoạn lệnh trong tài liệu chỉ minh họa cấu trúc an toàn.

## Tùy chỉnh danh sách dịch vụ

Tham số dịch vụ là tùy chọn và thay thế danh sách mặc định theo OS:

```bash
curl -fsSL https://monitor.example.com/install.sh | sudo bash -s -- \
    --agent-version 1.5.5 \
    --agent-artifact-base-url https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.5 \
  --server https://monitor.example.com \
  --token "<ENROLLMENT_TOKEN>" \
  --services "nginx,postgresql,docker"
```

```powershell
.\install.ps1 -ServerUrl "https://monitor.example.com" -Token "<ENROLLMENT_TOKEN>" -AgentVersion "1.5.5" -AgentArtifactBaseUrl "https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.5" -Services "EventLog,Schedule,WinRM"
```

## Xác nhận Agent kết nối

1. Quay lại **Servers**.
2. Chờ trạng thái **Online**.
3. Mở server và kiểm tra **Running Agent Version**.
4. Xác nhận CPU, RAM và disk có dữ liệu.

Snapshot tiến trình, dịch vụ và Docker cập nhật chậm hơn heartbeat cơ bản, nên có thể cần chờ đến lần snapshot tiếp theo.

## Gỡ cài đặt

Linux:

```bash
sudo systemctl disable --now datrixops-agent
sudo rm -f /etc/systemd/system/datrixops-agent.service /usr/local/bin/datrixops-agent
sudo systemctl daemon-reload
```

macOS:

```bash
sudo launchctl bootout system /Library/LaunchDaemons/com.datrixops.agent.plist
sudo rm -f /Library/LaunchDaemons/com.datrixops.agent.plist /usr/local/bin/datrixops-agent
```

Windows (PowerShell Administrator):

```powershell
Unregister-ScheduledTask -TaskName "DatrixOpsAgent" -Confirm:$false
Remove-Item "C:\Program Files\DatrixOps" -Recurse -Force
```

Gỡ Agent không tự xóa lịch sử trên dashboard. Xóa server record riêng nếu bạn không còn cần dữ liệu đó.

## Lỗi cài đặt thường gặp

- **Permission denied:** chạy bằng `sudo` hoặc PowerShell Administrator.
- **Unsupported architecture:** kiểm tra `uname -m`; hiện không có Windows ARM artifact.
- **Network timeout/TLS:** kiểm tra DNS, proxy, firewall và đồng hồ hệ thống.
- **Service không chạy:** xem log service tương ứng trước khi cài lại.
- **Token sai/hết hạn/đã dùng:** tạo server mới để nhận enrollment token mới; token này chỉ dùng một lần.
