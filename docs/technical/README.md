# DatrixOps Technical Administration Documentation

Tài liệu này dành cho người vận hành, maintainer và developer có quyền truy cập repository. Nội dung không được render bởi route public `/docs`: frontend chỉ đọc nội dung tiếng Việt trong `docs/public/` và tiếng Anh trong `docs/public/en/`.

## Mục lục

1. [System overview](system-overview.md)
2. [Repository và local development](repository-and-development.md)
3. [Production deployment](production-deployment.md)
4. [Agent development, signed release và update](agent-release-and-update.md)
5. [Backend, frontend, database và configuration](components-and-configuration.md)
6. [Security, backup và recovery](security-backup-recovery.md)
7. [Web Terminal và remote Agent removal](terminal-and-agent-removal.md)
8. [Monitoring, troubleshooting và maintenance runbook](operations-runbook.md)

## Nguồn sự thật

Tài liệu này được đối chiếu với source tại thời điểm cập nhật, đặc biệt:

- `agent/cmd/agent`, `agent/internal/{collector,client,terminal,uninstall,update}`
- `backend/cmd/api`, `backend/internal/core`, `backend/internal/platform`
- `backend/migrations`
- `frontend/src/app`, `frontend/src/lib/apiClient.ts`, `frontend/public`
- `scripts/publish-agent.sh`, Dockerfile và hai Compose file

Khi tài liệu cũ mâu thuẫn migration hoặc source, ưu tiên migration/source. `docs/database/schema.md` và một số tài liệu feature cũ có giá trị lịch sử nhưng không phải schema production hiện hành.

## Trạng thái triển khai đáng chú ý

| Hạng mục | Trạng thái theo source |
|---|---|
| Heartbeat, metrics, inventory, process, native services, Docker task | Đã có |
| Website/SSL scheduler, alert scheduler, API keys, audit | Đã có |
| Signed manifest, Ed25519, size/SHA/version-marker verification | Đã có cho self-update payload mới |
| Xác nhận update bằng heartbeat | Đã có |
| Rollback Agent tự động nếu binary mới không heartbeat | Chưa hoàn thiện |
| Chống downgrade bằng so sánh semantic version trong Agent | Chưa có enforcement đầy đủ |
| Network, Performance, Security, Logs chuyên sâu | Frontend còn placeholder/không có backend đầy đủ |
| Web Terminal Linux headless với controlling PTY và reverse gateway | Đã có |
| Remote uninstall khi xóa server | Đã có cho Linux root + systemd; macOS/Windows chưa hỗ trợ |
| Backup manager, file manager, gRPC/mTLS | Chưa có |
