# Repository Structure and Local Development

## Trách nhiệm thư mục

| Đường dẫn | Trách nhiệm |
|---|---|
| `agent/` | Go binary đa nền tảng; collector, API client, service controls, terminal và updater. |
| `agent/cmd/agent/` | Entry point, heartbeat loop, task dispatcher và activation. |
| `agent/internal/update/` | Signed manifest client, schema và embedded Ed25519 public key. |
| `backend/` | Go control-plane API, scheduler và database access. |
| `backend/internal/core/<module>/` | Routes/handler/service/repository theo module. Một số module nhỏ không có đủ bốn lớp. |
| `backend/internal/platform/` | Config, PostgreSQL pool, middleware, logger, response và notifier. |
| `backend/migrations/` | SQL idempotent được chạy khi Backend startup. |
| `frontend/` | Next.js App Router, dashboard, public docs và API client. |
| `frontend/public/` | Installer, legacy/current root artifact và signed release directories. |
| `docs/public/` | Nội dung public duy nhất được `/docs` đọc. |
| `docs/technical/` | Tài liệu nội bộ này; không được public. |
| `scripts/` | Release automation; hiện trọng tâm là `publish-agent.sh`. |

`backend/api`, `backend/api_server`, `agent/agent` và `agent/sign-release` là binary/artifact có trong working tree, không phải source entrypoint. Không dựa vào chúng để review logic.

## Yêu cầu môi trường

- Go theo version hỗ trợ trong `go.mod`/toolchain của từng module.
- Node.js 22 phù hợp `frontend/Dockerfile`; npm với `package-lock.json`.
- Docker + Compose.
- PostgreSQL 16 (Compose).
- Git và CA certificates.

## Cài dependency

```bash
cd backend && go mod download
cd ../agent && go mod download
cd ../frontend && npm ci
```

## Chạy development

```bash
docker compose up -d
cd backend && go run ./cmd/api
cd frontend && npm run dev
```

Agent local cần API path đầy đủ:

```bash
cd agent
DATRIXOPS_AGENT_TOKEN="<TOKEN_DEV>" \
DATRIXOPS_SERVER_URL="http://localhost:8080/api/v1" \
go run ./cmd/agent
```

Không dùng production Agent Token trong development. Default source của Agent là `http://localhost:8080` và thiếu `/api/v1`, nên phải set URL như trên.

## Test, lint, type-check và build

```bash
cd backend && go test ./...
cd agent && go test ./...
cd frontend && npm run lint
cd frontend && npx tsc --noEmit
cd frontend && npm run build
```

Build thử Agent có version marker:

```bash
cd agent
go build -trimpath -buildvcs=false \
  -ldflags="-X main.Version=0.0.0-dev -X main.VersionMarker=datrixops-agent-version=0.0.0-dev" \
  -o /tmp/datrixops-agent-dev ./cmd/agent
/tmp/datrixops-agent-dev --version
```

Lưu ý: source hiện không định nghĩa CLI flag `--version`; binary sẽ start Agent và đòi token. Kiểm tra marker bằng `grep -aF` hoặc `go version -m`, không thực thi binary production. Đây là khoảng trống giữa yêu cầu release thông thường và implementation.

## Debug

- Backend: log structured từ middleware và module scheduler.
- Agent: stdout/stderr được service manager thu.
- Frontend: browser console/network và Next container logs.
- Database: SQL read-only để xác minh `servers`, `server_metrics`, `server_tasks`.

Không tắt TypeScript/ESLint để qua build. Migration mới phải có SQL idempotent vì AutoMigrate hiện chạy lại mọi file mỗi startup và không có bảng migration ledger.

