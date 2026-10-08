---
title: Cảnh báo & Kênh thông báo
description: Cấu hình ngưỡng cảnh báo tự động gửi qua Telegram, Discord, Email và Webhook.
---

# Cảnh báo & Kênh thông báo

DatrixOps trang bị bộ máy cảnh báo tự động mạnh mẽ, liên tục đối chiếu các chỉ số thu thập từ máy chủ, kiểm tra tính sẵn sàng của website và kết quả đo kiểm mạng với các quy tắc do bạn thiết lập. Khi phát hiện tình trạng bất thường hoặc sự cố gián đoạn, DatrixOps lập tức gửi thông báo tới các kênh liên lạc của đội ngũ vận hành.

---

## Cơ chế hoạt động của cảnh báo

Quy trình cảnh báo gồm 3 giai đoạn:

1. **Đối soát quy tắc (Rule Evaluation)**: Mọi báo cáo chỉ số được so sánh với các ngưỡng đã cấu hình (ví dụ: CPU > 85% kéo dài liên tục 5 phút).
2. **Khởi tạo sự cố (Incident Creation)**: Khi vượt ngưỡng, hệ thống tạo một **Sự cố đang diễn ra (Active Incident)** với mức độ nghiêm trọng tương ứng (`Warning` hoặc `Critical`) và lưu vào nhật ký sự cố.
3. **Phát tin đa kênh (Multi-Channel Dispatch)**: DatrixOps tự động gửi nội dung thông báo tới các kênh đã chọn. Khi chỉ số trở lại bình thường, hệ thống tự động gửi tin nhắn **Đã khắc phục (Resolved)**.

---

## Cấu hình các kênh nhận thông báo

Trước khi tạo quy tắc cảnh báo, bạn cần kết nối các kênh liên lạc trong mục **Alerts → Notification Channels**.

### 1. Kênh Telegram
Nhận thông báo tức thì trực tiếp trong nhóm Telegram hoặc tin nhắn riêng.

1. Khởi tạo một bot Telegram qua [@BotFather](https://t.me/BotFather) và lấy mã **Bot Token**.
2. Thêm bot vừa tạo vào nhóm Telegram hoặc kênh cần nhận tin.
3. Lấy mã **Chat ID** của nhóm (bạn có thể mời `@userinfobot` vào nhóm hoặc gửi tin nhắn để lấy chat ID qua API Telegram).
4. Trên DatrixOps, nhấn **Add Channel**, chọn **Telegram** và điền:
   - **Tên kênh**: ví dụ `Telegram Cảnh báo Vận hành`.
   - **Bot Token**: ví dụ `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`.
   - **Chat ID**: ví dụ `-1001234567890`.
5. Nhấn nút **Send Test Notification** để kiểm tra gửi tin thành công, sau đó nhấn **Save**.

### 2. Kênh Discord
Phát thông báo vào kênh thảo luận Discord thông qua Webhook.

1. Mở Cài đặt máy chủ Discord (Server Settings) $\rightarrow$ **Integrations** $\rightarrow$ **Webhooks**.
2. Nhấn **New Webhook**, chọn kênh chat tiếp nhận và sao chép **Webhook URL**.
3. Trên DatrixOps, nhấn **Add Channel**, chọn **Discord** và điền:
   - **Tên kênh**: ví dụ `Discord Nhật ký Sự cố`.
   - **Webhook URL**: ví dụ `https://discord.com/api/webhooks/...`.
4. Nhấn **Send Test Notification** để xem tin nhắn mẫu trên Discord, sau đó nhấn **Save**.

### 3. Kênh Email (SMTP)
Gửi email thông báo tới quản trị viên hoặc hòm thư nhóm trực ban.

1. Nhấn **Add Channel** và chọn **Email**.
2. Điền thông số máy chủ gửi thư SMTP:
   - **SMTP Host & Port**: ví dụ `smtp.gmail.com`, cổng `587` (TLS) hoặc `465` (SSL).
   - **Tài khoản & Mật khẩu ứng dụng**: Thông tin xác thực SMTP.
   - **Email nhận tin**: Danh sách các địa chỉ email nhận cảnh báo (phân cách bằng dấu phẩy).
3. Gửi email kiểm tra và nhấn **Save**.

### 4. Kênh Webhook tùy biến
Tích hợp linh hoạt với hệ thống quản lý sự cố bên ngoài hoặc các kịch bản tự động hóa.

1. Nhấn **Add Channel** và chọn **Webhook**.
2. Điền URL nhận dữ liệu (ví dụ: `https://api.domain.com/alerts`).
3. DatrixOps sẽ gửi một yêu cầu HTTP POST chuẩn với định dạng JSON chứa chi tiết sự cố, mức độ nghiêm trọng, tên máy chủ và mốc thời gian.

---

## Thiết lập quy tắc cảnh báo (Alert Rules)

Truy cập **Alerts** (`/dashboard/alerts`) và nhấn **Create Alert Rule**:

### Các thông số của quy tắc
- **Tên quy tắc**: Tên mô tả rõ ràng (ví dụ: `Cảnh báo CPU Cao - Máy chủ Production`).
- **Phạm vi áp dụng (Target Scope)**: Áp dụng cho **Tất cả máy chủ**, theo **Thẻ phân loại (Tags)** hoặc cho một máy chủ cụ thể.
- **Loại chỉ số giám sát**:
  - **Tỷ lệ CPU (%)**: Kích hoạt khi mức dùng CPU vượt ngưỡng (ví dụ: `> 90%`).
  - **Bộ nhớ RAM (%)**: Kích hoạt khi tiêu hao RAM vượt ngưỡng (ví dụ: `> 90%`).
  - **Dung lượng ổ đĩa (%)**: Kích hoạt khi phân vùng ổ đĩa vượt ngưỡng (ví dụ: `> 90%`).
  - **Máy chủ Offline**: Kích hoạt khi Agent mất kết nối quá `2 phút`.
  - **Website Down**: Kích hoạt ngay khi kiểm tra HTTP bị lỗi hoặc quá thời gian phản hồi.
  - **Chứng chỉ SSL sắp hết hạn**: Kích hoạt khi thời hạn chứng chỉ còn dưới `14 ngày`.
- **Thời lượng duy trì (Duration Window)**: Khoảng thời gian chỉ số phải vượt ngưỡng liên tục trước khi phát cảnh báo (ví dụ: `3 phút`, nhằm tránh báo động giả khi CPU chỉ tăng đột biến chớp nhoáng).
- **Kênh nhận thông báo**: Chọn các kênh Telegram, Discord hoặc Email sẽ tiếp nhận cảnh báo này.

---

## Theo dõi và quản lý sự cố

Trên trang **Alerts**:
- **Tab Active Incidents**: Danh sách các sự cố hiện đang vượt ngưỡng. Thể hiện thời điểm bắt đầu, giá trị chỉ số hiện tại và máy chủ liên quan.
- **Tab Incident History**: Toàn bộ nhật ký các sự cố đã xảy ra trong quá khứ kèm thời lượng diễn ra và thời điểm khắc phục.
- **Xác nhận sự cố (Acknowledge)**: Đội ngũ vận hành có thể nhấn xác nhận để thông báo cho đồng đội biết sự cố đã có người tiếp nhận xử lý.

---

## Bước tiếp theo

- Mở shell máy chủ để kiểm tra nguyên nhân sự cố với [Web Terminal từ xa](/docs/vi/features/web-terminal).
- Xem biểu đồ lịch sử tải trong [Giám sát máy chủ & Dịch vụ](/docs/vi/features/servers).
