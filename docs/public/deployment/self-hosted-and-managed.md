---
title: "Self-hosted và Managed"
description: "Phân biệt mô hình triển khai, cài DatrixOps Control Plane và xác định trách nhiệm vận hành."
---

DatrixOps luôn gồm **Control Plane** và **Agent**. Mô hình triển khai quyết định
ai vận hành Control Plane; Agent vẫn phải được cài trên từng server cần giám sát.

## Kiểm tra mô hình đang chạy

Mở **Workspace settings → Deployment & data ownership**:

- **SELF-HOSTED:** Control Plane và PostgreSQL chạy trên hạ tầng do tổ chức của bạn quản lý.
- **MANAGED:** một nhà cung cấp vận hành Control Plane cho bạn.

Màn hình này cũng hiển thị Public URL, phiên bản Agent, retention, trạng thái
registration và các chức năng nâng cao đang bật.

`DEPLOYMENT_MODE` chỉ là metadata mô tả mô hình vận hành. Đổi giá trị này không
tự di chuyển database và không biến một hệ thống single-instance thành SaaS
multi-tenant.

## Hai mô hình khác nhau thế nào?

| Nội dung | Self-hosted | Managed |
| --- | --- | --- |
| Control Plane | Bạn cài trên VPS riêng | Nhà cung cấp vận hành |
| Database và metrics | Nằm trên hạ tầng của bạn | Theo hạ tầng/chính sách nhà cung cấp |
| TLS, backup, upgrade | Bạn chịu trách nhiệm | Nhà cung cấp chịu trách nhiệm |
| Cài Agent | Bắt buộc | Bắt buộc |
| Agent kết nối đến | Domain riêng của bạn | Domain dịch vụ |

## Cài Control Plane self-hosted

Yêu cầu khuyến nghị: Ubuntu 22.04/24.04 hoặc Debian 12, Docker Engine, Docker
Compose v2, 2 CPU, 2 GB RAM, 20 GB disk, DNS và TCP 80/443.

```bash
git clone https://github.com/luuvandien2604/DatrixOps.git
cd DatrixOps
cp deploy/.env.example .env
./deploy/generate-secrets.sh
```

Điền cấu hình:

```dotenv
DATRIXOPS_DOMAIN=monitor.example.com
PUBLIC_URL=https://monitor.example.com
ALLOWED_ORIGINS=https://monitor.example.com
DEPLOYMENT_MODE=self-hosted
AGENT_VERSION=1.5.2
```

Sau đó:

```bash
./deploy/install.sh
```

Mở `https://monitor.example.com/setup`, tạo administrator đầu tiên, chọn
timezone và xác nhận Public URL. Setup chỉ dùng một lần; public registration
mặc định đóng.

## Thêm server và Agent

1. Mở **Servers → Add Server**.
2. Tạo enrollment command cho đúng hệ điều hành.
3. Chạy lệnh bằng `root`, `sudo` hoặc PowerShell Administrator.
4. Enrollment token chỉ dùng một lần; Agent nhận credential riêng sau khi đăng ký.
5. Chờ **Online** và xác nhận CPU, RAM, disk có dữ liệu.

Không dùng token của server này để cài cho server khác.

## Trách nhiệm vận hành self-hosted

Backup:

```bash
./deploy/backup.sh
```

Upgrade an toàn (tự backup trước):

```bash
./deploy/upgrade.sh
```

Kiểm tra:

```bash
docker compose --env-file .env -f deploy/docker-compose.yml ps
docker compose --env-file .env -f deploy/docker-compose.yml logs --tail=200
```

Giữ `.env` và backup ngoài web root, giới hạn SSH, không publish PostgreSQL
port 5432 và chỉ bật Web Terminal/remote scripts sau khi đánh giá bảo mật.

## Khi nào chọn Managed?

Chọn Managed nếu bạn không muốn tự chịu trách nhiệm TLS, database, backup,
upgrade và uptime của Control Plane. Trước khi sử dụng, xác nhận rõ data
residency, retention, backup, quyền truy cập support và quy trình export dữ liệu
với nhà cung cấp.
