# Production Deployment

## Từ local tới VPS

```bash
# Local
git status
git add <files>
git commit -m "docs: describe the change"
git push origin main

# VPS
cd /root/DatrixOps
git pull --ff-only
```

Không dùng `git reset --hard` để xử lý local changes trên VPS. Xem `git status`, backup/stash hoặc commit có chủ đích trước.

## Ma trận triển khai

| Thay đổi | Hành động |
|---|---|
| Backend Go hoặc migration | Build/recreate Backend image. |
| Frontend source, public docs, installer/artifact nằm trong image | Build/recreate Frontend image. |
| Chỉ `AGENT_VERSION` env | `--force-recreate backend`, không cần build image. |
| Chỉ database data | Không build; thao tác DB theo runbook. |
| Chỉ `scripts/publish-agent.sh` | Không build container cho bản thân script. Khi chạy publish, artifact và env có thể kéo theo bước khác. |
| Dockerfile/dependency/lockfile | Build lại image thành phần tương ứng; dùng `--no-cache` chỉ khi cache thực sự nghi lỗi. |

Deploy cả Backend và Frontend:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d --build backend frontend
```

Chỉ recreate Backend sau khi đổi env:

```bash
docker compose --env-file .env -f docker-compose.prod.yml up -d --force-recreate backend
```

## Kiểm tra sau deploy

```bash
docker compose --env-file .env -f docker-compose.prod.yml ps
docker compose --env-file .env -f docker-compose.prod.yml logs --tail=200 backend
docker compose --env-file .env -f docker-compose.prod.yml logs --tail=200 frontend
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:8080/ready
```

`/health` chỉ xác nhận process phục vụ HTTP; `/ready` ping PostgreSQL.

## Public docs deployment

Production Compose mount `./docs:/app/docs:ro`, vì vậy Markdown trong `docs/public` có thể thay đổi sau `git pull` mà không rebuild frontend nếu container thực sự giữ mount đó. Thay đổi React/CSS/catalog trong `frontend/src` luôn cần rebuild Frontend.

## Rollback application

1. Ghi nhận image/container/git SHA hiện tại.
2. Checkout/redeploy một commit đã biết tốt bằng quy trình Git có kiểm soát.
3. Build/recreate đúng thành phần.
4. Không rollback migration bằng cách xóa cột tùy tiện; đánh giá backward compatibility và restore backup nếu cần.
5. Verify `/health`, `/ready`, login, server list và heartbeat.

Compose hiện build local và không gắn image tag immutable. Để rollback đáng tin cậy, production nên lưu image theo Git SHA trong registry; đây chưa phải workflow được source hiện tại triển khai.

## Rủi ro cấu hình Compose hiện tại

`docker-compose.prod.yml` chứa password/JWT mặc định minh họa yếu và expose PostgreSQL `5432`. Production phải override bằng secret mạnh, giới hạn network/port và không commit `.env`. Reverse proxy/TLS không nằm trong repo nên cần runbook hạ tầng riêng.

