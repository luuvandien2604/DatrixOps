---
title: "Self-hosted và Managed"
description: "Phân biệt mô hình triển khai, cài DatrixOps Control Plane và xác định trách nhiệm vận hành."
---

DatrixOps luôn gồm **Control Plane** và **Agent**. Mô hình triển khai quyết định ai vận hành Control Plane; Agent vẫn phải được cài trên từng server cần giám sát.

## Kiểm tra mô hình đang chạy

Mở **Workspace settings → Deployment & data ownership**:

- **SELF-HOSTED:** Control Plane và PostgreSQL chạy trên hạ tầng do tổ chức của bạn quản lý.
- **MANAGED:** một nhà cung cấp vận hành Control Plane cho bạn.

Màn hình này cũng hiển thị Public URL, phiên bản Agent, retention, trạng thái registration và các chức năng nâng cao đang bật.

## Hai mô hình khác nhau thế nào?

| Nội dung | Self-hosted | Managed |
| --- | --- | --- |
| Control Plane | Cài trên VPS riêng của bạn | Nhà cung cấp vận hành |
| Database và metrics | Nằm trên hạ tầng của bạn | Theo hạ tầng/chính sách nhà cung cấp |
| TLS, backup, upgrade | Bạn chủ động thực hiện | Nhà cung cấp chịu trách nhiệm |
| Cài Agent | Bắt buộc | Bắt buộc |
| Agent kết nối đến | IP / Domain riêng của bạn | Domain dịch vụ |

## Cài Control Plane Self-Hosted (Tự động 100%)

Yêu cầu khuyến nghị: Linux (Ubuntu 20.04/22.04/24.04, Debian 12, CentOS/RHEL/Rocky), 1 CPU, 2 GB RAM, 20 GB disk, TCP 80/443.

Chạy lệnh cài đặt tự động 1-liner trên VPS bằng quyền root:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/install.sh | sudo bash
```

Script tự động:
1. Kiểm tra và tự động cài Docker, Docker Compose v2 và Nginx (nếu VPS chưa có).
2. Tự động nhận diện IP Public của VPS và tạo các mã bảo mật `.env`.
3. Tải các Docker container và Agent binaries đã được ký số an toàn.
4. Chạy migration và khởi động toàn bộ dịch vụ DatrixOps.

Sau khi cài xong, mở `http://<IP-VPS-CUA-BAN>/setup` để tạo tài khoản Admin ban đầu.

## Nâng cấp hệ thống Self-Hosted

Quy trình nâng cấp phiên bản Self-Hosted gồm 2 bước linh hoạt:

### 1. Nâng cấp Control Plane (VPS chính)
Khi có phiên bản mới, chạy lệnh sau trên VPS cài đặt DatrixOps để cập nhật Web Dashboard, Backend API và Agent tự giám sát của VPS chính:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/upgrade.sh | sudo bash
```

Hệ thống sẽ tự động sao lưu dữ liệu, tải bản cập nhật mới nhất, chạy migration và khởi động lại dịch vụ mượt mà.

### 2. Nâng cấp các Agent vệ tinh (Target Servers / Nodes)
👉 **Không cần SSH vào từng máy chủ vệ tinh!**

- Ngay sau khi Control Plane nâng cấp lên phiên bản mới, Dashboard Web sẽ so sánh và hiển thị nhãn **`Update available`** cho các máy chủ vệ tinh đang chạy bản Agent cũ.
- Người vận hành chỉ cần nhấn nút **"Update Agent"** (hoặc chọn hàng loạt và nhấn **"Update all agents"**) trực tiếp trên Dashboard Web.
- Control Plane sẽ gửi tác vụ cập nhật ngầm. Agent vệ tinh tự động tải bản binary mới từ Control Plane, nâng cấp tại chỗ (In-Place Update) và khởi động lại dịch vụ hoàn toàn tự động.
