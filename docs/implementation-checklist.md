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
| `[~]` | Cron Execution Telemetry | Agent wrapper `cron-run`, endpoint agent-scoped, recent runs, copy wrapper, docs migration | UX hướng dẫn cấu hình rõ hơn; native/managed runner nếu muốn tự động bọc cron |
| `[x]` | Audit Log expansion | Server lifecycle/task, Alerts, Websites, API Keys, update policy, terminal/session metadata, Script Library completion, read-only log reads | Nối thêm các module mới nếu roadmap mở rộng |
| `[x]` | System Webhooks | DB schema, backend CRUD, HMAC signing, masked URL response, test delivery, delivery history, Settings UI; dispatch thật cho `server.offline`, `server.online`, `server.degraded`, `cron.failed`, `service.down`, `agent.update_failed/resolved`; retry/backoff giới hạn và trạng thái dead-letter | Có thể thêm event types mới khi có module mới |
| `[x]` | Email Notification | SMTP channel cho alert notification, validate host/from/to/port, TLS/STARTTLS, password masking trên list response, Alerts UI | Có thể thêm nút test email riêng nếu cần |
| `[x]` | Script Library | DB catalog, allowlist backend + agent, OS policy, confirmation, timeout, output limit, UI chạy script, audit queue/completion | Mở rộng catalog theo nhu cầu vận hành thực tế |
| `[~]` | Realtime Log Viewer | Logs page đọc audit stream thật và có read-only fetch qua agent cho Linux `journalctl`, Nginx access/error; timeout/output cap và audit | Live-tail streaming liên tục, Docker logs cần chọn container rõ ràng trước khi mở UI |

## Đã hoàn thành chính

| Trạng thái | Hạng mục | Ghi chú |
| --- | --- | --- |
| `[x]` | Auth/JWT/refresh token | Login/register, refresh access token trên frontend |
| `[x]` | Server Management | Add/delete, agent token, fleet table, quick actions |
| `[x]` | Technical UI redesign | Bỏ Liquid Glass, chuyển sang Technical Operations UI |
| `[x]` | Realtime Metrics | CPU/RAM/Disk/Network charts dựa trên dữ liệu thật |
| `[x]` | Cross-platform inventory | Linux/macOS/Windows metadata, disk, private IP, agent version |
| `[x]` | Service monitoring + controls | systemd/launchd/Windows SCM, start/stop/restart/reload khi agent đủ phiên bản |
| `[x]` | Agent auto-update | Update per-agent, update-all, auto-update policy toggle |
| `[x]` | Web Terminal foundation | Reverse terminal có ticket, timeout, audit và cảnh báo hỗ trợ nền tảng |
| `[x]` | Website/SSL monitoring | HTTP latency, SSL metadata, scheduler |
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
