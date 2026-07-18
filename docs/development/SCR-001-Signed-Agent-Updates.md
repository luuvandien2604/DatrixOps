# SCR-001 — Signed Agent Updates

**Ưu tiên:** P0  
**Mục tiêu:** Agent chỉ cài binary chính thức, đã được xác minh chữ ký và checksum.

---

## Mục lục

1. [Tổng quan](#1-tổng-quan)
2. [Luồng cập nhật mới](#2-luồng-cập-nhật-mới)
3. [Bước 1 — Tạo nhánh triển khai](#3-bước-1--tạo-nhánh-triển-khai)
4. [Bước 2 — Chốt định dạng release manifest](#4-bước-2--chốt-định-dạng-release-manifest)
5. [Bước 3 — Sinh khóa Ed25519](#5-bước-3--sinh-khóa-ed25519)
6. [Bước 4 — Nhúng public key vào Agent](#6-bước-4--nhúng-public-key-vào-agent)
7. [Bước 5 — Tạo chương trình ký manifest](#7-bước-5--tạo-chương-trình-ký-manifest)
8. [Bước 6 — Nâng cấp script publish Agent](#8-bước-6--nâng-cấp-script-publish-agent)
9. [Bước 7 — Thêm `--version` và `self-test`](#9-bước-7--thêm---version-và-self-test)
10. [Bước 8 — So sánh semantic version](#10-bước-8--so-sánh-semantic-version)
11. [Bước 9 — Tải và xác minh manifest](#11-bước-9--tải-và-xác-minh-manifest)
12. [Bước 10 — Tải binary và xác minh checksum](#12-bước-10--tải-binary-và-xác-minh-checksum)
13. [Bước 11 — Kiểm tra đúng kiến trúc binary](#13-bước-11--kiểm-tra-đúng-kiến-trúc-binary)
14. [Bước 12 — Chạy self-test trên staged binary](#14-bước-12--chạy-self-test-trên-staged-binary)
15. [Bước 13 — Thay payload task `agent_update`](#15-bước-13--thay-payload-task-agent_update)
16. [Bước 14 — Tách updater khỏi `main.go`](#16-bước-14--tách-updater-khỏi-maingo)
17. [Bước 15 — Thiết kế rollback đúng](#17-bước-15--thiết-kế-rollback-đúng)
18. [Bước 16 — Thêm command `update-helper`](#18-bước-16--thêm-command-update-helper)
19. [Bước 17 — Restart service theo hệ điều hành](#19-bước-17--restart-service-theo-hệ-điều-hành)
20. [Bước 18 — Tạo pending update state](#20-bước-18--tạo-pending-update-state)
21. [Bước 19 — Xác nhận update sau heartbeat](#21-bước-19--xác-nhận-update-sau-heartbeat)
22. [Bước 20 — Tạo bảng `agent_update_events`](#22-bước-20--tạo-bảng-agent_update_events)
23. [Bước 21 — Tạo update event khi queue task](#23-bước-21--tạo-update-event-khi-queue-task)
24. [Bước 22 — API cập nhật tiến trình](#24-bước-22--api-cập-nhật-tiến-trình)
25. [Bước 23 — Xử lý rollback event](#25-bước-23--xử-lý-rollback-event)
26. [Bước 24 — Sửa task lifecycle](#26-bước-24--sửa-task-lifecycle)
27. [Bước 25 — Frontend hiển thị tiến trình](#27-bước-25--frontend-hiển-thị-tiến-trình)
28. [Bước 26 — An toàn cho installer ban đầu](#28-bước-26--an-toàn-cho-installer-ban-đầu)
29. [Bước 27 — Kiểm thử Agent updater](#29-bước-27--kiểm-thử-agent-updater)
30. [Bước 28 — Backend integration tests](#30-bước-28--backend-integration-tests)
31. [Bước 29 — Thứ tự commit](#31-bước-29--thứ-tự-commit)
32. [Bước 30 — Quy trình release](#32-bước-30--quy-trình-release)
33. [Definition of Done](#33-definition-of-done)
34. [Phần nên làm đầu tiên](#34-phần-nên-làm-đầu-tiên)

---

## 1. Tổng quan

Hiện updater nằm chủ yếu tại:

```text
agent/cmd/agent/main.go
scripts/publish-agent.sh
backend/internal/core/agent_api/handler.go
backend/internal/core/admin/handler.go
frontend/src/app/dashboard/servers/page.tsx
```

Luồng hiện tại:

```text
Tải binary trực tiếp
→ kiểm tra ELF/MZ/Mach-O
→ ghi đè binary
→ restart
```

Vấn đề là kiểm tra magic header chỉ xác nhận file có định dạng executable, không xác nhận binary có phải bản chính thức của DatrixOps hay không.

---

## 2. Luồng cập nhật mới

```text
Tải manifest và chữ ký
→ xác minh Ed25519
→ parse manifest
→ chọn artifact đúng OS/architecture
→ chống downgrade
→ tải binary
→ xác minh SHA-256
→ kiểm tra kiến trúc binary
→ chạy self-test
→ backup binary cũ
→ helper thay binary
→ restart service
→ agent mới gửi heartbeat
→ xác nhận thành công hoặc rollback
```

---

## 3. Bước 1 — Tạo nhánh triển khai

```bash
cd DatrixOps
git checkout -b feature/scr-001-signed-agent-updates
```

Chạy baseline:

```bash
cd agent
go test ./...
go build ./cmd/agent

cd ../backend
go test ./...
go build ./cmd/api
```

---

## 4. Bước 2 — Chốt định dạng release manifest

Tạo file:

```text
agent/internal/update/manifest.go
```

Manifest mẫu:

```json
{
  "schema_version": 1,
  "version": "1.6.0",
  "published_at": "2026-07-18T15:00:00Z",
  "artifacts": [
    {
      "os": "linux",
      "arch": "amd64",
      "url": "https://datrixops.example.com/releases/1.6.0/datrixops-agent-linux-amd64",
      "sha256": "6d05...",
      "size": 14320896
    }
  ]
}
```

Go model:

```go
package update

import "time"

type Manifest struct {
	SchemaVersion int        `json:"schema_version"`
	Version       string     `json:"version"`
	PublishedAt   time.Time  `json:"published_at"`
	Artifacts     []Artifact `json:"artifacts"`
}

type Artifact struct {
	OS     string `json:"os"`
	Arch   string `json:"arch"`
	URL    string `json:"url"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

func (m Manifest) ArtifactFor(goos, goarch string) (Artifact, bool) {
	for _, artifact := range m.Artifacts {
		if artifact.OS == goos && artifact.Arch == goarch {
			return artifact, true
		}
	}
	return Artifact{}, false
}
```

### Quy tắc ký manifest

Phải ký raw bytes chính xác của `manifest.json`.

Không làm:

```text
Đọc JSON
→ unmarshal
→ marshal lại
→ verify
```

Phải làm:

```text
manifestBytes := tải manifest.json
signatureBytes := tải manifest.sig
ed25519.Verify(publicKey, manifestBytes, signatureBytes)
```

Chỉ parse JSON sau khi chữ ký hợp lệ.

---

## 5. Bước 3 — Sinh khóa Ed25519

Tạo utility:

```text
tools/keygen/main.go
```

```go
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"log"
)

func main() {
	publicKey, privateKey, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println("PUBLIC_KEY_BASE64=" +
		base64.StdEncoding.EncodeToString(publicKey))

	fmt.Println("PRIVATE_KEY_BASE64=" +
		base64.StdEncoding.EncodeToString(privateKey))
}
```

Chạy:

```bash
go run ./tools/keygen
```

Lưu:

- `PUBLIC_KEY_BASE64`: có thể commit vào source Agent.
- `PRIVATE_KEY_BASE64`: chỉ lưu trong CI/CD Secret.
- Không commit private key vào repository.

GitHub Secret đề xuất:

```text
AGENT_SIGNING_PRIVATE_KEY
```

---

## 6. Bước 4 — Nhúng public key vào Agent

Tạo:

```text
agent/internal/update/keys.go
```

```go
package update

import (
	"crypto/ed25519"
	"encoding/base64"
	"fmt"
)

const releasePublicKeyBase64 = "PUBLIC_KEY_BASE64_CUA_BAN"

func ReleasePublicKey() (ed25519.PublicKey, error) {
	decoded, err := base64.StdEncoding.DecodeString(releasePublicKeyBase64)
	if err != nil {
		return nil, fmt.Errorf("decode release public key: %w", err)
	}

	if len(decoded) != ed25519.PublicKeySize {
		return nil, fmt.Errorf(
			"invalid release public key length: got %d, expected %d",
			len(decoded),
			ed25519.PublicKeySize,
		)
	}

	return ed25519.PublicKey(decoded), nil
}
```

Không tải public key từ cùng server chứa manifest.

---

## 7. Bước 5 — Tạo chương trình ký manifest

Tạo:

```text
tools/sign-release/main.go
```

Chương trình cần:

1. Đọc version.
2. Đọc các binary đã build.
3. Tính SHA-256.
4. Tạo `manifest.json`.
5. Ký raw bytes bằng Ed25519.
6. Sinh `manifest.sig`.

Biến môi trường:

```text
AGENT_VERSION
AGENT_SIGNING_PRIVATE_KEY
AGENT_RELEASE_BASE_URL
AGENT_RELEASE_DIR
```

Kết quả:

```text
manifest.json
manifest.sig
```

`manifest.sig` có thể lưu raw 64-byte signature.

---

## 8. Bước 6 — Nâng cấp script publish Agent

Cấu trúc release đề xuất:

```text
frontend/public/releases/
└── 1.6.0/
    ├── datrixops-agent-linux-amd64
    ├── datrixops-agent-linux-arm64
    ├── datrixops-agent-darwin-amd64
    ├── datrixops-agent-darwin-arm64
    ├── datrixops-agent-windows-amd64.exe
    ├── manifest.json
    └── manifest.sig
```

Trong `scripts/publish-agent.sh`:

```bash
RELEASE_DIR="$PUBLIC_DIR/releases/$AGENT_VERSION"
mkdir -p "$RELEASE_DIR"
```

Thêm metadata build:

```bash
GIT_COMMIT="$(git rev-parse --short HEAD)"
BUILD_TIME="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
```

Build với:

```bash
-ldflags="-s -w \
-X main.Version=${AGENT_VERSION} \
-X main.Commit=${GIT_COMMIT} \
-X main.BuildTime=${BUILD_TIME}"
```

Sau khi build:

```bash
AGENT_RELEASE_DIR="$RELEASE_DIR" \
AGENT_RELEASE_BASE_URL="https://datrixops.example.com/releases" \
go run "$PROJECT_ROOT/tools/sign-release"
```

---

## 9. Bước 7 — Thêm `--version` và `self-test`

Trong:

```text
agent/cmd/agent/main.go
```

```go
func main() {
	if handleUtilityCommands() {
		return
	}

	log.Println("Starting DatrixOps Agent...")
}
```

```go
func handleUtilityCommands() bool {
	if len(os.Args) < 2 {
		return false
	}

	switch os.Args[1] {
	case "--version", "version":
		fmt.Printf(
			"DatrixOps Agent %s commit=%s built=%s os=%s arch=%s\n",
			Version,
			Commit,
			BuildTime,
			runtime.GOOS,
			runtime.GOARCH,
		)
		return true

	case "self-test":
		if err := runSelfTest(); err != nil {
			fmt.Fprintln(os.Stderr, "self-test failed:", err)
			os.Exit(1)
		}
		fmt.Println("self-test passed")
		return true
	}

	return false
}
```

Self-test ban đầu:

```go
func runSelfTest() error {
	if Version == "" || Version == "dev" {
		return fmt.Errorf("release version is missing")
	}

	if runtime.GOOS != "linux" &&
		runtime.GOOS != "darwin" &&
		runtime.GOOS != "windows" {
		return fmt.Errorf("unsupported OS %s", runtime.GOOS)
	}

	if runtime.GOARCH != "amd64" && runtime.GOARCH != "arm64" {
		return fmt.Errorf("unsupported architecture %s", runtime.GOARCH)
	}

	return nil
}
```

Self-test không được:

- gửi heartbeat;
- sửa hệ thống;
- restart service;
- thực hiện tác vụ có side effect.

---

## 10. Bước 8 — So sánh semantic version

Cài thư viện:

```bash
cd agent
go get golang.org/x/mod/semver
```

Tạo:

```text
agent/internal/update/version.go
```

```go
package update

import (
	"fmt"
	"strings"

	"golang.org/x/mod/semver"
)

func NormalizeVersion(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	if !strings.HasPrefix(value, "v") {
		return "v" + value
	}
	return value
}

func ValidateUpgrade(current, target string, allowDowngrade bool) error {
	current = NormalizeVersion(current)
	target = NormalizeVersion(target)

	if !semver.IsValid(target) {
		return fmt.Errorf("invalid target version %q", target)
	}

	if current == "" || current == "vdev" {
		return nil
	}

	if !semver.IsValid(current) {
		return fmt.Errorf("invalid current version %q", current)
	}

	comparison := semver.Compare(target, current)

	if comparison == 0 {
		return fmt.Errorf("version %s is already installed", target)
	}

	if comparison < 0 && !allowDowngrade {
		return fmt.Errorf(
			"downgrade from %s to %s is not allowed",
			current,
			target,
		)
	}

	return nil
}
```

Mặc định:

```text
allow_downgrade = false
```

---

## 11. Bước 9 — Tải và xác minh manifest

Tạo:

```text
agent/internal/update/client.go
```

Yêu cầu:

- chỉ dùng HTTPS;
- timeout rõ ràng;
- giới hạn kích thước manifest;
- giới hạn redirect;
- verify chữ ký trước khi parse JSON;
- kiểm tra `schema_version`.

Giới hạn gợi ý:

```text
Manifest: 256 KB
Signature: 4 KB
Redirect: tối đa 3
Timeout: 30 giây
```

---

## 12. Bước 10 — Tải binary và xác minh checksum

Không tải toàn bộ binary vào RAM.

Luồng:

```text
HTTP response
→ io.LimitReader
→ ghi file tạm
→ đồng thời tính SHA-256
→ fsync
→ so sánh checksum
→ sai thì xóa file tạm
```

Giới hạn binary gợi ý:

```text
256 MB
```

Dùng file staged:

```text
.datrixops-agent.update
```

Không ghi đè binary đang chạy ở bước này.

---

## 13. Bước 11 — Kiểm tra đúng kiến trúc binary

Không chỉ kiểm tra magic header.

Dùng:

```text
debug/elf
debug/macho
debug/pe
```

Kiểm tra:

- Linux amd64 → `elf.EM_X86_64`
- Linux arm64 → `elf.EM_AARCH64`
- macOS amd64 → `macho.CpuAmd64`
- macOS arm64 → `macho.CpuArm64`
- Windows amd64 → `pe.IMAGE_FILE_MACHINE_AMD64`

Agent phải từ chối binary sai kiến trúc trước khi chạy self-test.

---

## 14. Bước 12 — Chạy self-test trên staged binary

Sau khi checksum và kiến trúc hợp lệ:

```text
staged-binary self-test
staged-binary --version
```

Yêu cầu:

- timeout 15 giây;
- exit code phải bằng 0;
- version output phải chứa target version;
- nếu fail thì không activate.

---

## 15. Bước 13 — Thay payload task `agent_update`

Payload mới:

```json
{
  "attempt_id": "uuid",
  "target_version": "1.6.0",
  "manifest_url": "https://datrixops.example.com/releases/1.6.0/manifest.json",
  "signature_url": "https://datrixops.example.com/releases/1.6.0/manifest.sig",
  "allow_downgrade": false
}
```

Backend phải tạo URL. Không cho frontend tự nhập URL release.

Không nên dùng `latest` không cố định vì gây khó audit và race condition.

---

## 16. Bước 14 — Tách updater khỏi `main.go`

Cấu trúc đề xuất:

```text
agent/internal/update/
├── manifest.go
├── keys.go
├── client.go
├── download.go
├── version.go
├── binary.go
├── selftest.go
├── installer.go
├── helper.go
└── state.go
```

`main.go` chỉ điều phối.

---

## 17. Bước 15 — Thiết kế rollback đúng

Agent cũ không thể tự rollback sau khi đã bị dừng.

Vì vậy cần helper độc lập:

```text
/usr/local/bin/datrixops-agent
/usr/local/bin/.datrixops-agent.update
/usr/local/bin/.datrixops-agent.helper
/usr/local/bin/.datrixops-agent.backup
```

Luồng:

```text
Copy binary cũ thành helper
→ chạy helper
→ agent cũ thoát
→ helper backup current
→ helper activate staged
→ helper restart service
→ chờ success marker
→ timeout thì rollback
```

---

## 18. Bước 16 — Thêm command `update-helper`

Command:

```bash
datrixops-agent update-helper \
  --pid <current-pid> \
  --current <agent-path> \
  --staged <update-path> \
  --backup <backup-path> \
  --success-marker <marker-path> \
  --timeout 120s
```

Helper thực hiện:

```text
1. Chờ agent cũ thoát
2. Backup binary hiện tại
3. Activate binary staged
4. Restart service
5. Chờ success marker
6. Có marker → hoàn tất
7. Không có marker → rollback
8. Restart binary cũ
9. Ghi rollback marker
```

---

## 19. Bước 17 — Restart service theo hệ điều hành

Nên tạo interface:

```go
type ServiceController interface {
	Start(context.Context) error
	Stop(context.Context) error
	Restart(context.Context) error
}
```

Triển khai:

### Linux

```text
systemctl restart datrixops-agent.service
```

### macOS

```text
launchctl kickstart
```

### Windows

```text
Start-ScheduledTask -TaskName DatrixOpsAgent
```

Không rải logic service control ở nhiều file.

---

## 20. Bước 18 — Tạo pending update state

Đường dẫn gợi ý:

Linux/macOS:

```text
/var/lib/datrixops/update-state.json
```

Windows:

```text
C:\ProgramData\DatrixOps\update-state.json
```

Nội dung:

```json
{
  "attempt_id": "uuid",
  "task_id": "uuid",
  "from_version": "1.5.0",
  "target_version": "1.6.0",
  "status": "restart_pending",
  "started_at": "2026-07-18T15:00:00Z",
  "success_marker": "...",
  "rollback_marker": "..."
}
```

Ghi file atomic:

```text
update-state.json.tmp
→ fsync
→ rename
```

Permission:

```text
0600
```

---

## 21. Bước 19 — Xác nhận update sau heartbeat

Không ghi success marker ngay khi process mới khởi động.

Chỉ xác nhận khi:

```text
Agent mới đã chạy
VÀ heartbeat được backend chấp nhận
VÀ version đúng
VÀ attempt_id đúng
```

Heartbeat nên gửi:

```json
{
  "agent_version": "1.6.0",
  "update_attempt_id": "uuid",
  "update_status": "heartbeat_confirmed"
}
```

Sau heartbeat thành công:

```text
Agent ghi success marker
→ helper thấy marker
→ helper xóa backup
→ update hoàn tất
```

---

## 22. Bước 20 — Tạo bảng `agent_update_events`

Migration đề xuất:

```sql
CREATE TABLE agent_update_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    server_id UUID NOT NULL
        REFERENCES servers(id)
        ON DELETE CASCADE,

    task_id UUID
        REFERENCES server_tasks(id)
        ON DELETE SET NULL,

    requested_by UUID
        REFERENCES users(id)
        ON DELETE SET NULL,

    attempt_id UUID NOT NULL UNIQUE,

    from_version VARCHAR(64) NOT NULL,
    target_version VARCHAR(64) NOT NULL,

    status VARCHAR(40) NOT NULL,

    manifest_url TEXT NOT NULL,
    artifact_url TEXT,

    signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
    checksum_verified BOOLEAN NOT NULL DEFAULT FALSE,
    architecture_verified BOOLEAN NOT NULL DEFAULT FALSE,
    self_test_passed BOOLEAN NOT NULL DEFAULT FALSE,

    downloaded_bytes BIGINT,
    expected_sha256 CHAR(64),
    actual_sha256 CHAR(64),

    error_code VARCHAR(80),
    error_message TEXT,

    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    staged_at TIMESTAMP WITH TIME ZONE,
    activated_at TIMESTAMP WITH TIME ZONE,
    heartbeat_confirmed_at TIMESTAMP WITH TIME ZONE,
    rolled_back_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

Trạng thái:

```text
queued
downloading_manifest
verifying_manifest
downloading_binary
verifying_checksum
verifying_architecture
running_self_test
staged
restart_pending
awaiting_heartbeat
completed
rollback_started
rolled_back
failed
```

---

## 23. Bước 21 — Tạo update event khi queue task

Khi người dùng bấm update:

```text
1. Backend đọc version hiện tại
2. Xác định target version
3. Tạo attempt_id
4. Tạo server task
5. Tạo agent_update_event
6. Commit trong cùng transaction
```

Backend config:

```env
AGENT_VERSION=1.6.0
AGENT_RELEASE_BASE_URL=https://datrixops.example.com/releases
```

Frontend không được tự cung cấp manifest URL.

---

## 24. Bước 22 — API cập nhật tiến trình

Endpoint:

```text
POST /api/v1/agent/updates/progress
```

Request:

```json
{
  "attempt_id": "uuid",
  "status": "verifying_checksum",
  "signature_verified": true,
  "checksum_verified": false,
  "architecture_verified": false,
  "self_test_passed": false,
  "downloaded_bytes": 14320896,
  "expected_sha256": "...",
  "actual_sha256": "",
  "error_code": "",
  "error_message": ""
}
```

Backend phải kiểm tra:

- Agent token thuộc server nào.
- Attempt có thuộc server đó không.
- State transition có hợp lệ không.
- Không cho Agent A cập nhật event của Agent B.

---

## 25. Bước 23 — Xử lý rollback event

Nếu agent mới không heartbeat đúng hạn:

```text
Helper restore binary cũ
→ restart service cũ
→ ghi rollback marker
→ agent cũ khởi động
→ agent cũ đọc marker
→ report rolled_back
```

Rollback event:

```json
{
  "attempt_id": "uuid",
  "status": "rolled_back",
  "error_code": "HEARTBEAT_CONFIRMATION_TIMEOUT",
  "error_message": "New agent did not confirm heartbeat within 120 seconds"
}
```

---

## 26. Bước 24 — Sửa task lifecycle

Task update không được `completed` ngay sau khi staged.

Thêm trạng thái:

```text
verification_pending
```

Luồng:

```text
pending
→ processing
→ verification_pending
→ completed
```

Nếu rollback:

```text
verification_pending
→ failed
```

Task chỉ `completed` khi backend nhận heartbeat xác nhận từ Agent mới.

---

## 27. Bước 25 — Frontend hiển thị tiến trình

API:

```text
GET /api/v1/servers/{serverID}/agent-updates/latest
GET /api/v1/servers/{serverID}/agent-updates
```

UI timeline:

```text
✓ Release requested
✓ Manifest downloaded
✓ Signature verified
✓ Binary downloaded
● Verifying checksum
○ Checking architecture
○ Running self-test
○ Installing
○ Restarting
○ Waiting for heartbeat
○ Completed
```

Nếu rollback:

```text
✓ Update downloaded
✓ Signature verified
✓ Binary installed
✕ New agent failed health confirmation
↶ Previous binary restored
✓ Previous agent is online
```

Có thể polling mỗi 2 giây khi update đang active.

---

## 28. Bước 26 — An toàn cho installer ban đầu

SCR-001 bảo vệ auto-update của Agent đã cài.

Installer lần đầu vẫn là một trust boundary riêng.

Các hướng:

### Tối thiểu

```text
Tải binary
→ tải SHA-256
→ verify checksum qua HTTPS
```

### Đầy đủ

- Debian/RPM repository signing.
- Windows Authenticode.
- Apple code signing và notarization.
- Bootstrap verifier độc lập.

Cần ghi rõ phạm vi:

```text
Signed auto-update bắt đầu từ Agent đã cài.
Initial installation vẫn cần ticket hardening riêng.
```

---

## 29. Bước 27 — Kiểm thử Agent updater

Các test bắt buộc:

### Manifest hợp lệ

- Ký bằng private key đúng.
- Verify bằng public key đúng.
- Kết quả phải pass.

### Manifest bị sửa

- Thay đổi một byte.
- Verify phải fail.

### Sai public key

- Ký bằng key A.
- Verify bằng key B.
- Phải fail.

### Checksum sai

- Manifest chứa hash khác binary.
- File staged phải bị xóa.
- Binary hiện tại không đổi.

### Binary sai kiến trúc

- amd64 nhưng chạy trên arm64.
- Phải fail trước self-test.

### Mất mạng

- Server trả một phần file rồi đóng kết nối.
- File staged phải bị xóa.

### Không đủ quyền

- Không ghi được file staged hoặc backup.
- Update phải fail an toàn.

### Self-test fail

- Binary staged exit code khác 0.
- Không activate.

### Rollback thành công

- Không tạo success marker.
- Helper phải restore backup.
- Service cũ được start lại.

### Không rollback khi thành công

- Success marker xuất hiện đúng hạn.
- Backup được xóa.
- Binary mới giữ nguyên.

---

## 30. Bước 28 — Backend integration tests

Test bắt buộc:

```text
User queue update
→ task và update event được tạo cùng transaction
```

```text
Agent server A report attempt của server B
→ bị từ chối
```

```text
Invalid state transition
→ HTTP 409
```

```text
Heartbeat đúng attempt và version
→ event completed
→ task completed
```

```text
Heartbeat đúng attempt nhưng sai version
→ không completed
```

```text
Agent cũ report rollback
→ event rolled_back
→ task failed
```

Tenant isolation:

```text
User A không xem được update events của server B
```

---

## 31. Bước 29 — Thứ tự commit

```text
1. feat(agent): add version and self-test commands
2. feat(release): generate signed release manifests
3. feat(agent): verify signed manifests
4. feat(agent): verify artifact checksum and architecture
5. feat(agent): stage updates without replacing active binary
6. feat(agent): add external update helper and rollback
7. feat(backend): add agent update event persistence
8. feat(backend): add update progress API
9. feat(agent): report update progress and heartbeat confirmation
10. feat(frontend): show agent update lifecycle
11. test(update): cover signature checksum failure and rollback
12. docs(update): document signed release operation
```

---

## 32. Bước 30 — Quy trình release

CI/CD:

```text
1. Checkout tagged commit
2. Kiểm tra AGENT_VERSION khớp Git tag
3. Build binaries
4. Tính SHA-256
5. Tạo manifest.json
6. Ký manifest bằng CI private key
7. Upload binaries + manifest + signature
8. Verify file đã upload
9. Publish desired Agent version
10. Cho phép update trên dashboard
```

Thứ tự đúng:

```text
Upload release hoàn chỉnh
→ verify
→ mới publish desired version
```

Không publish target version trước khi artifact đã sẵn sàng hoàn toàn.

---

## 33. Definition of Done

SCR-001 chỉ hoàn thành khi:

- [ ] Manifest được ký bằng Ed25519.
- [ ] Private key chỉ tồn tại trong CI secret.
- [ ] Public key được nhúng trong Agent.
- [ ] Agent verify chữ ký trước khi parse manifest.
- [ ] Agent chỉ chọn artifact đúng OS/architecture.
- [ ] Agent từ chối downgrade mặc định.
- [ ] Binary được xác minh SHA-256.
- [ ] Binary được kiểm tra kiến trúc thực tế.
- [ ] Staged binary phải vượt qua self-test.
- [ ] Binary hiện tại được backup trước khi activate.
- [ ] Có helper độc lập để rollback.
- [ ] Agent mới chỉ được xác nhận thành công sau heartbeat.
- [ ] Không heartbeat đúng hạn thì rollback.
- [ ] Backend lưu lịch sử vào `agent_update_events`.
- [ ] Task chỉ completed sau heartbeat xác nhận.
- [ ] Frontend hiển thị tiến trình và lỗi.
- [ ] Tất cả test bắt buộc đều pass.
- [ ] Binary chưa ký hoặc checksum sai không bao giờ được kích hoạt.

---

## 34. Phần nên làm đầu tiên

Bắt đầu bằng lát cắt nhỏ:

```text
1. Manifest model
2. Sinh key Ed25519
3. Nhúng public key
4. Utility ký release
5. Publish signed manifest
6. Thêm --version và self-test
```

Sau đó commit riêng trước khi tiếp tục:

```text
Downloader
Verifier
Checksum
Architecture validation
Rollback helper
Backend tracking
Frontend timeline
```

---

## Kết quả cuối cùng mong muốn

```text
Binary chưa ký
→ từ chối

Manifest bị sửa
→ từ chối

Checksum sai
→ từ chối

Binary sai kiến trúc
→ từ chối

Self-test lỗi
→ không activate

Agent mới không heartbeat
→ rollback

Agent mới heartbeat thành công
→ hoàn tất update
```
