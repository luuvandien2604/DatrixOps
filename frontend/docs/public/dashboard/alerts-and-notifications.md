---
title: "Cảnh báo & Kênh thông báo"
description: "Cấu hình trung tâm cảnh báo (Alert Center), kênh Discord, Telegram, Email và xử lý sự cố hạ tầng."
---

**Alert Center** của DatrixOps cho phép bạn theo dõi sự cố máy chủ theo thời gian thực và tự động phát thông báo đa kênh (Discord, Telegram, Email) ngay khi tài nguyên vượt ngưỡng hoặc hệ thống gặp sự cố mạng.

---

## 1. Cấu hình các kênh thông báo (Notification Channels)

Truy cập **Dashboard → Alerts → Notification Channels** để thiết lập nơi nhận thông báo:

### 📢 Discord Webhook
1. Trong kênh Discord của bạn, vào **Channel Settings → Integrations → Webhooks → New Webhook**.
2. Sao chép **Webhook URL** (dạng `https://discord.com/api/webhooks/...`).
3. Dán Webhook URL vào form tạo kênh trên DatrixOps và đặt tên gợi nhớ.
4. Bấm **Gửi thử nghiệm** để kiểm tra tin nhắn bot gửi về Discord.

### 📱 Telegram Bot
1. Tạo bot thông qua **@BotFather** trên Telegram để nhận **Bot Token** (dạng `123456789:ABCdefGHI...`).
2. Mời bot vào nhóm chat hoặc mở chat riêng với bot và gõ `/start`.
3. Lấy **Chat ID** của nhóm hoặc cá nhân (có thể thông qua `@userinfobot` hoặc API getUpdates).
4. Nhập Bot Token và Chat ID vào DatrixOps và gửi tin nhắn kiểm tra.

### 📧 SMTP Email
1. Cấu hình thông số máy chủ gửi thư SMTP:
   - **SMTP Host & Port:** (Ví dụ `smtp.gmail.com:587` hoặc cổng `465` SSL).
   - **Tài khoản / Mật khẩu ứng dụng (App Password):** Mật khẩu riêng cho dịch vụ gửi mail.
   - **Người gửi (From Address) & Người nhận (To Address):** Địa chỉ email thông báo sự cố.
2. Kiểm tra kết nối gửi email test.

---

## 2. Thiết lập quy tắc cảnh báo (Alert Rules)

Truy cập **Dashboard → Alerts → Alert Rules** để thiết lập điều kiện kích hoạt:

| Loại cảnh báo | Điều kiện kiểm tra | Ý nghĩa |
| :--- | :--- | :--- |
| **CPU High Usage** | `CPU > X%` trong $N$ chu kỳ | Phát hiện tiến trình treo, quá tải xử lý |
| **Memory Low** | `RAM > X%` trong $N$ chu kỳ | Nguy cơ tràn bộ nhớ và kích hoạt OOM Killer |
| **Disk Space Full** | `Disk Usage > X%` | Cảnh báo ổ cứng sắp đầy để kịp thời dọn dẹp |
| **Server Heartbeat Offline** | Không nhận heartbeat quá 60s - 120s | Server mất kết nối mạng, tắt nguồn hoặc sập nguồn |
| **Network Degradation** | `Latency > Warning/Critical` hoặc `Packet Loss > 20%` | Chất lượng đường truyền suy giảm nghiêm trọng |

---

## 3. Vòng đời sự cố (Incidents Lifecycle) & Auto-Resolve

- **Kích hoạt sự cố (Triggered):**
  Khi điều kiện của một rule bị vi phạm, **Worker** ghi nhận sự cố mới và ngay lập tức gửi cảnh báo đến các kênh đã liên kết kèm đầy đủ thông tin: tên server, thông số đo được, thời điểm phát hiện.
- **Tự động phục hồi (Auto-Resolve):**
  Khi các chỉ số trở lại mức an toàn, hệ thống tự động đánh dấu sự cố là **Resolved** và gửi một thông báo xanh báo tin hệ thống đã hoạt động bình thường trở lại, giúp đội ngũ vận hành không cần vào xác nhận thủ công.
