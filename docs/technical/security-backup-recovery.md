# Security Operations, Backup, Recovery and Rollback

## Secret management

- Không commit `.env`, `.env.release`, Agent Token, JWT secret, DSN hoặc signing private key.
- File signing key và env production dùng mode `0600`, owner là release operator.
- Tách database credential, JWT secret và release key; không dùng chung secret.
- Redact `Authorization`, token, DSN và key khỏi log/ticket.
- Giới hạn quyền Docker socket và shell trên host control plane.

## TLS và network

Agent update client bắt buộc HTTPS và từ chối redirect về HTTP. TLS termination/reverse proxy nằm ngoài repo. Cấu hình production phải:

- redirect HTTP → HTTPS;
- hỗ trợ WebSocket upgrade cho terminal;
- giới hạn request size/rate;
- chỉ expose PostgreSQL trong private network;
- thay CORS `*` ở Backend hoặc enforce origin tại proxy.

## Signing key rotation

Source chỉ nhúng một public key. Rotation an toàn cần release chuyển tiếp chứa cả old/new trust hoặc cơ chế keyring trước khi ký chỉ bằng key mới. Không thay `keys.go` và ký ngay bằng key mới khi fleet còn chạy binary chỉ tin key cũ.

Nếu private key lộ:

1. Dừng publish và bảo vệ forensic evidence.
2. Thu hồi quyền truy cập/file bị lộ.
3. Xác định release nào có thể bị giả mạo; bảo toàn manifest/log.
4. Thiết kế trust-transition release ký bằng key cũ nếu key cũ còn đáng tin, hoặc thực hiện manual recovery nếu không.
5. Rotate key, rebuild Agent có trust mới và theo dõi fleet.
6. Không xóa release/log liên quan trước khi hoàn tất điều tra.

## Backup

Database:

```bash
docker compose --env-file .env -f docker-compose.prod.yml exec -T db \
  pg_dump -U datrixops -d datrixops -Fc > "backup/datrixops-$(date +%Y%m%d-%H%M%S).dump"
```

Lệnh ví dụ giả định user/database Compose; dùng credential thực tế và thư mục backup permission hạn chế. Kiểm tra file không rỗng và định kỳ test restore ở môi trường cô lập.

Backup riêng:

- `.env` và `.env.release` theo secret-vault policy.
- Ed25519 private key trong encrypted offline backup.
- `frontend/public/releases/` để giữ artifact immutable cũ.
- Reverse proxy/TLS configuration nằm ngoài repo.
- Git commit SHA/image digest của mỗi deployment.

Không chỉ backup PostgreSQL volume raw khi DB đang chạy; ưu tiên `pg_dump` nhất quán hoặc snapshot storage đã được quiesce.

## Restore database

1. Dừng thành phần ghi dữ liệu hoặc bật maintenance window.
2. Tạo database sạch đúng version PostgreSQL.
3. Restore bằng `pg_restore`, kiểm tra lỗi.
4. Start Backend để migration idempotent hiện hành chạy.
5. Verify user, server, metrics, task và heartbeat.

```bash
pg_restore --clean --if-exists --no-owner --dbname="<RESTORE_DSN>" backup.dump
```

Không chạy lệnh restore trực tiếp lên production trước khi xác nhận target DSN.

## Rollback release

- Backend/Frontend: deploy commit/image đã biết tốt; migration cần đánh giá riêng.
- Agent release: giữ directory version cũ, publish patch fix mới. Không đổi bytes của version đã phát hành.
- Artifact lỗi: ngừng quảng bá bằng cách đặt Backend `AGENT_VERSION` về version tốt **chỉ sau khi đánh giá downgrade**, hoặc ưu tiên publish version cao hơn đã fix.
- Agent đã chết: manual replace binary và restart; control plane không thể task một Agent offline.

## Rủi ro source hiện tại

- Compose production có secret mặc định yếu và expose DB port.
- CORS `*`.
- Refresh token được lưu raw trong DB.
- Agent Token được lưu raw trong `servers`.
- Reverse terminal thường chạy quyền root/SYSTEM.
- AutoMigrate không có ledger.
- Không có retention và automated backup.
- Agent rollback/anti-downgrade/public-key rotation chưa hoàn chỉnh.

