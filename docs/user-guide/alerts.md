---
title: "Thiết lập cảnh báo (Alerts)"
description: "Tạo quy tắc cảnh báo theo ngưỡng CPU/RAM/Offline và kết nối kênh nhận thông báo qua Telegram hoặc Discord."
role: "public"
order: 5
---

# Thiết lập cảnh báo (Alerts)

## Bước 1 — Thêm kênh nhận thông báo

Trước khi tạo rule, bạn cần có ít nhất một kênh để nhận thông báo.

1. Vào mục **Alerts**.
2. Chọn tạo kênh mới (Channel), đặt tên gợi nhớ (ví dụ: "Kênh IT Support").
3. Chọn loại kênh:
   - **Telegram Bot** — dán Bot Token và Chat ID
   - **Discord Webhook** — dán Webhook URL
4. Lưu lại.

## Bước 2 — Tạo quy tắc cảnh báo (Alert Rule)

1. Vẫn ở mục **Alerts**, chọn tạo rule mới.
2. Đặt tên rule (ví dụ: "CPU quá tải").
3. Chọn chỉ số cần theo dõi:
   - **CPU Usage** — phần trăm sử dụng CPU
   - **RAM Usage** — phần trăm sử dụng RAM
   - **Offline** — server mất kết nối
4. Với CPU/RAM: đặt ngưỡng (threshold), ví dụ CPU > 90%.
5. Chọn server áp dụng — có thể chọn 1 server cụ thể hoặc để trống để áp dụng cho tất cả server.
6. Chọn kênh thông báo đã tạo ở Bước 1.
7. Lưu lại.

## Cách hoạt động

- Hệ thống tự động kiểm tra các rule đang bật (enabled) mỗi **1 phút**.
- Khi một chỉ số vượt ngưỡng đã đặt, thông báo sẽ được gửi tới kênh đã chọn.
- Với rule loại **Offline**, cảnh báo kích hoạt khi server không gửi dữ liệu về trong khoảng thời gian quy định.

## Xem lại lịch sử cảnh báo

Trang **Alerts** hiển thị danh sách các cảnh báo đã kích hoạt gần đây, sắp xếp theo thời gian.

## Mẹo sử dụng

- Đặt ngưỡng quá thấp có thể gây nhiễu thông báo (spam) — nên bắt đầu với ngưỡng cao (CPU > 90%) rồi điều chỉnh dần.
- Có thể tắt (disable) một rule tạm thời mà không cần xoá, nếu đang bảo trì server.
