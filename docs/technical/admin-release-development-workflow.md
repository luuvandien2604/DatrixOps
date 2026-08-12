# Quy trình Admin: phát triển, kiểm thử, release và làm sạch source

Tài liệu này là checklist vận hành dành cho admin/maintainer có quyền push vào
hai repository:

- **CE**: `DatrixOps` — nguồn chuẩn của shared core và Agent.
- **Cloud**: `DatrixOps-cloud` — downstream giữ Cloud-only features và pin một
  CE commit chính xác trong `upstream-community.yaml`.

Mục tiêu là đảm bảo mỗi thay đổi đi qua đúng thứ tự:

```text
chọn phạm vi
  -> tạo branch
  -> code + test
  -> review diff và làm sạch source
  -> commit/push branch hoặc main theo policy
  -> chờ CI green
  -> release CE trước
  -> pin/sync Cloud
  -> release Cloud
  -> smoke test + rollout có kiểm soát
```

Không tạo hoặc đẩy tag nếu bất kỳ gate bắt buộc nào chưa green.

## 1. Quy tắc nền tảng

1. Không phát triển trực tiếp trên một release artifact hoặc sửa lại tag cũ.
2. Không force-push `main`, không dùng lại version/tag đã publish.
3. Shared core và Agent luôn sửa ở CE trước. Cloud chỉ nhận lại sau khi CE đã
   commit và có full SHA ổn định.
4. Cloud-only features không được copy ngược vào CE nếu vi phạm product
   boundary.
5. Không commit `.env`, `.env.release`, signing private key, token, database
   dump, log, build output, Agent binary hoặc `frontend/public/releases/`.
6. Migration production phải có backup và phương án rollback trước rollout.
7. Release lỗi phải được sửa bằng patch version mới; không ghi đè bytes hoặc
   assets của release cũ.

## 2. Chọn loại thay đổi

| Loại thay đổi | Repo bắt đầu | Sau đó |
|---|---|---|
| Backend/frontend/Agent dùng chung | CE | Sync các shared files cần thiết và pin CE SHA trong Cloud |
| Installer hoặc updater dùng chung | CE | Xác minh byte-identity trong Cloud |
| Billing, tenant, provider, region, managed policy | Cloud | Không đưa vào CE |
| Tài liệu CE/self-host | CE | Chỉ sync nếu Cloud thực sự dùng nội dung đó |
| Cloud operations/deployment | Cloud | Không đưa secret hoặc topology private vào CE |
| Hotfix production shared core | CE | Release CE patch trước, rồi Cloud patch |

Nếu một feature chạm cả shared core và Cloud UI, chia thành hai commit/PR:

1. CE commit chứa contract/shared behavior.
2. Cloud commit pin CE SHA mới và chứa Cloud integration.

## 3. Chuẩn bị môi trường phát triển

Tại mỗi repo, bắt đầu từ working tree sạch:

```bash
git switch main
git pull --ff-only
git status --short --branch
```

Kết quả mong đợi: không có dòng `M`, `A`, `D`, `??`; `main` không diverge với
`origin/main`.

Tạo branch có mục tiêu rõ ràng:

```bash
git switch -c feature/<ten-ngan>
# hoặc fix/<ten-ngan>, docs/<ten-ngan>, chore/<ten-ngan>
```

Cài dependency:

```bash
(cd backend && go mod download)
(cd agent && go mod download)
(cd frontend && npm ci)
```

Không dùng production token/secret trong development. Agent local phải có URL
đầy đủ `/api/v1`:

```bash
cd agent
DATRIXOPS_AGENT_TOKEN="<DEV_TOKEN>" \
DATRIXOPS_SERVER_URL="http://localhost:8080/api/v1" \
go run ./cmd/agent
```

## 4. Quy trình phát triển tính năng mới

### 4.1. Thiết kế trước khi code

Ghi rõ trong issue/PR:

- vấn đề người dùng;
- edition sở hữu feature: CE, Cloud hoặc shared;
- API/DB/UI/Agent nào bị ảnh hưởng;
- migration và backward compatibility;
- test unit, integration, product-flow cần thêm;
- cách rollout, quan sát và rollback.

Không thay API contract cũ nếu có thể mở rộng tương thích. Nếu buộc breaking
change, phải version hóa contract và có kế hoạch nâng Agent/server theo thứ tự.

### 4.2. Backend và database

- Module mới đặt trong `backend/internal/core/<module>/` theo pattern hiện có.
- Đăng ký route ở `backend/cmd/api/main.go`.
- Migration mới đặt trong `backend/migrations/`, tên duy nhất và idempotent.
- Thêm test authorization, validation, repository/service và failure path.
- Không log token, password, request secret hoặc signing material.

### 4.3. Agent

- JSON field phải khớp chính xác giữa Agent và Backend.
- Task mới phải có cả producer, consumer, result handling và timeout behavior.
- Update path phải giữ fail-closed cho signature, size, SHA-256, platform,
  version marker, activation và rollback.
- Test ít nhất Linux; code platform-specific phải có native CI tương ứng.

### 4.4. Frontend

- Giữ TypeScript strict và ESLint green; không tắt rule để vượt CI.
- Test loading, empty, success, validation, authorization và API failure.
- Không làm mất Cloud-only state khi port một shared page sang Cloud.
- User-facing docs phải cập nhật cả tiếng Việt và tiếng Anh nếu route public
  hỗ trợ hai locale.

### 4.5. Kiểm tra trong lúc phát triển

Chạy test gần phần vừa sửa trước, sau đó chạy full gate ở mục 5. Với bug, luôn
thêm regression test tái hiện lỗi trước hoặc cùng commit fix.

## 5. Gate bắt buộc trước commit/push

### 5.1. CE

```bash
test -z "$(gofmt -l $(find backend agent -name '*.go'))"
(cd backend && go test ./... && go vet ./...)
(cd agent && go test ./... && go vet ./...)
(cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build)
bash -n scripts/*.sh frontend/public/*.sh deploy/*.sh
bash tests/release-pipeline.sh
git diff --check
```

Nếu thay installer/updater, bắt buộc kiểm tra workflow
`.github/workflows/installer-tests.yml` và chờ đủ ba native jobs:

- Linux Installer & Updater Tests;
- macOS Installer & Updater Tests;
- Windows Installer & Updater Tests.

### 5.2. Cloud

```bash
bash scripts/validate-community-version.sh
bash scripts/verify-upstream-shared-files.sh
bash -n scripts/*.sh frontend/public/*.sh
(cd backend && go test ./... && go vet ./...)
(cd agent && go test ./... && go vet ./...)
(cd frontend && npm ci && npm run lint && npm run typecheck && npm test && npm run build)
node --test frontend/tests/product-boundary.test.mjs
git diff --check
```

Nếu test cần PostgreSQL, dùng database test riêng; không trỏ test vào production.

### 5.3. Review diff cuối

```bash
git status --short
git diff --stat
git diff
git diff --check
```

Kiểm tra đặc biệt:

- không có secret, hostname/IP private hoặc dữ liệu người dùng;
- không có binary/build output hoặc file permission thay đổi ngoài ý muốn;
- migration không phá dữ liệu hiện có;
- Cloud feature không bị xóa khi sync shared file;
- test mới thật sự fail trên code cũ và pass trên code mới.

## 6. Làm sạch source trước khi push hoặc nén

### 6.1. Kiểm kê an toàn

```bash
git status --short
git status --short --ignored
find . -type f \( -name '.DS_Store' -o -name '*.log' -o -name '*.tmp' -o -name '*.swp' \) -print
find . -type d \( -name '__pycache__' -o -name '.pytest_cache' -o -name '.next' -o -name 'coverage' \) -prune -print
```

Chỉ xóa mục đã xác định là generated/rebuildable, ví dụ:

```bash
rm -f .DS_Store frontend/next-env.d.ts
rm -rf frontend/.next frontend/out frontend/coverage
rm -rf backend/tmp agent/tmp .tmp
```

`node_modules` không được Git track. Có thể giữ để phát triển hoặc xóa trước
khi nén thủ công rồi cài lại bằng `npm ci`.

Không chạy mù quáng `git clean -fdX`: lệnh đó có thể xóa `.env`,
`.env.release`, key hoặc dữ liệu local đang được ignore.

### 6.2. Kiểm tra file nhạy cảm không bị track

```bash
git ls-files | rg '(^|/)(\.env($|\.)|node_modules/|\.next/|dist/|coverage/|frontend/public/releases/)|\.(pem|key|p12|pfx|db|sqlite)$'
```

Kết quả bình thường chỉ có các template được cho phép như `.env.example`.
Nếu thấy secret thật, dừng push, remove khỏi index và rotate secret nếu nó từng
được push.

### 6.3. Tạo source archive sạch

Ưu tiên `git archive` thay vì ZIP nguyên working directory. Cách này chỉ lấy
tracked files tại commit, tự loại `.git`, ignored files, cache và secret local:

```bash
git archive --format=zip \
  --prefix="DatrixOps-<VERSION>/" \
  --output="../DatrixOps-<VERSION>-source.zip" \
  HEAD
```

Trong repo Cloud:

```bash
git archive --format=zip \
  --prefix="DatrixOps-cloud-<VERSION>/" \
  --output="../DatrixOps-cloud-<VERSION>-source.zip" \
  HEAD
```

Kiểm tra archive:

```bash
unzip -l ../DatrixOps-<VERSION>-source.zip | less
```

Không đưa signing private key, `.env`, backup hoặc database dump vào source
archive.

## 7. Commit và push code

```bash
git add <danh-sach-file-cu-the>
git diff --cached --check
git diff --cached --stat
git diff --cached
git commit -m "feat(scope): mo ta ngan"
git push -u origin HEAD
```

Ưu tiên add file cụ thể thay vì `git add .`. Sau push:

1. Chờ tất cả required CI jobs hoàn tất.
2. Mở từng failure và sửa root cause; không rerun liên tục để che flaky test.
3. Chỉ merge/push `main` khi review và product-boundary đều đạt.
4. Sau merge, xác minh `HEAD == origin/main` và working tree sạch.

## 8. Quy trình release CE

### 8.1. Chọn version

Dùng SemVer `MAJOR.MINOR.PATCH`:

- `PATCH`: bug/security fix tương thích;
- `MINOR`: feature tương thích ngược;
- `MAJOR`: breaking change có migration/upgrade plan.

Tag CE có dạng `v<CE_VERSION>`. Trước release, cập nhật các version runtime
cần thiết trong `.env.example` và tài liệu; không thêm tiền tố `v` vào giá trị
env. Agent version và tag phải phản ánh artifact sắp publish.

### 8.2. Preflight CE

```bash
git switch main
git pull --ff-only
git status --short --branch
git rev-parse HEAD
git tag -l "v<CE_VERSION>"
```

Điều kiện **GO**:

- working tree sạch và `HEAD == origin/main`;
- CE CI, installer native jobs và Docker workflow của HEAD đều green;
- `AGENT_SIGNING_PRIVATE_KEY` đã cấu hình trong GitHub Actions secrets;
- version chưa có tag/release/GHCR artifact;
- release notes, migration, backup và rollback plan đã sẵn sàng.

### 8.3. Tạo tag kích hoạt release

Đây là điểm phát hành ra ngoài. Kiểm tra lại version trước khi chạy:

```bash
git tag -a "v<CE_VERSION>" -m "DatrixOps CE v<CE_VERSION>"
git show "v<CE_VERSION>" --no-patch
git push origin "v<CE_VERSION>"
```

Workflow `.github/workflows/release.yml` sẽ:

1. chạy native installer tests;
2. test source;
3. build và ký 5 Agent binaries;
4. verify signature, size, SHA-256 và version marker;
5. stage artifacts vào frontend image;
6. build/push backend, worker, migrate và frontend images;
7. tạo GitHub Release đúng một lần.

Không quảng bá version mới trong Backend trước khi workflow hoàn tất success.

### 8.4. Xác minh CE release

- GitHub Release tồn tại đúng tag và đủ assets.
- `agent-release.version`, manifest, signature, `.sha256`, `.size` đúng version.
- GHCR có đủ image tags mong đợi.
- Frontend image chứa root artifacts và `releases/<VERSION>/`.
- Cài mới Agent trên VPS test Linux; nếu có runner/máy phù hợp, test macOS và
  Windows.
- Update một Agent cũ lên version mới, xác minh heartbeat version và service.
- Login, server list, metrics, task, alert, website/SSL và admin pages hoạt động.

Nếu workflow publish dở dang, không reuse version. Xử lý partial image tags theo
runbook, sửa lỗi và phát hành patch version mới.

## 9. Sync và release Cloud

Cloud chỉ release sau CE commit/release mà nó phụ thuộc đã ổn định.

### 9.1. Sync CE vào Cloud

Trong Cloud repo:

1. Chọn full 40-character CE SHA.
2. Đồng bộ đúng shared files; không copy wholesale Cloud page từ CE.
3. Cập nhật `upstream-community.yaml`:
   - `upstream.version`;
   - `upstream.commit`;
   - `upstream.synced_at`;
   - `agent.version` nếu Agent release thay đổi.
4. Cập nhật `.env.example` cho core/cloud/agent version phù hợp.
5. Chạy toàn bộ Cloud gate ở mục 5.2.

Xác minh bắt buộc:

```bash
bash scripts/validate-community-version.sh
bash scripts/verify-upstream-shared-files.sh
node --test frontend/tests/product-boundary.test.mjs
```

Sau commit/push, chờ Cloud CI green trước khi tag.

### 9.2. Tạo Cloud release tag

Tag Cloud có dạng `cloud-v<CLOUD_VERSION>`:

```bash
git switch main
git pull --ff-only
git status --short --branch
git tag -l "cloud-v<CLOUD_VERSION>"
git tag -a "cloud-v<CLOUD_VERSION>" -m "DatrixOps Cloud v<CLOUD_VERSION>"
git show "cloud-v<CLOUD_VERSION>" --no-patch
git push origin "cloud-v<CLOUD_VERSION>"
```

Trước tag, xác minh GitHub configuration:

- variable `CE_AGENT_RELEASE_BASE_URL` trỏ đúng nguồn CE artifact;
- secret `CE_AGENT_RELEASE_TOKEN` có nếu nguồn yêu cầu authentication;
- workflow có quyền đọc source và ghi GHCR package;
- CE Agent release mà Cloud pin có đủ signed assets.

Workflow `.github/workflows/cloud-release.yml` validate source, tải và verify
signed CE Agent release, test/build Cloud, stage artifacts và push Cloud images.

## 10. Product test và rollout production

### 10.1. Test trên staging/canary

1. Backup database và config; ghi lại image/version đang chạy.
2. Deploy exact immutable version tags, không dùng `latest`.
3. Kiểm tra migration và readiness trước khi mở traffic.
4. Smoke test bằng admin và một user thường.
5. Update một Agent canary trước khi rollout fleet.
6. Quan sát log, error rate, task queue, heartbeat và resource usage.

Checklist sản phẩm tối thiểu:

- register/login/refresh/logout và authorization;
- admin users/servers;
- add/remove server và installer theo platform hỗ trợ;
- heartbeat, metrics, process/service/Docker inventory;
- task start/stop/restart/log và persisted result;
- Agent update, restart, rollback/failure reporting;
- alert rule/channel và website/SSL scheduler;
- Cloud: onboarding, workspace/tenant boundary, provider/region/environment,
  subscription/policy và Cloud-only management flows;
- backup/restore smoke test nếu release chạm database hoặc deployment.

### 10.2. Rollout

```text
staging
  -> 1 canary instance
  -> nhóm nhỏ
  -> toàn bộ control plane
  -> Agent rollout theo batch
```

Mỗi bước chỉ tiếp tục khi health, logs và product flow ổn định. Ghi lại thời
điểm, version, operator và kết quả.

### 10.3. Stop/rollback conditions

Dừng rollout khi có một trong các dấu hiệu:

- migration lỗi hoặc dữ liệu sai;
- authentication/authorization regression;
- panic, 5xx lặp lại hoặc readiness fail;
- Agent mất heartbeat sau update;
- signature/size/SHA/version verification fail;
- Cloud tenant boundary hoặc product-boundary regression.

Rollback control plane bằng image/version đã ghi nhận và restore database chỉ
theo backup runbook. Với Agent artifact lỗi, ưu tiên phát hành patch version cao
hơn; không ghi đè artifact immutable cũ.

## 11. Hoàn tất release

Release chỉ được đánh dấu hoàn tất khi:

- CE/Cloud workflow tương ứng green;
- tag, commit và runtime version khớp;
- release assets/images xác minh thành công;
- staging/canary/product smoke test pass;
- production monitoring ổn định;
- release notes, migration notes và rollback record đã lưu;
- hai repo clean, `HEAD == origin/main`;
- source archive được tạo bằng `git archive` nếu cần bàn giao.

Nếu còn một mục chưa đạt, trạng thái là **release pending**, không phải
**released**.
