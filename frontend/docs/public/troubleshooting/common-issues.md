---
title: "Xử lý sự cố"
description: "Chẩn đoán Agent offline, update, Web Terminal, remote uninstall, quyền và kết nối mạng."
---

Luôn bắt đầu bằng ba dữ kiện: Agent service có chạy không, log nói gì, và host có kết nối được endpoint DatrixOps không.

## Agent không online

Linux:

```bash
sudo systemctl status datrixops-agent --no-pager
sudo journalctl -u datrixops-agent -n 200 --no-pager
curl -I https://monitor.example.com
```

macOS:

```bash
sudo launchctl print system/com.datrixops.agent
tail -n 200 /var/log/datrixops-agent.log
```

Windows PowerShell:

```powershell
Get-ScheduledTask -TaskName "DatrixOpsAgent"
Get-Content "C:\Program Files\DatrixOps\agent.log" -Tail 200
```

Lỗi `401` ở heartbeat thường là Agent Token không khớp hoặc server record đã bị xóa, không phải JWT của trình duyệt.

## Server không xuất hiện hoặc thiếu IP

Xác nhận bạn đang ở đúng tài khoản/workspace và đã cài bằng token của server record vừa tạo. IP và inventory đến từ snapshot chi tiết, nên chờ lần snapshot tiếp theo sau heartbeat đầu tiên.

## Sai version hoặc không có thông báo update

Version ở UI phải đến từ heartbeat. Restart Agent và kiểm tra log startup. Nếu latest version sai, người quản trị cần kiểm tra `AGENT_VERSION` trong Backend đang chạy và release đã publish. Khi source Backend/Frontend thay đổi, phải build lại image tương ứng.

## Update failed hoặc bị kẹt

1. Đọc trạng thái task trên Overview thay vì chỉ nhìn toast.
2. Chờ tối đa timeout của task; task stale sẽ được đánh dấu failed/timed out.
3. Tìm lỗi `manifest`, `signature`, `checksum`, `permission` hoặc restart trong Agent log.
4. Kiểm tra host truy cập được `/releases/<version>/manifest.json`, `manifest.sig` và artifact đúng OS/arch.
5. Thành công chỉ được xác nhận khi Agent restart và heartbeat báo đúng target version.

## Lỗi cấp phát SSL hoặc Caddy Gateway không hoạt động

1. **Trùng cổng 80 hoặc 443 trên máy chủ Host:**
   - Nếu máy chủ đã cài sẵn Nginx, Apache hoặc dịch vụ khác đang chiếm port 80/443, Caddy sẽ không thể khởi động.
   - Kiểm tra tiến trình đang chiếm cổng:
     ```bash
     sudo ss -tulpn | grep -E ':(80|443)'
     ```
   - Xử lý: Tắt dịch vụ cũ (`sudo systemctl stop nginx`) hoặc đổi port ngoài của DatrixOps trong file `/opt/datrixops/.env` (`DATRIXOPS_HTTP_PORT` và `DATRIXOPS_HTTPS_PORT`).

2. **Tên miền chưa trỏ đúng IP hoặc DNS chưa nhận diện:**
   - Caddy sử dụng Let's Encrypt / ZeroSSL qua giao thức ACME HTTP-01 challenge. CA bắt buộc phải kết nối được tới IP máy chủ qua port 80.
   - Kiểm tra DNS domain:
     ```bash
     dig +short your-domain.com
     ```
   - Xem log chi tiết quá trình xin cert của Caddy:
     ```bash
     cd /opt/datrixops && docker compose -f deploy/docker-compose.yml logs -f gateway
     ```

3. **Kiểm tra chứng chỉ SSL đã được cấp trong Caddy:**
   ```bash
   docker exec -it $(docker ps -qf name=gateway) find /data/caddy/certificates -type f
   ```

## Đầy ổ cứng VPS do Docker Cache & Images

Nếu dung lượng ổ cứng tăng cao sau nhiều lần vận hành hoặc nâng cấp:
1. **Kiểm tra dung lượng Docker đang chiếm:**
   ```bash
   docker system df
   ```
2. **Dọn dẹp an toàn cho DatrixOps (Không xóa container khác):**
   ```bash
   # Dọn layer rác không gắn thẻ
   docker image prune -f
   # Dọn build cache cũ hơn 7 ngày
   docker builder prune -f --filter "until=168h"
   ```

## Permission denied hoặc service không khởi động

Installer cần root/Administrator. Kiểm tra owner và executable bit của binary trên Linux/macOS, sau đó xem log service. Không chạy installer lặp lại trước khi hiểu lỗi vì việc đó có thể che mất nguyên nhân ban đầu.

## Network timeout và firewall

Cho phép DNS, HTTPS và WSS outbound tới domain DatrixOps. Reverse terminal cần WebSocket Upgrade xuyên qua Cloudflare/Nginx/Caddy. Kiểm tra proxy doanh nghiệp có chặn WebSocket hoặc thay chứng thư TLS hay không.

## Agent online nhưng Terminal channel disconnected

Kiểm tra log Agent:

```bash
sudo journalctl \
  -u datrixops-agent \
  -n 200 \
  --no-pager |
grep -Ei 'terminal|websocket|connected|disabled|401|426|error'
```

Public origin phải đưa toàn bộ traffic vào Caddy gateway (cổng 80/443). Không để reverse proxy bên ngoài có block `/api/` trỏ trực tiếp tới Backend `127.0.0.1:8080` làm mất header nâng cấp WebSocket.

Kiểm tra trực tiếp gateway:

```bash
curl --http1.1 -i \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  http://127.0.0.1/api/v1/agent/terminal
```

Kiểm tra public domain:

```bash
curl --http1.1 -i \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://<domain>/api/v1/agent/terminal
```

Không gửi Agent Token. Cả hai request phải trả `401 Unauthorized` và có `Via: 1.1 Caddy`.

| Kết quả | Diễn giải |
|---|---|
| `401` + `Via: 1.1 Caddy` | Gateway và WebSocket Upgrade đúng; request test chỉ thiếu Agent Token |
| `426` | Public origin bypass gateway hoặc mất Upgrade header |
| `200` HTML/`404` | Request rơi vào Frontend hoặc sai upstream |
| `502/503` | Gateway không kết nối được Backend |
| TLS/timeout | DNS, certificate, clock, firewall hoặc proxy timeout |

Xem hướng dẫn đầy đủ tại [Web Terminal](/docs/server-management/web-terminal).

## Terminal mở được nhưng cảnh báo `can't access tty`

Chạy trong Web Terminal:

```bash
tty
ps -o pid,ppid,sid,pgid,tpgid,tty,stat,cmd -p $$
```

Nếu `tty` là `/dev/pts/...` nhưng `TT` vẫn là `?` hoặc `TPGID=-1`, Agent chưa tạo controlling terminal đúng chuẩn. Cập nhật Agent lên bản PTY Linux mới. Kết quả đúng phải có `TT=pts/...` và `TPGID` là process group foreground.

## Terminal bị tắt do nhận diện desktop

Kiểm tra log có dòng `Terminal reverse channel disabled`. Với Linux headless bị nhận diện nhầm, có thể ép chế độ server:

```bash
sudo mkdir -p /etc/systemd/system/datrixops-agent.service.d

sudo tee \
  /etc/systemd/system/datrixops-agent.service.d/terminal.conf \
  >/dev/null <<'SYSTEMD'
[Service]
Environment="DATRIXOPS_TERMINAL_MODE=server"
SYSTEMD

sudo systemctl daemon-reload
sudo systemctl restart datrixops-agent
```

Cơ chế auto đúng chỉ coi là desktop khi có phiên X11/Wayland người dùng đang active, không chỉ vì display manager tồn tại.

## Gỡ Agent và xóa server bị kẹt

Khi bấm **Uninstall Agent & Delete**, request đúng phải trả `202 Accepted`. Server phải đi qua các trạng thái:

```text
Waiting for Agent uninstall
→ Uninstalling Agent
→ server biến mất sau callback xác nhận
```

Xem Agent log:

```bash
sudo journalctl \
  -u datrixops-agent \
  -n 200 \
  --no-pager |
grep -Ei 'agent_uninstall|uninstall|received task|shutting down'
```

Log mong đợi:

```text
Received task ...: agent_uninstall
Received agent_uninstall task. Preparing detached Linux helper...
Agent shutting down gracefully...
```

Kiểm tra helper tách rời:

```bash
sudo journalctl \
  --since "15 minutes ago" \
  --no-pager |
grep -Ei 'datrixops-agent-uninstall|uninstall helper|confirm'
```

Kiểm tra Backend callback:

```bash
docker compose \
  --env-file .env \
  -f docker-compose.prod.yml \
  logs --since=15m backend |
grep -Ei 'uninstall/confirm|agent_uninstall|DELETE'
```

Luồng thành công có:

```text
DELETE /api/v1/servers/<id>                status 202
POST /api/v1/agent/uninstall/confirm       status 200
```

Nếu Agent dừng nhưng service/binary vẫn còn, helper bị lỗi sau bước stop. Nếu máy đã gỡ sạch nhưng server vẫn hiện `Uninstalling Agent`, callback xác nhận thất bại. Xem [Gỡ Agent và xóa server](/docs/server-management/delete-server).

## Server biến mất nhưng Agent vẫn chạy và heartbeat trả `401`

Đây là dấu hiệu server record đã bị force delete hoặc backend cũ đã xóa record trước khi Agent nhận task. Agent Token không còn hợp lệ nên Agent không thể nhận lệnh uninstall nữa. Gỡ thủ công:

```bash
sudo systemctl disable --now datrixops-agent.service
sudo rm -f /etc/systemd/system/datrixops-agent.service
sudo rm -rf /etc/systemd/system/datrixops-agent.service.d
sudo rm -f /usr/local/bin/datrixops-agent
sudo rm -f /usr/local/bin/datrixops-agent.update
sudo rm -f /usr/local/bin/.datrixops-agent.update
sudo systemctl daemon-reload
sudo systemctl reset-failed datrixops-agent.service
```

## Dữ liệu biểu đồ bị đứt

Khoảng đứt khi Agent offline là hành vi đúng: hệ thống không nối giả giữa hai điểm không có heartbeat. Nếu Agent vẫn online, kiểm tra log lỗi gửi heartbeat và thời gian hệ thống. Snapshot tiến trình/dịch vụ cập nhật chậm hơn metrics cơ bản.

## Lấy log và báo lỗi

Khi báo lỗi, cung cấp:

- OS và architecture;
- Agent version hiển thị trong log startup;
- thời điểm xảy ra kèm timezone;
- task state/error đã được che token;
- đoạn log ngắn liên quan.

Không gửi Agent Token, JWT, private signing key, uninstall one-time token, database URL hoặc toàn bộ file environment.
