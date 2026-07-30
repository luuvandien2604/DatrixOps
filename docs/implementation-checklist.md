# DatrixOps — Implementation Checklist

> Checklist tiến độ để theo dõi các hạng mục còn lại theo roadmap. File này nên được cập nhật sau mỗi đợt triển khai lớn.

## Quy ước trạng thái

- `[x]` Hoàn thành và đã có mã nguồn.
- `[~]` Đã có nền tảng/triển khai một phần, còn cần nối rộng hoặc polish.
- `[ ]` Chưa triển khai.
- `[!]` Tạm hoãn vì cần quyết định kiến trúc/bảo mật trước.

## Ưu tiên gần

| Trạng thái | Hạng mục | Phạm vi đã có | Phần còn lại |
| --- | --- | --- | --- |
| `[~]` | Production hardening P0 | Đã loại bỏ secret fallback trong backend config, production compose dùng required env, thêm `.env.example`, TLS website check không còn `InsecureSkipVerify`, thêm migration/worker entrypoint riêng | Chạy full test/build/E2E trên môi trường có quyền; hoàn thiện terminal ticket không nằm query string; rollback agent update |
| `[~]` | Cron Execution Telemetry | Agent wrapper `cron-run`, endpoint agent-scoped, recent runs, copy wrapper, docs migration | UX hướng dẫn cấu hình rõ hơn; native/managed runner nếu muốn tự động bọc cron |
| `[x]` | Audit Log expansion | Server lifecycle/task, Alerts, Websites, API Keys, update policy, terminal/session metadata, Script Library completion, read-only log reads | Nối thêm các module mới nếu roadmap mở rộng |
| `[x]` | System Webhooks | DB schema, backend CRUD, HMAC signing, masked URL response, test delivery, delivery history, Settings UI; dispatch thật cho `server.offline`, `server.online`, `server.degraded`, `cron.failed`, `service.down`, `agent.update_failed/resolved`; retry/backoff giới hạn và trạng thái dead-letter | Có thể thêm event types mới khi có module mới |
| `[x]` | Email Notification | SMTP channel cho alert notification, validate host/from/to/port, TLS/STARTTLS, password masking trên list response, Alerts UI | Có thể thêm nút test email riêng nếu cần |
| `[x]` | Script Library | DB catalog, allowlist backend + agent, OS policy, confirmation, timeout, output limit, UI chạy script, audit queue/completion | Mở rộng catalog theo nhu cầu vận hành thực tế |
| `[~]` | Realtime Log Viewer | Logs page đọc audit stream thật và có read-only fetch qua agent cho Linux `journalctl`, Nginx access/error/MySQL error; timeout/output cap, version gate Agent 1.5.2+, audit | Live-tail streaming liên tục, Docker logs cần chọn container rõ ràng trước khi mở UI; cần deploy agent mới để `log_read` hoạt động |

## Production hardening audit — 2026-07-30

| Trạng thái | Mảng | Kết luận dựa trên source hiện tại | Việc đã làm trong đợt này / còn lại |
| --- | --- | --- | --- |
| `[~]` | Backend config | Trước đó có fallback `DATABASE_URL` và JWT `dev-secret-change-in-production` | Đã bắt buộc `DATABASE_URL`, `JWT_SECRET`, validate URL, chặn secret yếu/mẫu; còn cần full test trên CI/VPS |
| `[~]` | Docker Compose production | Trước đó hard-code `secretpassword` và `super-secret-key-change-in-production`; API tự migrate và tự chạy scheduler | Đã chuyển sang `${VAR:?required}`, thêm migrate service, worker service, healthcheck cơ bản |
| `[~]` | Database migration | `AutoMigrate()` chạy trong API startup, không có migration container riêng | Đã thêm `cmd/migrate` và API `VerifySchema`; còn cần kiểm tra toàn bộ migration idempotent bằng DB thật |
| `[~]` | Scheduler/background jobs | Website/alert/webhook retry chạy trong API process, có nguy cơ duplicate khi scale replica | Đã thêm `cmd/worker` và prod compose worker; còn cần advisory lock/job lock cho HA multi-worker |
| `[~]` | Website TLS monitoring | Có `InsecureSkipVerify: true`, có thể coi site UP dù TLS invalid | Đã bỏ skip verify, phân loại lỗi DNS/timeout/TLS/HTTP/redirect loop ở probe; schema hiện chưa lưu failure reason |
| `[~]` | Authorization/resource ownership | Server task/detail/terminal ticket có ownership check; agent result gắn agent token với task server | Còn cần test tenant isolation đầy đủ cho server/task/terminal/script/api key/admin |
| `[~]` | Web Terminal | Có ticket 30s, single-use, origin check, ping/pong, max message size, audit open/close | Còn rủi ro ticket trong query string; cần integration test Linux headless và session limits per user |
| `[~]` | Signed Agent Update | Có signed manifest Ed25519, HTTPS URL validation, checksum, OS/arch selection, marker check | Còn thiếu rollback/self-test/update history đầy đủ; cần test downgrade, checksum/signature/permission/network |
| `[~]` | Log Viewer | Read-only task allowlist ở agent, output/line limits, Linux-only gate | Cần Agent 1.5.2+ deploy; live tail/backpressure chưa xong |
| `[~]` | Script Library | Có allowlist backend + agent, timeout/output limit, confirmation, audit | Cần checksum/version per script và argument validation nếu sau này thêm tham số |
| `[~]` | CI/CD | Trước đó chưa có workflow trong repo | Đã thêm GitHub Actions cơ bản cho backend/agent/frontend/docker/secret scan; chưa chạy được local do sandbox/network |
| `[!]` | Repository hygiene | Binary/release artifacts đang tracked (`agent/agent`, `agent/sign-release`, `frontend/public/datrixops-agent*`) | Đã thêm ignore cho artifact mới; chưa remove tracked artifacts để tránh phá release đang phục vụ |

## Đã hoàn thành chính

| Trạng thái | Hạng mục | Ghi chú |
| --- | --- | --- |
| `[x]` | Auth/JWT/refresh token | Login/register, refresh access token trên frontend |
| `[x]` | Server Management | Add/delete, agent token, fleet table, quick actions |
| `[x]` | Technical UI redesign | Bỏ Liquid Glass, chuyển sang Technical Operations UI |
| `[x]` | Realtime Metrics | CPU/RAM/Disk/Network charts dựa trên dữ liệu thật |
| `[x]` | Cross-platform inventory | Linux/macOS/Windows metadata, disk, private IP, agent version |
| `[x]` | Service monitoring + controls | systemd/launchd/Windows SCM, start/stop/restart/reload khi agent đủ phiên bản |
| `[~]` | Agent auto-update | Update per-agent, update-all, auto-update policy toggle; signed manifest/checksum đã có nền tảng; rollback/self-test còn thiếu |
| `[~]` | Web Terminal foundation | Reverse terminal có ticket, timeout, audit và cảnh báo hỗ trợ nền tảng; cần bỏ ticket khỏi query string và thêm integration test |
| `[~]` | Website/SSL monitoring | HTTP status, SSL metadata, scheduler; TLS verification đã bật; cần lưu failure reason/latency history rõ hơn |
| `[x]` | Alert rules + Telegram/Discord | Rule engine, dashboard notifications, notification channels |
| `[x]` | API keys | Public REST API key lifecycle, audit create/delete |

## Tạm hoãn / cần thiết kế trước

| Trạng thái | Hạng mục | Lý do |
| --- | --- | --- |
| `[!]` | Arbitrary Remote Command | Rủi ro cao; cần policy/approval/allowlist trước |
| `[!]` | Docker Exec/Pull hàng loạt | Cần kiểm soát quyền và audit output rõ ràng |
| `[!]` | File Manager có quyền ghi | Rủi ro phá host; làm read-only trước nếu cần |
| `[!]` | mTLS/PKI | Cần thiết kế lifecycle certificate, rotation và recovery |
| `[!]` | gRPC/WebSocket migration toàn agent | Chỉ làm khi có bottleneck thực tế hoặc yêu cầu scale lớn |
| `[!]` | Agent Delta Updates | Chờ data model ổn định |
| `[!]` | Plugin System | Chờ core collector ổn định |

## Tiếp theo đề xuất

1. Polish Realtime Log Viewer: live-tail read-only theo phiên, không spam task/audit.
2. Thêm nút test Email SMTP và health indicator cho từng notification channel.
3. Mở rộng Script Library theo nhu cầu thật: backup read-only/dry-run trước, cleanup cần confirmation.
4. Thiết kế File Manager read-only nếu cần quan sát file cấu hình/log mà không mở shell.
