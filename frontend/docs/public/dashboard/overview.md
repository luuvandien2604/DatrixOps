---
title: "Tổng quan Dashboard"
description: "Hiểu trạng thái server, đọc các chỉ số CPU, RAM, disk, network và cấu trúc các khu vực giám sát trên DatrixOps."
---

Bảng điều khiển (Dashboard) của DatrixOps tổng hợp số liệu thực tế được gửi định kỳ từ Agent và lưu trữ trong cơ sở dữ liệu PostgreSQL. Hệ thống không tạo số liệu giả lập khi Agent offline.

---

## 1. Trạng thái máy chủ (Server State)

- **Online (Xanh lá):** Backend vừa nhận heartbeat hợp lệ trong cửa sổ thời gian gần nhất (thường trong vòng 30 - 60 giây).
- **Offline (Xám/Đỏ):** Quá thời gian quy định không nhận được tín hiệu heartbeat. Lịch sử dữ liệu cũ vẫn được bảo toàn nguyên vẹn.
- **Biểu diễn trên biểu đồ:** Các khoảng thời gian Agent offline sẽ xuất hiện dưới dạng khoảng trống (gaps) trên biểu đồ thời gian thực, giúp quản trị viên nhận biết chính xác thời điểm máy chủ mất kết nối và thời điểm phục hồi.

---

## 2. Các chỉ số tài nguyên hệ thống

| Chỉ số | Ý nghĩa & Cách đọc |
| :--- | :--- |
| **CPU Usage** | Tỷ lệ phần trăm tải CPU toàn hệ thống tại thời điểm gửi heartbeat. Các đợt tăng vọt ngắn hạn (spikes) cần được đối chiếu với biểu đồ lịch sử. |
| **RAM Utilization** | Dung lượng bộ nhớ thực tế đang sử dụng so với tổng RAM vật lý mà Agent báo cáo. |
| **Disk Capacity** | Phần trăm và dung lượng ổ cứng hệ thống (root filesystem) đã sử dụng. |
| **Disk I/O** | Tốc độ đọc / ghi dữ liệu trên ổ cứng theo thời gian (MB/s hoặc IOPS), phân biệt với dung lượng lưu trữ. |
| **Network Throughput** | Băng thông mạng gửi (Tx) và nhận (Rx) tính theo byte/giây giữa hai mẫu đo liên tiếp. |

---

## 3. Các phân hệ chức năng trên thanh điều hướng

1. **Servers (`/dashboard/servers`):** Danh sách tất cả máy chủ trong hạ tầng kèm IP, hệ điều hành, mức sử dụng tài nguyên và nút thao tác nhanh.
2. **Network Quality (`/dashboard/network`):** Trung tâm quản lý mục tiêu đo lường chất lượng mạng, kiểm tra độ trễ ICMP/TCP tới các cụm Gateway, DNS và server quốc tế.
3. **Websites (`/dashboard/websites`):** Giám sát tính khả dụng (Uptime) và ngày hết hạn chứng chỉ SSL/TLS của các trang web/API bên ngoài.
4. **Alert Center (`/dashboard/alerts`):** Quản lý quy tắc cảnh báo, danh sách sự cố và tích hợp kênh thông báo Telegram, Discord, Email.
5. **Audit Logs (`/dashboard/audit`):** Nhật ký ghi nhận toàn bộ thao tác của người dùng trên hệ thống nhằm đảm bảo an toàn thông tin.

---

## 4. Trang chi tiết máy chủ (`/dashboard/servers/[id]`)

Khi nhấp vào một máy chủ trong danh sách, trang chi tiết cung cấp các tab chuyên sâu:
- **Overview:** Thông tin hệ điều hành, kernel, phiên bản Agent, thời gian uptime, CPU model và dung lượng ổ cứng.
- **Resources:** Biểu đồ lịch sử chi tiết về CPU, Memory, Disk, Disk I/O và Network theo nhiều khung giờ (1 giờ, 24 giờ, 7 ngày).
- **Network Quality:** Thẻ đo độ trễ Gateway nội bộ, các nhóm thẻ tag chẩn đoán mạng và biểu đồ time-series độ trễ / mất gói.
- **Docker:** Quản lý danh sách container, trạng thái chạy và nút khởi động lại/dừng container từ xa.
- **Processes:** Danh sách các tiến trình đang chiếm dụng tài nguyên cao nhất trên máy chủ.
- **Services:** Quản lý các dịch vụ hệ thống (systemd, launchd, windows services).
- **Web Terminal:** Mở giao diện dòng lệnh (shell) tương tác trực tiếp lên máy chủ từ xa một cách bảo mật.
