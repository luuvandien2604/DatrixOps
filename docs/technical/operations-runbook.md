# Monitoring, Troubleshooting and Maintenance Runbook

## Kiểm tra nhanh

```bash
docker compose --env-file .env -f docker-compose.prod.yml ps
docker compose --env-file .env -f docker-compose.prod.yml logs --tail=200 backend
docker compose --env-file .env -f docker-compose.prod.yml logs --tail=200 frontend
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/ready
```

Database log:

```bash
docker compose --env-file .env -f docker-compose.prod.yml logs --tail=200 db
```

Agent Linux:

```bash
systemctl status datrixops-agent
journalctl -u datrixops-agent -n 200 --no-pager
```

## Debug Agent offline

1. Xác minh service và startup log có version marker đúng.
2. Kiểm tra `DATRIXOPS_SERVER_URL` có `/api/v1`.
3. Kiểm tra DNS/TLS/outbound firewall.
4. `401` heartbeat: so Agent Token với server record; không debug JWT.
5. Query `servers.last_seen_at` và metrics gần nhất.

## Debug reverse terminal channel

Agent heartbeat lưu `terminal_channel_connected` và lỗi handshake gần nhất trong `terminal_channel_error`. Phân loại:

- `HTTP 401`: token/host terminal không khớp với heartbeat.
- `HTTP 403`: WAF/Cloudflare/origin policy chặn.
- `HTTP 200` hoặc `404`: route rơi vào Frontend hoặc proxy không upgrade.
- `HTTP 502/503`: upstream Backend không sẵn sàng.
- TLS/timeout: DNS, CA, clock, firewall hoặc proxy timeout.

```bash
journalctl -u datrixops-agent -n 200 --no-pager | grep -i terminal
```

Một request thường không có Agent Token tới `/api/v1/agent/terminal` phải trả JSON `401` từ Backend. Để kiểm tra phiên thật cần Agent Token hợp lệ; không đưa token vào shell history hoặc ticket.

## Debug update không hiển thị

1. Xem `AGENT_VERSION` trong Backend container:

   ```bash
   docker compose --env-file .env -f docker-compose.prod.yml exec -T backend sh -c 'printf "%s\n" "$AGENT_VERSION"'
   ```

2. Xem version heartbeat trong `servers.os_info`.
3. Đảm bảo Backend đã recreate sau khi đổi env.
4. Đảm bảo frontend không cache response server cũ.
5. So sánh manifest version và directory release.

## Debug update staged nhưng không activate

- Xem `server_tasks.status`, `started_at`, `timeout_seconds`, `result`.
- Xem Agent log lỗi restart helper/service manager.
- Xác minh binary target có đúng size/SHA/marker.
- `processing` chỉ complete khi heartbeat đúng target.
- Task stale được heartbeat/handler cleanup thành `timed_out`; không tạo vòng lặp retry vô hạn.

## Kiểm tra release

```bash
curl -fsS "https://datrixops.vandien.space/releases/<VERSION>/manifest.json"
curl -fsS -o /tmp/manifest.sig "https://datrixops.vandien.space/releases/<VERSION>/manifest.sig"
wc -c /tmp/manifest.sig
sha256sum frontend/public/releases/<VERSION>/*
```

Signature raw phải 64 byte. Dùng tool `agent/tools/sign-release`/updater test để verify; không in private key.

## Các lỗi release thường gặp

- **Directory exists:** tăng version; chỉ dùng `AGENT_FORCE=1` cho recovery kiểm soát trước khi release bị tiêu thụ.
- **Version embedding failed:** kiểm tra đủ hai `-X main.Version` và `-X main.VersionMarker`; không dùng pipeline `strings | grep -q` với `pipefail`.
- **Git mode 100644/100755:** `git ls-files -s scripts/publish-agent.sh`; sửa bằng `chmod +x` và commit mode.
- **git pull blocked:** `git status`, xử lý local changes có chủ đích; không reset phá hủy.
- **Frontend image cũ:** artifact nằm trong image cũ; rebuild Frontend hoặc xác nhận volume/static serving.

## Maintenance matrix

### Chỉ Backend

```bash
git pull --ff-only
docker compose --env-file .env -f docker-compose.prod.yml up -d --build backend
```

### Chỉ Frontend hoặc UI docs

```bash
git pull --ff-only
docker compose --env-file .env -f docker-compose.prod.yml up -d --build frontend
```

### Cả hai

```bash
git pull --ff-only
docker compose --env-file .env -f docker-compose.prod.yml up -d --build backend frontend
```

### Chỉ đổi `.env`

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d --force-recreate <service>
```

### Chỉ Agent và publish version mới

```bash
git pull --ff-only
./scripts/publish-agent.sh <NEW_SEMVER>
```

Script mặc định recreate Backend. Nếu `AUTO_UPDATE_BACKEND=0`, operator phải đặt `AGENT_VERSION` và recreate Backend sau khi kiểm tra release.

### Build không cache

Chỉ khi xác định cache sai hoặc base dependency cần refresh:

```bash
docker compose --env-file .env -f docker-compose.prod.yml build --no-cache <service>
docker compose --env-file .env -f docker-compose.prod.yml up -d <service>
```

## Health acceptance

Deployment hoàn tất khi:

- container expected đều running;
- `/health` và `/ready` OK;
- login/refresh hoạt động;
- server list tải được;
- ít nhất một Agent heartbeat sau deploy;
- task/update UI đọc được trạng thái persisted;
- release URL trả manifest/signature/artifact đúng nếu có release mới;
- log không có migration loop, panic hoặc 5xx lặp lại.
