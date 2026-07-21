# Web Terminal and Remote Agent Removal

Tài liệu này mô tả hai luồng vận hành có quyền cao: reverse Web Terminal và gỡ Agent Linux từ xa khi xóa server. Cả hai đều phải được audit, kiểm thử trên Linux headless và không được coi là thay thế kênh cứu hộ SSH/console.

## 1. Web Terminal architecture

```text
Browser
  │ WSS /api/v1/terminal/browser + one-time ticket
  ▼
Nginx/Cloudflare
  │ toàn bộ origin → 127.0.0.1:3000
  ▼
Bundled Caddy gateway
  ├── /api/v1/* → Backend :8080
  └── còn lại   → Frontend :3000
             │
             ▼
Backend Terminal Hub
             ▲
             │ WSS /api/v1/agent/terminal + Agent Token
       Linux Agent outbound channel
             │
             ▼
       PTY + bash/sh
```

Public Nginx không được có `location /api/` trỏ trực tiếp vào `127.0.0.1:8080`. Backend chủ động trả `426 WEBSOCKET_UPGRADE_REQUIRED` khi public origin bypass gateway. Một request Upgrade không có Agent Token qua đường đúng phải trả `401` và header `Via: 1.1 Caddy`.

## 2. Terminal support policy

OS detection và Terminal policy là hai vấn đề khác nhau:

- OS/arch: `runtime.GOOS`, `runtime.GOARCH`.
- capability: Agent có tạo PTY/ConPTY được không.
- policy: terminal có được bật trên host này không.

Linux headless/server là phạm vi hỗ trợ chính. Chế độ `auto` chỉ nên chặn khi có phiên X11/Wayland user đang active; `display-manager.service` tồn tại hoặc active không đủ để kết luận desktop.

`DATRIXOPS_TERMINAL_MODE`:

| Giá trị | Hành vi |
|---|---|
| rỗng hoặc `auto` | Tự phát hiện Linux headless/desktop |
| `server` hoặc `enabled` | Ép bật trên Linux |
| `desktop`, `disabled` hoặc `off` | Tắt Terminal |

Kết quả detection được cache trong process; đổi environment phải restart Agent.

## 3. PTY requirements

Linux/macOS PTY cần tạo session và controlling TTY thật. Chỉ nối stdin/stdout vào `/dev/pts/*` là chưa đủ.

Acceptance check trong Web Terminal:

```bash
tty
ps -o pid,ppid,sid,pgid,tpgid,tty,stat,cmd -p $$
```

Đúng:

- `tty` trả `/dev/pts/N`;
- `TT` là `pts/N`;
- `TPGID` khác `-1`;
- không có `can't access tty; job control turned off`;
- `top`, `vim`, `nano`, `Ctrl+Z`, `jobs`, `fg` hoạt động theo quyền shell.

Agent gửi `session_ready` chỉ sau khi PTY/shell được tạo thành công. Frontend không được đổi sang Connected chỉ dựa trên việc browser WebSocket mở.

## 4. Terminal security controls

- Browser dùng one-time ticket.
- Agent channel dùng per-server Agent Token.
- Một active session/server.
- Session tối đa 30 phút và phải có idle/close cleanup.
- Shell chạy bằng service identity, thường là root trên Linux.
- Session lifecycle được lưu/audit; không ghi command output chứa secret vào application log ngoài chủ đích.
- Không dùng Web Terminal làm kênh recovery duy nhất.

## 5. Terminal diagnostics

```bash
curl --http1.1 -i \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  http://127.0.0.1:3000/api/v1/agent/terminal
```

```bash
curl --http1.1 -i \
  -H 'Connection: Upgrade' \
  -H 'Upgrade: websocket' \
  -H 'Sec-WebSocket-Version: 13' \
  -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
  https://<public-domain>/api/v1/agent/terminal
```

Cả hai phải trả `401` + `Via: 1.1 Caddy`. Phân loại:

| HTTP/log | Ý nghĩa |
|---|---|
| `401` | Đường proxy đúng; request test thiếu Agent Token, hoặc token thật sai nếu xuất hiện trong Agent log |
| `403` | WAF/origin policy chặn |
| `426` | Bypass Caddy hoặc mất WebSocket Upgrade |
| `200`/`404` | Route rơi vào Frontend/sai upstream |
| `502/503` | Backend/upstream không sẵn sàng |

## 6. Remote Agent removal architecture

Remote delete dùng state machine, không hard-delete server record trước khi host cleanup hoàn tất:

```text
DELETE /api/v1/servers/:id
  → validate owner, online < 1 minute, Linux, capability
  → servers.deletion_status = pending
  → expire pending non-destructive tasks
  → insert server_tasks(type=agent_uninstall)
  → HTTP 202

Heartbeat claims agent_uninstall first
  → Agent Prepare(): copy current executable + mode-0600 request
  → Agent reports task result
  → Backend sets deletion_status = uninstalling
  → Agent activates transient systemd helper
  → main Agent exits

Detached helper
  → systemctl disable/stop datrixops-agent.service
  → remove service file/drop-ins/binary/update temp files
  → daemon-reload/reset-failed
  → POST /api/v1/agent/uninstall/confirm using one-time token
  → Backend validates token/task/expiry
  → completed: DELETE server record + cascade
  → failed: retain record with deletion_status=failed and error
```

## 7. Capability and prerequisites

Agent heartbeat advertises:

```json
{
  "remote_uninstall_supported": true
}
```

Linux capability chỉ true khi:

- effective UID là root;
- `systemctl` tồn tại;
- `systemd-run` tồn tại.

Backend còn kiểm tra:

- heartbeat không cũ hơn một phút;
- OS identity là Linux hoặc distro Linux đã biết;
- không có deletion đang `pending`/`uninstalling`;
- chỉ một active `agent_uninstall` task/server.

macOS/Windows trả unsupported ở giai đoạn hiện tại.

## 8. Deletion state and API semantics

| State | Ý nghĩa |
|---|---|
| `active` | Server hoạt động bình thường |
| `pending` | Task đã queue, chờ Agent claim |
| `uninstalling` | Agent đã chuẩn bị helper và bắt đầu cleanup |
| `failed` | Task/helper/callback thất bại; giữ record để recovery |

API:

- `DELETE /api/v1/servers/:id` → queue uninstall, `202 Accepted`.
- `DELETE /api/v1/servers/:id?force=true` → xóa DB record ngay, `200`; không gỡ Agent.
- `POST /api/v1/agent/uninstall/confirm` → one-time helper callback.

Force delete chỉ dành cho host đã mất/offline hoặc recovery có chủ đích. Frontend không nên hiển thị force delete cùng nút remote uninstall khi Agent online và supported.

## 9. One-time confirmation token

Service sinh 32 random bytes, encode Base64 URL-safe và lưu SHA-256 hash trong `servers.uninstall_token_hash`. Raw token chỉ nằm trong task payload/request file helper. Token hết hạn sau 15 phút.

Helper callback gửi:

```json
{
  "server_id": "...",
  "task_id": "...",
  "token": "...",
  "status": "completed|failed",
  "error": "..."
}
```

Helper retry tối đa năm lần trong context 45 giây. Không log raw token hoặc request file content.

## 10. Files removed on Linux

```text
/etc/systemd/system/datrixops-agent.service
/etc/systemd/system/datrixops-agent.service.d/
<running executable>
<running executable>.update
/usr/local/bin/.datrixops-agent.update
```

Helper copy và request file nằm dưới `/usr/local/libexec/datrixops`, mode hạn chế, rồi tự dọn sau khi chạy. Unit được tạo bằng `systemd-run --collect --no-block`, vì vậy thường biến mất khỏi `systemctl list-units` sau khi hoàn tất.

## 11. Operations verification

Agent/host:

```bash
pgrep -a datrixops-agent || echo "Không còn Agent process"
systemctl status datrixops-agent --no-pager || true
test -e /usr/local/bin/datrixops-agent && echo "Binary còn" || echo "Binary đã xóa"
test -e /etc/systemd/system/datrixops-agent.service && echo "Service còn" || echo "Service đã xóa"
```

Helper journal:

```bash
journalctl --since "15 minutes ago" --no-pager |
grep -Ei 'datrixops-agent-uninstall|uninstall helper|confirm'
```

Backend:

```bash
docker compose --env-file .env -f docker-compose.prod.yml logs --since=15m backend |
grep -Ei 'agent_uninstall|uninstall/confirm|DELETE'
```

Successful sequence:

```text
DELETE /api/v1/servers/<id>              status=202
POST /api/v1/agent/uninstall/confirm     status=200
```

## 12. Failure and recovery rules

- Agent chưa nhận task: giữ record; không force delete nếu host còn reachable.
- Helper cleanup failed: callback `failed`, record giữ trạng thái/error.
- Cleanup thành công nhưng callback thất bại: host sạch nhưng record còn `uninstalling`; operator xác minh rồi force delete.
- Record bị xóa trước: Agent heartbeat chuyển `401`; không thể gửi uninstall task nữa, phải gỡ thủ công.
- Unsupported/old Agent: update Agent trước hoặc dùng force delete + manual uninstall.
