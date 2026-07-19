# Agent Development, Signed Release and Update

## Agent lifecycle

Entry point `agent/cmd/agent/main.go` load config, mở reverse-terminal channel, gửi heartbeat đầu với snapshot rồi lặp theo interval. Task hỗ trợ Docker, native service, Agent update/restart và host reboot. Collector chọn implementation theo OS; service identifiers bị validate trước khi gọi command gốc.

Service installation:

- Linux: `/usr/local/bin/datrixops-agent` + `datrixops-agent.service`, `Restart=always`.
- macOS: cùng binary path + `com.datrixops.agent` LaunchDaemon, `KeepAlive`.
- Windows: `C:\Program Files\DatrixOps\datrixops-agent.exe` + wrapper batch + Scheduled Task `DatrixOpsAgent`.

## Version embedding

Release script inject:

```text
-X main.Version=<version>
-X main.VersionMarker=datrixops-agent-version=<version>
```

`verify_embedded_agent_version` đọc trực tiếp binary bằng `grep -aFq`. Không dùng `strings | grep -q` dưới `set -o pipefail`: `grep -q` có thể đóng pipe sớm, làm `strings` nhận SIGPIPE và báo false failure.

## Signing key

Sinh Ed25519 key bằng tool trong `agent/tools/keygen`. Đọc help/source tool trước khi chạy và redirect output vào file permission `0600` ngoài repository. Public key được mã hóa Base64 trong `agent/internal/update/keys.go`; private key chỉ được load từ:

- `AGENT_SIGNING_PRIVATE_KEY` (không ưu tiên vì dễ lộ environment), hoặc
- `AGENT_SIGNING_PRIVATE_KEY_FILE` (khuyến nghị).

`.env.release` chỉ nên chứa đường dẫn key và release config, mode `0600`, nằm ngoài version control. Không ghi private key vào docs, shell history, CI log hoặc image.

Ví dụ an toàn:

```dotenv
AGENT_SIGNING_PRIVATE_KEY_FILE=/root/.datrixops/agent-signing-key.base64
AGENT_RELEASE_BASE_URL=https://example.invalid/releases
AUTO_UPDATE_BACKEND=1
```

## Publish signed release

```bash
./scripts/publish-agent.sh 1.5.0
```

Script thực hiện:

1. Load `.env.release`, validate SemVer, HTTPS base URL và key.
2. Chạy test cho updater/signing tool.
3. Tạo staging directory `.VERSION.tmp.*`.
4. Cross-build năm artifact: Linux amd64/arm64, Darwin amd64/arm64, Windows amd64.
5. Verify version marker từng binary.
6. Tool `sign-release` tính size/SHA-256, tạo `manifest.json`, ký raw bytes thành `manifest.sig` 64 byte và verify.
7. Verify đủ bảy file rồi atomically move vào `frontend/public/releases/<version>/`.
8. Copy năm binary sang root `frontend/public` để installer/legacy updater tương thích.
9. Nếu `AUTO_UPDATE_BACKEND=1`, ghi `AGENT_VERSION` vào `.env`, recreate Backend và verify env trong container.

`AGENT_FORCE=1` cho phép thay release directory đã tồn tại, nhưng policy production là **không tái sử dụng version** khi binary thay đổi. Dùng patch version mới. `MIN_SELF_UPDATING_VERSION` hiện hard-code `1.3.0`.

## Environment release

| Biến | Ý nghĩa |
|---|---|
| `AGENT_RELEASE_BASE_URL` | HTTPS base dùng tạo artifact URL trong manifest. |
| `AGENT_SIGNING_PRIVATE_KEY_FILE` | File Base64 private key, khuyến nghị. |
| `AGENT_SIGNING_PRIVATE_KEY` | Private key trực tiếp; secret, chỉ fallback. |
| `AUTO_UPDATE_BACKEND` | `1`: update `.env` và recreate Backend; `0`: chỉ publish artifact. |
| `AGENT_FORCE` | `1`: cho phép thay version directory đã có; tránh dùng production. |

## Update workflow và trạng thái implementation

Đã triển khai:

- Backend gắn target version/base URL vào task.
- Agent verify Ed25519 trước khi parse manifest.
- Schema, OS/arch, size, SHA-256, executable magic và version marker.
- Atomic task claim, một active update/server, timeout/expiry.
- Backend chỉ complete khi heartbeat đúng desired version.

Chưa hoàn thiện:

- Agent chưa enforce semantic-version anti-downgrade.
- Linux/macOS thay binary cũ trực tiếp, chưa giữ `.bak` bền vững.
- Không có watchdog tự rollback nếu binary mới không heartbeat.
- Root updater token-free chỉ kiểm tra executable magic, không dùng signed manifest.
- Release public key rotation chưa hỗ trợ trust overlap hai key.

## Rollback Agent

Không ghi đè release lỗi. Tăng patch version với fix và publish mới nếu Agent cũ còn online. Nếu binary không khởi động, thay thủ công bằng artifact release tốt đã lưu, restart service và kiểm tra heartbeat. Control plane không thể sửa một Agent hoàn toàn mất kết nối.
