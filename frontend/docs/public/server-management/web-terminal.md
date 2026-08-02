---
title: "Web Terminal"
description: "Mở shell Linux headless qua reverse WebSocket, kiểm tra trạng thái và xử lý lỗi kết nối hoặc PTY."
---

## Web Terminal dùng để làm gì?

Web Terminal cho phép quản trị viên mở shell của máy Linux trực tiếp trong Dashboard. Luồng kết nối là:

```text
Trình duyệt
→ DatrixOps Gateway
→ Backend Terminal Hub
→ reverse WebSocket do Agent mở outbound
→ PTY và shell trên máy Linux
```

DatrixOps không cần lưu SSH password/private key và không yêu cầu mở cổng SSH inbound. SSH vẫn nên được giữ như kênh cứu hộ khi Agent hoặc control plane không hoạt động.

## Phạm vi hỗ trợ hiện tại

Web Terminal được ưu tiên cho **Linux headless/server**. Agent chỉ bật channel khi:

- hệ điều hành là Linux;
- Agent có thể tạo PTY;
- không phát hiện phiên desktop X11/Wayland của người dùng đang hoạt động trong chế độ `auto`;
- chính sách Terminal không bị tắt;
- Agent Token còn hợp lệ và reverse WebSocket kết nối được Backend.

macOS, Windows và Linux desktop chưa phải phạm vi hỗ trợ chính thức của Web Terminal ở giai đoạn hiện tại.

> **Important:** Việc máy có cài display manager không tự động đồng nghĩa đó là desktop. Agent chỉ nên coi là desktop khi có phiên đồ họa người dùng đang hoạt động. Quản trị viên có thể dùng `DATRIXOPS_TERMINAL_MODE=server` để ép chế độ server khi auto-detection không phù hợp.

## Mở phiên Terminal

1. Mở **Servers** và chọn máy Linux cần quản trị.
2. Chọn tab **Terminal**.
3. Kiểm tra chấm trạng thái của reverse terminal channel.
4. Nhấn **Start terminal**.
5. Chờ trạng thái **Connected** rồi mới nhập lệnh.

Một server chỉ có một phiên active tại một thời điểm. Ticket của trình duyệt là single-use và phiên có thời gian tối đa 30 phút.

## Kiểm tra PTY

Sau khi kết nối, chạy:

```bash
whoami
pwd
uname -a
tty
ps -o pid,ppid,sid,pgid,tpgid,tty,stat,cmd -p $$
```

Kết quả `tty` đúng phải có dạng:

```text
/dev/pts/2
```

Cột `TT` trong `ps` phải là `pts/…`, `TPGID` không được là `-1`, và shell không còn cảnh báo:

```text
/bin/sh: 0: can't access tty; job control turned off
```

Nếu `tty` có `/dev/pts/...` nhưng `TT` vẫn là `?`, shell đã nối vào PTY nhưng chưa có controlling terminal đúng chuẩn. Hãy cập nhật Agent lên bản có PTY Linux hoàn chỉnh.

## Quyền của shell

Shell chạy với identity của service Agent. Trên Linux cài theo installer chuẩn, identity thường là `root`.

> **Warning:** Web Terminal không phải command allowlist. Mọi lệnh có thể thay đổi hệ thống, xóa dữ liệu hoặc làm máy mất kết nối. Chỉ cấp quyền cho người vận hành tin cậy và đóng phiên ngay khi hoàn tất.

## Trạng thái reverse terminal channel

Kiểm tra Agent log:

```bash
sudo journalctl \
  -u datrixops-agent \
  -n 200 \
  --no-pager |
grep -Ei 'terminal|websocket|connected|disabled|426|401|error'
```

Log kết nối thành công:

```text
Connecting terminal reverse channel to wss://<domain>/api/v1/agent/terminal
Terminal reverse channel connected
```

Nếu Agent tự tắt Terminal do nhận diện môi trường, log sẽ nêu lý do. Với VPS bị nhận diện nhầm, cấu hình systemd drop-in:

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

Xóa override để quay lại chế độ tự động:

```bash
sudo rm -f /etc/systemd/system/datrixops-agent.service.d/terminal.conf
sudo systemctl daemon-reload
sudo systemctl restart datrixops-agent
```

## Kiểm tra reverse proxy

Public traffic phải đi qua DatrixOps Caddy gateway ở host port `3000`. Không cấu hình Nginx location `/api/` trỏ thẳng vào Backend `127.0.0.1:8080`, vì đường đó bypass gateway và làm WebSocket Terminal trả `426`.

Kiểm tra trực tiếp gateway:

```bash
curl --http1.1 -i \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  http://127.0.0.1:3000/api/v1/agent/terminal
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

Không gửi Agent Token trong các lệnh kiểm tra. Kết quả mong đợi là:

```text
HTTP/1.1 401 Unauthorized
Via: 1.1 Caddy
```

`401` ở đây là đúng vì request không có Agent Token. `426` cho biết public origin vẫn bypass gateway hoặc làm mất WebSocket Upgrade.

## Các lỗi thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `Terminal reverse channel disabled` | Agent nhận diện desktop hoặc policy tắt | Kiểm tra session X11/Wayland và `DATRIXOPS_TERMINAL_MODE` |
| `HTTP 401` trong Agent log | Agent Token sai hoặc server record đã bị xóa | Cài lại bằng token hợp lệ hoặc khôi phục server record |
| `HTTP 426` | Nginx/proxy bypass Caddy gateway | Đưa toàn bộ domain qua `127.0.0.1:3000` |
| `200` HTML hoặc `404` | Request rơi vào Frontend/sai route | Kiểm tra upstream và WebSocket Upgrade |
| `502/503` | Gateway không tới được Backend | Kiểm tra container Backend và network Compose |
| `can't access tty` | PTY không có controlling terminal | Cập nhật Agent có PTY Linux hoàn chỉnh |
| Terminal kết nối nhưng không nhận lệnh | Agent chưa gửi `session_ready` hoặc PTY lỗi | Xem Agent/Backend log và cập nhật Agent |
