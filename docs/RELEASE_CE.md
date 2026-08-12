# Release Community Edition

Quy trình thường ngày chỉ có hai lệnh. Chạy tại repository CE trên nhánh
`main`; không tự sửa hoặc tái sử dụng tag cũ.

## 1. Chuẩn bị release

```bash
cd /Users/luuvandien/VIETNIX/DatrixOps
./scripts/prepare-ce-release.sh 1.5.7
```

Script kiểm tra working tree và remote, chặn version/tag đã dùng, cập nhật mọi
runtime pin và tài liệu, chạy test, sau đó hỏi trước khi commit và push `main`.

## 2. Chờ CI của main

Chờ ba workflow sau thành công trên GitHub Actions:

- `DatrixOps CI` — bao gồm kiểm tra private signing key có khớp public key trong Agent;
- `Installer & Updater Tests`;
- `Build and Push Docker Images to GHCR`.

Không cần xem hoặc nhập lại signing key trong mỗi release.

## 3. Publish

```bash
./scripts/publish-ce-release.sh 1.5.7
```

Script chỉ tạo và push tag sau khi version, HEAD, remote và ba CI đều hợp lệ.
Tag sẽ kích hoạt workflow `DatrixOps Release`, tự ký Agent, build bốn image và
tạo GitHub Release.

## 4. Xác minh và test CE

Sau khi `DatrixOps Release` thành công:

```bash
curl -fsSL \
  https://github.com/luuvandien2604/DatrixOps/releases/download/v1.5.7/agent-release.version

for image in backend worker migrate frontend; do
  docker manifest inspect \
    "ghcr.io/luuvandien2604/datrixops-${image}:1.5.7" >/dev/null \
    && echo "OK: ${image}"
done
```

Cài trên VPS test mới bằng lệnh trong `README.md`, sau đó kiểm tra `/setup`,
login, thêm server, Agent heartbeat, metrics, alert và update Agent.

## Khi có lỗi

- `prepare` lỗi: sửa nguyên nhân và chạy lại cùng version khi chưa có tag.
- `publish` chặn: đọc thông báo; không tạo tag thủ công.
- workflow release lỗi sau khi tag đã được push: không xóa/ghi đè tag; sửa lỗi
  và dùng patch version mới.

Quy trình vận hành, rollback và phát triển chi tiết vẫn nằm trong
[`technical/admin-release-development-workflow.md`](technical/admin-release-development-workflow.md).
