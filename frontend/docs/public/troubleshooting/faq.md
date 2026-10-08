---
title: Câu hỏi thường gặp
description: Giải đáp các thắc mắc về tài nguyên, cổng mạng, lưu trữ và bảo mật.
---

# Câu hỏi thường gặp (FAQ)

Tổng hợp các câu hỏi phổ biến nhất về kiến trúc hệ thống, mức độ tiêu hao tài nguyên phần cứng, yêu cầu cấu hình mạng và các tiêu chuẩn bảo mật của DatrixOps.

---

## Kiến trúc & Tài nguyên hệ thống

### Agent DatrixOps tiêu hao bao nhiêu tài nguyên máy chủ?
DatrixOps Agent được viết bằng ngôn ngữ Go thuần và biên dịch thành tệp nhị phân gốc cực kỳ tinh gọn, không phụ thuộc môi trường chạy cồng kềnh.
- **CPU**: Chiếm chưa tới `0.2%` đến `0.5%` của một nhân CPU trong điều kiện hoạt động bình thường.
- **Bộ nhớ RAM**: Chiếm dụng trung bình chỉ từ `12 MB` đến `20 MB` RAM.
- **Ghi đĩa (Disk I/O)**: Hầu như bằng 0 vì toàn bộ số liệu được gom trực tiếp trong bộ nhớ đệm và truyền tải liên tục qua mạng.

### Cài đặt Agent có cần mở cổng Inbound nào trên máy chủ không?
**Hoàn toàn không.** Máy chủ được giám sát không cần mở bất kỳ cổng kết nối nào từ ngoài vào. DatrixOps Agent hoạt động hoàn toàn theo cơ chế kết nối **chiều đi (outbound)** qua cổng TCP `443` (hoặc `80`) tới máy chủ trung tâm. Mọi tính năng—bao gồm gửi số liệu thời gian thực và mở Web Terminal dòng lệnh—đều hoạt động trơn tru qua kênh WebSocket đảo chiều này.

### Một máy chủ DatrixOps có thể giám sát được bao nhiêu máy con?
Một máy chủ ảo VPS cấu hình khiêm tốn (2 vCPU, 4 GB RAM và ổ cứng SSD) có thể vận hành ổn định cho **50 đến hơn 100 máy chủ giám sát** gửi dữ liệu định kỳ theo chu kỳ chuẩn 30 giây. Đối với các hệ thống quy mô lớn hơn, bạn chỉ cần nâng cấp thêm tài nguyên CPU/RAM và tùy chỉnh thời gian lưu trữ số liệu trong tệp `.env`.

---

## Mạng & Tường lửa (Networking)

### Tôi có thể chạy DatrixOps sau Cloudflare hoặc proxy riêng không?
**Có.** DatrixOps hoạt động tương thích hoàn toàn sau các dịch vụ Reverse Proxy, CDN và bộ cân bằng tải (Load Balancer). Tuy nhiên, vì các luồng số liệu thời gian thực và Web Terminal sử dụng giao thức WebSocket, bạn cần lưu ý:
1. **Bật chế độ WebSockets** trên proxy hoặc CDN (ví dụ trên Cloudflare: vào mục Network $\rightarrow$ gạt WebSockets sang ON).
2. Chuyển tiếp các trường HTTP header: `Upgrade`, `Connection` và `Host` về cổng dịch vụ của DatrixOps.

### Tôi có thể giám sát máy chủ dùng mạng IP động hoặc đặt sau tường lửa NAT không?
**Có.** Do Agent chủ động kết nối ra ngoài máy chủ trung tâm, nên các máy chủ đặt sau mạng NAT gia đình, mạng IP động, 4G/5G hoặc VPC nội bộ của đám mây đều được kết nối và giám sát bình thường mà không gặp bất kỳ trở ngại nào.

---

## Quản lý dữ liệu & Bảo mật

### Dữ liệu giám sát của tôi được lưu ở đâu?
Toàn bộ dữ liệu được lưu cục bộ ngay trên máy chủ của bạn trong cơ sở dữ liệu SQLite (`/opt/datrixops/data/datrixops.db`). Phiên bản DatrixOps Community Edition hoàn toàn không gửi bất kỳ dữ liệu máy chủ, chỉ số hoạt động hay thông tin đăng nhập nào ra các dịch vụ bên ngoài.

### Cơ chế tự động dọn dẹp số liệu cũ hoạt động thế nào?
Để duy trì tốc độ truy vấn tối ưu và chống tràn dung lượng ổ đĩa, DatrixOps tự động dọn dẹp các số liệu chi tiết quá hạn dựa trên biến `METRICS_RETENTION_DAYS` trong tệp `.env` (mặc định là `7 ngày`). Nhật ký sự cố và lịch sử kiểm toán được lưu trữ theo biến `OPERATIONAL_RETENTION_DAYS` (mặc định là `90 ngày`).

### Điều gì xảy ra nếu máy chủ DatrixOps trung tâm khởi động lại hoặc tạm ngắt kết nối?
Nếu máy chủ trung tâm gặp sự cố hoặc bạn chủ động khởi động lại:
- Agent trên các máy con vẫn tiếp tục chạy ngầm ổn định, không bị dừng hay crash.
- Agent tự động chuyển sang chế độ thử lại kết nối theo thuật toán giãn cách thời gian (exponential backoff).
- Ngay khi máy chủ trung tâm hoạt động trở lại, các Agent sẽ tự động kết nối và tiếp tục truyền dữ liệu bình thường mà không cần bất kỳ can thiệp thủ công nào.

---

## Cập nhật & Nâng cấp

### Làm thế nào để nâng cấp máy chủ DatrixOps lên phiên bản mới?
Chạy lệnh quản trị có sẵn trên máy chủ:
```bash
sudo datrix upgrade
```
Trình cập nhật sẽ tự động tạo một bản sao lưu an toàn trước khi nâng cấp, kéo các hình ảnh Docker mới nhất về, chạy migration cơ sở dữ liệu và khởi động lại hệ thống sạch sẽ.

---

## Bạn vẫn còn thắc mắc?

- Xem bài viết [Xử lý sự cố thường gặp](/docs/vi/troubleshooting/common-issues) để tra cứu các lỗi cụ thể.
- Ghé thăm kho mã nguồn chính thức trên [GitHub](https://github.com/luuvandien2604/DatrixOps) để đóng góp ý kiến hoặc phản ánh vấn đề.
