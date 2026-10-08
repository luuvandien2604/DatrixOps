---
title: Tổng quan & Khả năng
description: DatrixOps là gì, các nền tảng hỗ trợ và mô hình hoạt động.
---

# Tổng quan & Khả năng

DatrixOps là nền tảng giám sát và vận hành hạ tầng toàn diện được thiết kế dành cho quản trị viên hệ thống, kỹ sư DevOps và người vận hành máy chủ. Ứng dụng cung cấp bảng điều khiển trung tâm giúp theo dõi máy chủ Linux, macOS, Windows, container Docker, độ ổn định đường truyền mạng, tính sẵn sàng của website và lịch sử thực thi cron job—tất cả đều được quản lý trực quan trên giao diện web.

Dù bạn đang quản lý một máy chủ ảo (VPS) cá nhân hay cả một cụm hạ tầng hàng trăm máy chủ vật lý đa đám mây, DatrixOps giúp bạn nắm bắt tình trạng hệ thống tức thì mà không cần cài đặt phức tạp.

---

## Các khả năng chính

### 1. Giám sát máy chủ & Tài nguyên toàn diện
- **Chỉ số thời gian thực**: Theo dõi liên tục mức sử dụng CPU, RAM, dung lượng phân vùng ổ đĩa và băng thông mạng (Rx/Tx).
- **Quản lý dịch vụ**: Kiểm tra trạng thái và điều khiển các dịch vụ hệ thống (systemd trên Linux, Services trên Windows) trực tiếp từ trình duyệt.
- **Quản lý Docker**: Nắm bắt danh sách container đang chạy, mức tiêu hao tài nguyên CPU/RAM và thời gian hoạt động mà không cần mở SSH.

### 2. Chẩn đoán chất lượng mạng
- **Đo lường đa đích**: Thực hiện kiểm tra định kỳ độ trễ gói tin ICMP ping và cổng TCP tới Gateway nội bộ, máy chủ DNS nhà mạng và các tuyến quốc tế.
- **Phân nhóm thẻ (Tag) linh hoạt**: Nhóm các mục tiêu kiểm tra theo từng mục đích (ví dụ: `Trong nước`, `Quốc tế`, `DNS`, `Database`).
- **Phát hiện mất gói & chập chờn**: Phát hiện sớm các sự cố nghẽn mạng ISP, rớt gói tin hoặc suy giảm tuyến cáp trước khi người dùng phản ánh.

### 3. Giám sát Website & Chứng chỉ SSL
- **Kiểm tra Uptime**: Giám sát tính khả dụng liên tục của các trang web và cổng API qua giao thức HTTP/HTTPS.
- **Cảnh báo hạn chứng chỉ SSL**: Tự động theo dõi số ngày còn lại của chứng chỉ TLS/SSL và gửi thông báo nhắc nhở trước khi hết hạn.
- **Đo lường thời gian phản hồi**: Đo lường chi tiết thời gian tra cứu DNS, bắt tay TLS và tốc độ phản hồi mã trạng thái HTTP.

### 4. Cảnh báo sự cố & Đa kênh thông báo
- **Thiết lập ngưỡng linh hoạt**: Định cấu hình các ngưỡng kích hoạt cảnh báo khi máy chủ quá tải CPU, cạn kiệt RAM, đầy ổ đĩa hoặc bị mất kết nối (Offline).
- **Gửi tin tức thì**: Tích hợp gửi thông báo sự cố ngay lập tức qua Telegram, Discord và Email.
- **Khoảng lặng cảnh báo (Cooldown)**: Tự động gom thông báo và giãn cách gửi tin nhằm tránh hiện tượng spam thông báo liên tục.

### 5. Web Terminal từ xa bảo mật
- **Không cần mở cổng Inbound**: Mở cửa sổ dòng lệnh máy chủ trực tiếp ngay trên trình duyệt thông qua kết nối WebSocket đảo chiều (reverse connection).
- **Bảo vệ cổng SSH**: Vận hành an toàn các máy chủ đặt sau tường lửa NAT hoặc dùng IP động mà không phải public cổng 22 ra ngoài Internet.
- **Phân quyền truy cập**: Kiểm soát quyền sử dụng terminal theo vai trò người dùng kèm nhật ký truy vết rõ ràng.

### 6. Giám sát tiến trình Cron định kỳ
- **Lịch sử chạy Cron**: Lưu trữ thời gian bắt đầu chạy, thời lượng xử lý và mã thoát (thành công hoặc thất bại) của từng tác vụ tự động.
- **Phát hiện lỗi kịp thời**: Nắm bắt nhanh các kịch bản sao lưu hoặc tác vụ nền chạy ngầm bị lỗi để xử lý sự cố kịp thời.

---

## Mô hình hoạt động

DatrixOps được xây dựng trên mô hình gọn nhẹ gồm hai thành phần chính:

```
[ DatrixOps Dashboard & Máy chủ trung tâm ]
           │               ▲
           │ Điều khiển    │ Gửi số liệu ra ngoài
           │ mã hóa        │ (HTTPS / WSS Outbound)
           ▼               │
  ┌───────────────────────────────────┐
  │         DatrixOps Agent           │
  │   (Linux / macOS / Windows)       │
  └───────────────────────────────────┘
```

1. **Máy chủ trung tâm (Control Plane)**:
   - Chứa giao diện bảng điều khiển, cơ sở dữ liệu SQLite, bộ máy kích hoạt cảnh báo và lưu trữ chuỗi thời gian.
   - Được triển khai độc lập trên hạ tầng của bạn hoặc chạy qua Docker Compose.
   - Cung cấp API chuẩn qua HTTP và WebSocket.

2. **DatrixOps Agent**:
   - Tệp nhị phân Go siêu nhẹ cài đặt trực tiếp trên từng máy chủ cần giám sát.
   - Thu thập chỉ số tài nguyên, thực hiện đo lường mạng và duy trì kết nối hướng ra ngoài tới máy chủ trung tâm.
   - Tiêu hao tài nguyên cực thấp (< 0.5% CPU và < 20 MB RAM).
   - Tuyệt đối không yêu cầu mở cổng Inbound nào trên tường lửa máy chủ.

---

## Các hệ điều hành hỗ trợ

| Hệ điều hành | Kiến trúc CPU | Phương thức cài đặt |
| :--- | :--- | :--- |
| **Ubuntu Linux** (20.04, 22.04, 24.04+) | x86_64 (amd64), ARM64 | Kịch bản 1 dòng lệnh (systemd) |
| **Debian Linux** (11, 12+) | x86_64 (amd64), ARM64 | Kịch bản 1 dòng lệnh (systemd) |
| **CentOS / RHEL / Rocky / AlmaLinux** (8, 9+) | x86_64 (amd64), ARM64 | Kịch bản 1 dòng lệnh (systemd) |
| **Alpine Linux** | x86_64 (amd64), ARM64 | Container Docker hoặc OpenRC |
| **macOS** (12 Monterey, 13 Ventura, 14 Sonoma+) | Apple Silicon (arm64), Intel (x86_64) | Kịch bản 1 dòng lệnh (launchd) |
| **Microsoft Windows** (10, 11, Server 2019/2022) | x86_64 (amd64) | Kịch bản PowerShell (Windows Service) |

---

## Bước tiếp theo

- Xem hướng dẫn [Cài đặt nhanh máy chủ DatrixOps](/docs/vi/getting-started/quickstart) để khởi tạo hệ thống.
- Tìm hiểu cách kết nối máy chủ đầu tiên tại [Thêm máy chủ cần giám sát](/docs/vi/getting-started/add-server).
