---
title: "Giám sát Website & SSL"
description: "Theo dõi tính khả dụng (Uptime), thời gian phản hồi HTTP và ngày hết hạn chứng chỉ SSL của các website bên ngoài."
---

Tính năng **Giám sát Website & SSL** giúp bạn theo dõi liên tục trạng thái hoạt động của các trang web, API công cộng và dịch vụ web mà không cần cài đặt Agent lên máy chủ chứa website đó.

---

## 1. Thêm Website cần giám sát

Truy cập **Dashboard → Websites → Add Website** và điền các thông số:
- **Tên gợi nhớ:** Tên dịch vụ hoặc trang web.
- **URL mục tiêu:** Địa chỉ HTTP hoặc HTTPS đầy đủ (ví dụ `https://mycompany.vn`).
- **Chu kỳ kiểm tra (Interval):** Khoảng thời gian giữa mỗi lần đo (mặc định 60 giây).
- **Mã phản hồi mong đợi (Expected Status):** Thường là `200` (hoặc các mã 2xx/3xx).
- **Timeout:** Thời gian tối đa chờ phản hồi trước khi tính là lỗi kết nối (ví dụ 10 giây).

---

## 2. Các chỉ số được theo dõi

1. **Uptime (Tính khả dụng %):**
   - Tỷ lệ thời gian website hoạt động trong 24 giờ, 7 ngày và 30 ngày qua.
   - Khi website trả về mã lỗi 5xx hoặc timeout, hệ thống ghi nhận thời điểm downtime.
2. **Thời gian phản hồi (Response Time ms):**
   - Biểu đồ biến thiên tốc độ phản hồi qua từng lượt thăm dò.
3. **Giám sát chứng chỉ SSL/TLS:**
   - Tự động kiểm tra chứng chỉ SSL/TLS của tên miền.
   - Hiển thị Certificate Authority cấp phát, ngày bắt đầu và **số ngày còn lại trước khi hết hạn**.
   - Cảnh báo trước khi chứng chỉ hết hạn (30 ngày, 14 ngày, 7 ngày) để quản trị viên kịp thời gia hạn.

---

## 3. Cơ chế hoạt động của Worker

- Việc kiểm tra do container **`worker`** thực hiện độc lập theo lịch định kỳ (`websiteJob`).
- Không gây ảnh hưởng hay chiếm dụng tài nguyên của API Server (`backend`).
- Kết hợp hoàn hảo với **Alert Center**: Khi website bị sập hoặc chứng chỉ SSL sắp hết hạn, Worker sẽ tự động kích hoạt thông báo gửi về Telegram, Discord hoặc Email.
