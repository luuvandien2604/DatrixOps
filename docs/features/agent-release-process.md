---
title: "Quy trình Release Agent (Version mới)"
description: "Các bước bắt buộc khi phát hành bản Agent mới, tránh lỗi quên đồng bộ version gây auto-update không hoạt động hoặc lặp vô hạn."
role: "admin"
order: 11
---

# Quy trình Release Agent (Version mới)

> Áp dụng mỗi khi sửa code trong `agent/` và muốn đưa bản mới tới toàn bộ VPS đang chạy Agent, **không cần** cài tay lại từng máy.

## Vì sao phải theo đúng quy trình này

Cơ chế tự update dựa vào **so sánh version** giữa agent đang chạy và version backend mong đợi — 2 giá trị này nằm ở **2 file khác nhau**, không tự đồng bộ. Quên bump 1 trong 2 sẽ gây lỗi khó phát hiện (agent không tự update, hoặc update lặp vô hạn).

## 2 nơi bắt buộc phải sửa cùng lúc

| # | File | Vị trí | Vai trò |
|---|---|---|---|
| 1 | `scripts/publish-agent.sh` | 5 dòng `-ldflags="-s -w -X main.Version=X.X.X"` (mỗi platform Linux/macOS/Windows) | Đóng dấu version **vào bên trong binary** khi build |
| 2 | `backend/internal/core/agent_api/handler.go` | dòng có `req.Version != "X.X.X"` (trong hàm `Heartbeat`) | Version mà **backend coi là mới nhất** — dùng để so sánh và quyết định có yêu cầu agent tự update hay không |

## Các bước thực hiện

### Bước 1 — Sửa code Agent
Code trong `agent/` (bug fix, tính năng mới...) — làm như bình thường.

### Bước 2 — Bump version đồng bộ cả 2 file
```bash
cd ~/DatrixOps
# Ví dụ đổi từ 1.1.0 sang 1.2.0 — thay đúng version cũ/mới của bạn
sed -i 's/1\.1\.0/1.2.0/g' scripts/publish-agent.sh backend/internal/core/agent_api/handler.go
```
Kiểm tra lại đã đổi đủ cả 6 chỗ (5 dòng build + 1 dòng so sánh):
```bash
grep -rn "1\.2\.0" scripts/publish-agent.sh backend/internal/core/agent_api/handler.go
```

### Bước 3 — Build & publish binary mới
```bash
bash scripts/publish-agent.sh
```
Script tự build cho cả 5 platform (Linux amd64/arm64, macOS amd64/arm64, Windows amd64) và ghi vào `frontend/public/`.

### Bước 4 — Deploy cả Backend và Frontend
```bash
docker compose -f docker-compose.prod.yml build backend frontend
docker compose -f docker-compose.prod.yml up -d backend frontend
```
- **Backend** phải deploy lại vì `handler.go` đã đổi.
- **Frontend** phải deploy lại vì nó serve file binary/install script tĩnh trong `frontend/public/`.

### Bước 5 — Không cần làm gì trên các VPS
Agent đang chạy sẽ tự phát hiện version lệch ở heartbeat kế tiếp (tối đa `DATRIXOPS_INTERVAL` giây, mặc định 10s) → tự tải bản mới → tự restart. Theo dõi qua log từng VPS nếu muốn xác nhận:
```bash
# Linux
sudo journalctl -u datrixops-agent -f
```

## 2 lỗi thường gặp nếu làm sai thứ tự

| Lỗi | Nguyên nhân | Triệu chứng |
|---|---|---|
| Quên bump ở `handler.go` (Bước 2) | Backend vẫn so sánh với version cũ | Agent build version mới nhưng **không agent nào tự update** — vì backend không thấy version lệch |
| Quên bump ở `publish-agent.sh` (Bước 2) | Binary build ra vẫn đóng dấu version cũ dù code đã đổi | Agent tự update xong **vẫn bị coi là cần update tiếp** → lặp update vô hạn, tốn băng thông/CPU liên tục |
| Chỉ chạy `docker compose build/up` mà quên Bước 3 (`publish-agent.sh`) | Binary trong `frontend/public/` vẫn là bản cũ | Agent "tự update" nhưng thực chất tải lại đúng bản cũ, coi như không có gì thay đổi |

## Checklist nhanh trước khi release

- [ ] Đã sửa code trong `agent/`
- [ ] Đã bump version ở **cả 2 file** (`publish-agent.sh` + `agent_api/handler.go`)
- [ ] Đã chạy `bash scripts/publish-agent.sh`
- [ ] Đã `docker compose build backend frontend`
- [ ] Đã `docker compose up -d backend frontend`
- [ ] Đã kiểm tra log ít nhất 1 VPS để xác nhận agent tự update thành công

## Liên quan

- [Feature Map — Update Agent](/docs/feature-map) — chi tiết cơ chế 2 cách kích hoạt update (chủ động qua nút UI / tự động qua so version)
- [Quản lý Service Agent](/docs/agent-service-management) — cách kiểm tra/dừng/gỡ agent nếu cần can thiệp tay
