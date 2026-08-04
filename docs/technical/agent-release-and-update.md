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
```

## Publish signed release

```bash
./scripts/publish-agent.sh 1.5.0
```

Wrapper gọi `scripts/build-agent-release.sh` và chỉ thực hiện:

1. Load `.env.release`, validate SemVer, HTTPS base URL và key.
2. Tạo staging directory `.VERSION.tmp.*`.
3. Cross-build năm artifact: Linux amd64/arm64, Darwin amd64/arm64, Windows amd64.
4. Verify version marker từng binary.
5. Tool `sign-release` tính size/SHA-256, tạo `manifest.json`, ký raw bytes thành `manifest.sig` 64 byte và verify.
6. Verify toàn bộ release rồi atomically move vào output directory được chỉ định.

Script không sửa tracked source, commit, tag, push, tạo GitHub Release hoặc restart container. Output directory đã tồn tại sẽ bị từ chối; luôn dùng patch version mới. GitHub Actions stage output đã verify vào frontend image và là nơi duy nhất tạo GitHub Release.

## Environment release

| Biến | Ý nghĩa |
|---|---|
| `AGENT_RELEASE_BASE_URL` | HTTPS base dùng tạo artifact URL trong manifest. |
| `AGENT_SIGNING_PRIVATE_KEY_FILE` | Đường dẫn tới private key Base64 mode `0600`; khuyến nghị cho local wrapper. |
| `AGENT_SIGNING_PRIVATE_KEY` | Private key trực tiếp; secret, chỉ fallback. |
| `AGENT_RELEASE_BASE_URL_INCLUDES_VERSION` | `1` khi base URL đã chứa tag/version, như GitHub Releases. |

## Update workflow và trạng thái implementation

Đã triển khai:

- Backend gắn target version/base URL vào task.
- Agent verify Ed25519 trước khi parse manifest.
- Schema, OS/arch, size, SHA-256, executable magic và version marker.
- Atomic task claim, một active update/server, timeout/expiry.
- Backend chỉ complete khi heartbeat đúng desired version.

## Bootstrap Trust Guarantees

Các đảm bảo bảo mật cho Agent release và installer:

- **CE/Cloud Release Pipeline**: Thực hiện kiểm tra toàn vẹn và ký Ed25519 trên toàn bộ 5 binaries qua tool `sign-release` và `verify-release` trước khi đưa vào frontend image hoặc publish GitHub Release.
- **Bootstrap Installers (`install.sh`, `install-mac.sh`, `install.ps1`)**: Kiểm tra định dạng nhị phân (ELF/executable header), dung lượng file khác 0, và mã phản hồi HTTP. Installer hiện chưa trực tiếp thực hiện xác thực chữ ký số Ed25519 `manifest.sig` ở phía client machine trong quá trình bootstrap ban đầu.
- **Lưu ý nâng cấp tương lai**: Việc bổ sung client-side Ed25519 signature verification trực tiếp trong installer script được ghi nhận là một hạng mục hardening kỹ thuật trong tương lai.

## Rollback Agent và Bootstrap Rollback

- **Bootstrap Rollback**: Khi gọi `/api/v1/agent/enroll`, hệ thống cấp credential tạm thời `bootstrap_rollback_token` có thời hạn tối đa 5 phút. Nếu việc tải binary hoặc khởi chạy dịch vụ thất bại, installer sẽ dọn dẹp dịch vụ dở dang và gọi `POST /api/v1/agent/enroll/rollback` để giải phóng token đăng ký ban đầu. Sau khi Agent gửi heartbeat thành công lần đầu tiên, `bootstrap_completed_at` sẽ được ghi nhận và vô hiệu hóa vĩnh viễn quyền rollback.
- **Rollback Agent đã chạy**: Không ghi đè release lỗi. Tăng patch version với fix và publish mới nếu Agent cũ còn online. Nếu binary không khởi động, thay thủ công bằng artifact release tốt đã lưu, restart service và kiểm tra heartbeat. Control plane không thể sửa một Agent hoàn toàn mất kết nối.

