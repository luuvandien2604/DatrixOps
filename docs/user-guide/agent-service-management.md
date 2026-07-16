---
title: "Quản lý Service Agent (Kiểm tra / Dừng / Gỡ bỏ)"
description: "Cách kiểm tra trạng thái, dừng tạm thời, và gỡ bỏ hoàn toàn Agent trên Linux, macOS và Windows."
role: "admin"
order: 10
---

# Quản lý Service Agent

> Áp dụng cho Agent cài qua `install.sh` (Linux), `install-mac.sh` (macOS), `install.ps1` (Windows). Tên service/task và đường dẫn cài đặt liệt kê dưới đây lấy đúng theo `scripts/publish-agent.sh` — không phải tên đoán.

## Linux (systemd)

Agent chạy dưới tên service **`datrixops-agent`**, binary tại `/usr/local/bin/datrixops-agent`, unit file tại `/etc/systemd/system/datrixops-agent.service`.

### Kiểm tra trạng thái
```bash
sudo systemctl status datrixops-agent
```
- `active (running)` → agent đang chạy bình thường.
- `failed` / `inactive` → agent không chạy, xem thêm log bên dưới.

### Xem log
```bash
sudo journalctl -u datrixops-agent -f          # theo dõi log real-time
sudo journalctl -u datrixops-agent -n 100       # 100 dòng gần nhất
```

### Dừng tạm thời (không xoá, không mất cấu hình)
```bash
sudo systemctl stop datrixops-agent
```
Agent sẽ dừng, server chuyển **Offline** trên dashboard sau khoảng 1 phút. Khởi động lại bằng:
```bash
sudo systemctl start datrixops-agent
```

### Vô hiệu hoá tự khởi động cùng OS (mà không dừng ngay)
```bash
sudo systemctl disable datrixops-agent
```

### Gỡ bỏ hoàn toàn
```bash
sudo systemctl stop datrixops-agent
sudo systemctl disable datrixops-agent
sudo rm /etc/systemd/system/datrixops-agent.service
sudo rm /usr/local/bin/datrixops-agent
sudo systemctl daemon-reload
```

---

## macOS (launchd)

Agent chạy dưới label **`com.datrixops.agent`**, binary tại `/usr/local/bin/datrixops-agent`, plist tại `/Library/LaunchDaemons/com.datrixops.agent.plist`.

### Kiểm tra trạng thái
```bash
sudo launchctl list | grep datrixops
```
Có dòng kết quả kèm PID (số ở cột đầu, khác `-`) → đang chạy. Nếu không thấy dòng nào → agent không chạy.

### Xem log
```bash
tail -f /var/log/datrixops-agent.log         # stdout
tail -f /var/log/datrixops-agent.error.log   # stderr
```

### Dừng tạm thời
```bash
sudo launchctl unload /Library/LaunchDaemons/com.datrixops.agent.plist
```
Khởi động lại:
```bash
sudo launchctl load -w /Library/LaunchDaemons/com.datrixops.agent.plist
```

### Gỡ bỏ hoàn toàn
```bash
sudo launchctl unload /Library/LaunchDaemons/com.datrixops.agent.plist
sudo rm /Library/LaunchDaemons/com.datrixops.agent.plist
sudo rm /usr/local/bin/datrixops-agent
sudo rm -f /var/log/datrixops-agent.log /var/log/datrixops-agent.error.log
```

---

## Windows (Task Scheduler)

Agent chạy dưới tên task **`DatrixOpsAgent`** (chạy bằng tài khoản SYSTEM), cài tại `C:\Program Files\DatrixOps\` (gồm `datrixops-agent.exe`, `run_agent.bat`, và `agent.log`).

> Tất cả lệnh dưới đây chạy trong **PowerShell với quyền Administrator**.

### Kiểm tra trạng thái
```powershell
Get-ScheduledTask -TaskName "DatrixOpsAgent" | Get-ScheduledTaskInfo
```
Xem trường `LastTaskResult`: `0` là lần chạy gần nhất OK. Kiểm tra process có thật sự đang chạy:
```powershell
Get-Process datrixops-agent -ErrorAction SilentlyContinue
```

### Xem log
```powershell
Get-Content "C:\Program Files\DatrixOps\agent.log" -Tail 100 -Wait
```
> Log này chỉ có nếu cài bằng bản `install.ps1` mới nhất (đã thêm redirect output ra file — bản cũ hơn không ghi log ở đâu cả).

### Dừng tạm thời
```powershell
Stop-ScheduledTask -TaskName "DatrixOpsAgent"
Stop-Process -Name "datrixops-agent" -Force -ErrorAction SilentlyContinue
```
Khởi động lại:
```powershell
Start-ScheduledTask -TaskName "DatrixOpsAgent"
```

### Gỡ bỏ hoàn toàn
```powershell
Stop-ScheduledTask -TaskName "DatrixOpsAgent" -ErrorAction SilentlyContinue
Stop-Process -Name "datrixops-agent" -Force -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName "DatrixOpsAgent" -Confirm:$false
Remove-Item -Recurse -Force "C:\Program Files\DatrixOps"
```

---

## Sau khi dừng/gỡ Agent — trên Dashboard

- **Dừng tạm thời:** server hiện **Offline** trên dashboard sau ~1 phút không nhận heartbeat, nhưng dữ liệu lịch sử (metrics cũ, cấu hình alert...) vẫn còn nguyên trong DB. Cài/khởi động lại agent với đúng `agent_token` cũ thì server sẽ tự nối lại đúng bản ghi cũ.
- **Gỡ bỏ hoàn toàn khỏi máy chủ, nhưng vẫn muốn xoá luôn server khỏi Dashboard:** vào **Servers**, chọn server tương ứng, dùng chức năng xoá server trên UI — thao tác này khác với việc gỡ agent khỏi VPS, cần làm cả 2 bước nếu muốn dọn sạch hoàn toàn cả 2 phía.

## Lưu ý khi debug

- Server hiện Offline không có nghĩa agent đã bị gỡ — luôn kiểm tra trạng thái service trước khi kết luận, có thể chỉ là agent bị crash hoặc mất mạng.
- Muốn cài lại từ đầu (ví dụ agent bị lỗi không sửa được) — chạy lại đúng lệnh cài đặt gốc (xem [Hướng dẫn cài đặt Agent](/docs/agent-installation)) với **cùng `agent_token`** để tránh bị tạo trùng server mới trên Dashboard.
