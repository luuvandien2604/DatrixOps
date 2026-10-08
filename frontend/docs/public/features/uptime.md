---
title: Giám sát Website & SSL
description: Kiểm tra Uptime website, mã HTTP, thời gian phản hồi và hạn chứng chỉ SSL.
---

# Giám sát Website & SSL

DatrixOps tích hợp sẵn tính năng giám sát dịch vụ web và chứng chỉ bảo mật SSL/TLS tự động. Bạn có thể theo dõi liên tục các website quan trọng, cổng API khách hàng hoặc hệ thống nội bộ để đảm bảo chúng luôn hoạt động trơn tru, phản hồi nhanh và chứng chỉ bảo mật luôn còn hạn sử dụng.

---

## Các chỉ số được theo dõi

1. **Uptime & Tính khả dụng**: Định kỳ gửi yêu cầu HTTP/HTTPS để xác nhận dịch vụ web đang hoạt động bình thường và trả về đúng mã trạng thái.
2. **Thời gian phản hồi (Độ trễ web)**: Đo lường thời gian xử lý toàn trình (tính bằng mili-giây ms), giúp phát hiện tình trạng tải chậm trước khi website bị sập hoàn toàn.
3. **Thời hạn chứng chỉ SSL/TLS**: Tự động kiểm tra chứng chỉ bảo mật trên các đường dẫn HTTPS, ghi nhận nhà cấp phát (Issuer) và đếm ngược số ngày còn lại trước khi hết hạn.

---

## Thêm Website mới cần giám sát

1. Trên menu bên trái, nhấp vào mục **Uptime** (`/dashboard/websites`).
2. Nhấn nút **Add Website** ở góc trên cùng bên phải.
3. Điền các tham số cấu hình:
   - **Tên website**: Tên gợi nhớ (ví dụ: `Cổng thanh toán` hoặc `Trang chủ công ty`).
   - **Địa chỉ URL**: Đường dẫn đầy đủ bao gồm giao thức (ví dụ: `https://example.com` hoặc `https://api.example.com/health`).
   - **Chu kỳ kiểm tra (Check Interval)**: Tần suất gửi yêu cầu đo lường (mặc định: `60 giây`).
   - **Mã phản hồi mong đợi (Expected Status Code)**: Mã HTTP biểu thị website bình thường (mặc định: `200`).
   - **Thời gian chờ tối đa (Request Timeout)**: Khoảng thời gian tối đa chờ phản hồi trước khi tính là lỗi timeout (mặc định: `10 giây`).
4. Nhấn **Save** để kích hoạt theo dõi ngay lập tức.

---

## Theo dõi tình trạng sức khỏe & Chứng chỉ SSL

Bảng danh sách trong trang **Uptime** thể hiện trực quan mọi thông tin trọng yếu:

### 1. Trạng thái khả dụng (Availability)
- **Up (Xanh lá)**: Website hoạt động tốt, trả về đúng mã HTTP mong đợi.
- **Down (Đỏ)**: Website trả về mã lỗi (ví dụ: `500 Internal Server Error`, `502 Bad Gateway`, `404 Not Found`) hoặc không thể kết nối quá thời gian quy định.

### 2. Thông tin chi tiết chứng chỉ SSL/TLS
Với các website sử dụng giao thức HTTPS, DatrixOps tự động phân tích:
- **Nhà phát hành (Issuer)**: Đơn vị cấp phát chứng chỉ (ví dụ: `Let's Encrypt`, `Cloudflare Inc`, `DigiCert`).
- **Số ngày còn lại (Days Remaining)**: Số ngày đếm ngược đến hạn hết hiệu lực.
- **Ngày hết hạn (Expiration Date)**: Thời điểm cụ thể chứng chỉ hết hạn.
- **Cảnh báo hạn SSL**:
  - **Cảnh báo (Warning)**: Còn dưới `30 ngày`.
  - **Nguy cấp (Critical)**: Còn dưới `7 ngày` hoặc đã hết hạn.

### 3. Biểu đồ thời gian phản hồi & Tỷ lệ hoạt động
Nhấp vào bất kỳ website nào để xem biểu đồ chi tiết:
- **Độ trễ hiện tại**: Thời gian phản hồi trong lần kiểm tra gần nhất.
- **Lịch sử độ trễ**: Biểu đồ tương tác thể hiện xu hướng tốc độ tải trong 24 giờ, 7 ngày hoặc 30 ngày.
- **Tỷ lệ Uptime %**: Tỷ lệ phần trăm thời gian hoạt động liên tục (ví dụ: `99.98%`).

---

## Lịch sử sự cố & Nhật ký gián đoạn

Mỗi khi có sự cố ngừng hoạt động, DatrixOps tự động lưu lại bản ghi:
- **Thời điểm bắt đầu & Thời lượng**: Thời điểm phát hiện sự cố và tổng thời gian website bị gián đoạn.
- **Nguyên nhân lỗi**: Lý do kỹ thuật cụ thể (ví dụ: `HTTP 502 Bad Gateway`, `Connection refused`, `Certificate expired` hoặc `Read timeout`).
- **Thời điểm khôi phục**: Thời điểm chính xác website trở lại trạng thái bình thường.

---

## Bước tiếp theo

- Kết nối thông báo sự cố website vào Telegram hoặc Discord tại [Cảnh báo & Kênh thông báo](/docs/vi/features/alerts).
- Giám sát tài nguyên máy chủ chứa website tại [Giám sát máy chủ & Dịch vụ](/docs/vi/features/servers).
