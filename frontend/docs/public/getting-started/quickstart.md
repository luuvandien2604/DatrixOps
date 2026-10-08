---
title: Cài đặt nhanh máy chủ DatrixOps
description: Khởi chạy DatrixOps với Docker Compose và cấu hình tài khoản quản trị ban đầu.
---

# Cài đặt nhanh máy chủ DatrixOps

Hướng dẫn này sẽ dẫn bạn từng bước cài đặt máy chủ trung tâm DatrixOps. Chỉ mất vài phút, cụm ứng dụng sẽ sẵn sàng hoạt động, được bảo mật và sẵn sàng tiếp nhận kết nối từ các Agent.

---

## Yêu cầu hệ thống

Trước khi bắt đầu, hãy đảm bảo máy chủ đích đáp ứng các thông số sau:

- **Hệ điều hành**: Cài mới Ubuntu 22.04/24.04 LTS, Debian 12 hoặc Rocky Linux 9.
- **Tài nguyên phần cứng**:
  - Tối thiểu: 1 vCPU, 2 GB RAM, 20 GB dung lượng ổ đĩa trống.
  - Khuyến nghị khi giám sát trên 50 máy chủ: 2 vCPU, 4 GB RAM, 50 GB SSD.
- **Cổng mạng (Ports)**:
  - Mở cổng Inbound TCP `80` (HTTP) và `443` (HTTPS).
  - Có kết nối Internet để tải các hình ảnh Docker và gói phụ thuộc.

---

## Phương pháp 1: Cài đặt tự động (Khuyến nghị)

Tệp cài đặt tự động sẽ chuẩn bị môi trường Docker, phân bổ thư mục lưu trữ, cấu hình biến môi trường và kích hoạt hệ thống kèm chứng chỉ bảo mật SSL tự động qua Caddy.

### Bước 1: Chạy lệnh cài đặt Bootstrap

Đăng nhập vào máy chủ qua SSH với quyền `root` (hoặc tài khoản có quyền `sudo`) và chạy lệnh:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/bootstrap.sh | sudo bash
```

### Bước 2: Thiết lập thông tin ban đầu

Trong quá trình cài đặt, kịch bản sẽ yêu cầu bạn lựa chọn:
1. **Chế độ truy cập**:
   - **Chế độ IP Công khai (Public IP)**: Truy cập trực tiếp qua địa chỉ `http://<dia-chi-ip-may-chu>`.
   - **Chế độ Tên miền (Custom Domain)**: Nhập tên miền riêng của bạn (ví dụ: `ops.tenmien.com`). Hãy chắc chắn bản ghi DNS A/AAAA đã trỏ về IP máy chủ; Caddy sẽ tự động đăng ký và gia hạn chứng chỉ Let's Encrypt SSL.
2. **Tài khoản quản trị viên**:
   - Nhập email và mật khẩu bạn muốn dùng, hoặc chọn mật khẩu bảo mật được sinh ngẫu nhiên.

Sau khi hoàn tất, hệ thống sẽ in ra màn hình đường dẫn đăng nhập và thông tin đăng nhập ban đầu.

---

## Phương pháp 2: Triển khai thủ công với Docker Compose

Nếu bạn muốn tự quản lý các tệp cấu hình container:

### Bước 1: Tải mã nguồn dự án

```bash
git clone https://github.com/luuvandien2604/DatrixOps.git /opt/datrixops
cd /opt/datrixops
```

### Bước 2: Cấu hình tệp biến môi trường

Sao chép tệp cấu hình mẫu:

```bash
cp .env.example .env
```

Mở tệp `.env` bằng trình soạn thảo và điều chỉnh các giá trị chính:

```ini
# Tên miền hoặc địa chỉ IP máy chủ
CADDY_SITE_ADDRESS=http://192.168.1.100

# Chuỗi bí mật mã hóa JWT (tạo chuỗi bằng lệnh: openssl rand -hex 32)
JWT_SECRET=chuoi_khoa_bi_mat_jwt_cua_ban

# Thư mục lưu trữ dữ liệu SQLite
DATA_DIR=/opt/datrixops/data
```

### Bước 3: Khởi chạy các dịch vụ

Chạy các container ở chế độ chạy ngầm:

```bash
sudo docker compose -f deploy/docker-compose.yml up -d
```

Kiểm tra trạng thái các tiến trình đang hoạt động:

```bash
sudo docker compose -f deploy/docker-compose.yml ps
```

---

## Đăng nhập quản trị lần đầu

1. Mở trình duyệt web và điều hướng tới:
   - `http://<dia-chi-ip-may-chu>` (nếu dùng chế độ Public IP)
   - `https://<ten-mien-cua-ban>` (nếu dùng chế độ Tên miền)
2. Nếu là hệ thống mới hoàn toàn và chưa có tài khoản admin, giao diện **Khởi tạo ban đầu** (Setup Wizard) sẽ hiển thị yêu cầu:
   - Nhập **Địa chỉ Email**.
   - Thiết lập **Mật khẩu** an toàn (tối thiểu 8 ký tự).
   - Nhập **Họ và tên**.
3. Nhấn nút **Hoàn tất thiết lập** để khởi tạo bảng điều khiển.
4. Bạn sẽ được đưa trực tiếp vào màn hình **Tổng quan** (`/dashboard`).

> [!TIP]
> Nếu bạn vô tình quên mật khẩu quản trị viên, hãy chạy lệnh `sudo datrix reset-password` trên cửa sổ dòng lệnh máy chủ để đặt lại mật khẩu mới ngay lập tức.

---

## Sử dụng công cụ quản trị `datrix` trên máy chủ

DatrixOps tích hợp sẵn công cụ CLI tại `/usr/local/bin/datrix`. Bạn có thể chạy công cụ này bất cứ lúc nào trên máy chủ:

```bash
sudo datrix
```

Giao diện tương tác trực quan sẽ hiện ra với các tác vụ thiết yếu:
- **Xem trạng thái**: Kiểm tra sức khỏe của frontend, backend và cơ sở dữ liệu.
- **Xem thông tin truy cập**: Hiển thị đường dẫn đăng nhập và thông số máy chủ.
- **Đặt lại mật khẩu Admin**: Đổi mật khẩu tài khoản quản trị mà không cần thao tác DB.
- **Xem nhật ký trực tiếp**: Theo dõi log thời gian thực của các container.
- **Khởi động lại dịch vụ**: Khởi động lại an toàn toàn bộ hệ thống.
- **Tạo bản sao lưu**: Thực hiện sao lưu dữ liệu ngay lập tức.

---

## Bước tiếp theo

Sau khi máy chủ DatrixOps đã vận hành ổn định:
- Xem bài viết [Thêm máy chủ cần giám sát](/docs/vi/getting-started/add-server) để kết nối máy chủ Linux, macOS hoặc Windows đầu tiên.
- Tham khảo [Biến môi trường .env](/docs/vi/reference/configuration) để biết các tùy chọn nâng cao.
