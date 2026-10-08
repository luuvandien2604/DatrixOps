---
title: Giám sát máy chủ & Dịch vụ
description: Theo dõi chỉ số CPU, RAM, ổ đĩa, mạng, dịch vụ hệ thống và container Docker.
---

# Giám sát máy chủ & Dịch vụ

DatrixOps cung cấp cái nhìn chi tiết và tức thì về sức khỏe và hiệu năng của toàn bộ dàn máy chủ của bạn. Từ chế độ xem tổng quan toàn cụm đến các biểu đồ tài nguyên phần cứng chuyên sâu, danh mục dịch vụ hệ thống và trạng thái container, bạn đều có thể quản lý trực tiếp từ trình duyệt web.

---

## Danh sách máy chủ (Servers Fleet View)

Nhấn vào mục **Servers** (`/dashboard/servers`) trên thanh điều hướng bên trái để xem danh sách toàn bộ các máy chủ đã kết nối.

### Thanh tổng kết trạng thái
Ở đầu trang, các thông số tóm tắt nhanh cho bạn biết:
- **Total Servers**: Tổng số lượng máy chủ đã được đăng ký.
- **Online Servers**: Số lượng máy chủ đang gửi dữ liệu đều đặn (nhịp tim heartbeat 30 giây/lần).
- **Offline / Stale Servers**: Số lượng máy chủ bị ngắt kết nối hoặc mất tín hiệu.

### Tìm kiếm và bộ lọc nhanh
- **Lọc theo trạng thái**: Dễ dàng chuyển đổi giữa các tab `All`, `Online` và `Offline`.
- **Thanh tìm kiếm**: Tìm nhanh máy chủ theo tên máy chủ (hostname), địa chỉ IP hoặc thẻ phân loại (tag).
- **Sắp xếp**: Sắp xếp danh sách theo mức tải CPU cao nhất, tiêu hao RAM, dung lượng ổ đĩa hoặc theo thứ tự chữ cái.

---

## Chi tiết máy chủ (Server Detail View)

Nhấp vào bất kỳ máy chủ nào để mở trang **Chi tiết máy chủ** (`/dashboard/servers/[id]`).

### 1. Tab Overview (Tổng quan)
Tab **Overview** hiển thị các số liệu phần cứng được cập nhật liên tục:

- **Thông tin hệ thống**:
  - Bản phân phối hệ điều hành, phiên bản phát hành và phiên bản nhân Linux Kernel.
  - Thời gian hoạt động liên tục (Uptime, ví dụ: `42 days, 6 hours`).
  - Mức tải trung bình (Load Average: `1 phút`, `5 phút`, `15 phút`).
  - Kiến trúc CPU, tên chip vi xử lý và số nhân luồng (Cores).
- **Đồng hồ và biểu đồ tài nguyên thời gian thực**:
  - **Mức sử dụng CPU (%)**: Tỷ lệ phần trăm tổng hợp và chi tiết từng lõi CPU.
  - **Bộ nhớ RAM**: Mức RAM đang sử dụng thực tế, bộ đệm cache và phân vùng Swap.
  - **Dung lượng ổ đĩa (Disk)**: Mức tiêu hao chi tiết theo từng phân vùng gắn kết (`/`, `/var`, `/home`...), bao gồm số dung lượng đã dùng, còn trống và tỷ lệ phần trăm.
  - **Băng thông mạng (Network Throughput)**: Tốc độ truyền tải mạng chiều tải xuống (Rx) và tải lên (Tx) tính bằng KB/s hoặc MB/s trên từng card mạng, đi kèm số lượng gói tin bị lỗi hoặc rớt gói.

---

## Quản lý dịch vụ hệ thống (Services)

Nhấp vào tab **Services** trong trang chi tiết máy chủ để quản lý các tiến trình dịch vụ chạy ngầm (thông qua `systemd` trên Linux).

### Các tác vụ có thể thực hiện
- **Tìm kiếm dịch vụ**: Tra cứu nhanh tên dịch vụ bất kỳ (ví dụ: `nginx`, `docker`, `mysql`, `sshd`).
- **Trạng thái thực tế**: Xem dịch vụ đang `Active (running)`, `Inactive (dead)` hay đang gặp sự cố.
- **Thao tác an toàn**:
  - **Start**: Khởi chạy một dịch vụ đang tắt.
  - **Stop**: Dừng an toàn một dịch vụ đang chạy.
  - **Restart**: Khởi động lại dịch vụ nhanh chóng.

> [!WARNING]
> Việc dừng hoặc khởi động lại các dịch vụ mạng trọng yếu (như `ssh` hoặc tiến trình mạng) có thể làm gián đoạn kết nối điều khiển tạm thời. Hãy thao tác cẩn trọng.

---

## Theo dõi Container Docker

Nếu máy chủ được cài đặt Docker, tab **Docker** sẽ tự động kích hoạt và liệt kê danh sách toàn bộ container trên máy chủ đó.

### Thông tin chi tiết Container
- **Tên & ID Container**: Nhận diện tên định danh và tag hình ảnh (image) Docker đang dùng.
- **Trạng thái**: `running`, `paused`, `restarting` hoặc `exited`.
- **Tài nguyên tiêu hao**:
  - Mức % CPU thời gian thực mà container đang chiếm dụng.
  - Dung lượng RAM sử dụng so với giới hạn cấu hình.
- **Uptime**: Thời gian container đã chạy kể từ lần khởi động gần nhất.

---

## Cài đặt máy chủ & Thẻ phân loại

Nhấp vào tab **Settings** để quản lý thông tin máy chủ:
- **Tên hiển thị (Display Name)**: Đổi tên gợi nhớ cho máy chủ để dễ phân biệt.
- **Thẻ phân loại (Server Tags)**: Gán các thẻ (như `production`, `database`, `vietnam`) phục vụ việc lọc danh sách và phân nhóm chẩn đoán mạng.
- **Thông tin phiên bản Agent**: Xem phiên bản Agent đang chạy và tiến hành kiểm tra cập nhật.

---

## Bước tiếp theo

- Đo lường độ trễ mạng và Gateway uplink tại [Chẩn đoán chất lượng mạng](/docs/vi/features/network-quality).
- Cấu hình thông báo khi máy chủ quá tải tại [Cảnh báo & Kênh thông báo](/docs/vi/features/alerts).
- Mở cửa sổ dòng lệnh trực tiếp với [Web Terminal từ xa](/docs/vi/features/web-terminal).
