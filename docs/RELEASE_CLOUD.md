# Release DatrixOps Cloud

Cloud là repository private và chỉ release sau CE. Luồng ngắn:

```text
CE release xanh → sync/pin CE SHA → Cloud CI xanh → publish Cloud tag
```

## 1. Đồng bộ CE

Trong `DatrixOps-cloud`, cập nhật shared files và `upstream-community.yaml` tới
full CE SHA đã release. Sau đó chạy:

```bash
bash scripts/validate-community-version.sh
bash scripts/verify-upstream-shared-files.sh
node --test frontend/tests/product-boundary.test.mjs
```

Commit/push Cloud `main` và chờ Cloud CI xanh.

## 2. Publish Cloud

Cloud dùng tag riêng, không dùng tag CE:

```bash
git tag -a cloud-v0.1.0 -m "DatrixOps Cloud v0.1.0"
git push origin cloud-v0.1.0
```

Theo dõi `cloud-release.yml`. Workflow phải tải và verify đúng signed Agent
release của CE trước khi build Cloud image.

Không copy Cloud-only source sang CE, không đưa secret/topology private vào
repo public, và không release Cloud khi CE pin hoặc product-boundary test lỗi.

Chi tiết rollback và rollout nằm trong
[`technical/admin-release-development-workflow.md`](technical/admin-release-development-workflow.md).
