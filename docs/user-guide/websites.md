---
title: "Giám sát Website & SSL"
description: "Theo dõi uptime và hạn sử dụng chứng chỉ SSL của các website."
role: "public"
order: 6
---

# Giám sát Website & SSL

## Thêm Website mới

1. Vào mục **Websites**.
2. Chọn thêm mới, đặt tên gợi nhớ (ví dụ: "Trang chủ Cty").
3. Nhập URL đầy đủ (bao gồm `https://`).
4. Chọn chu kỳ kiểm tra (Interval) — hệ thống sẽ tự động ping URL theo chu kỳ này.
5. Lưu lại.

## Theo dõi trạng thái

Sau khi thêm, hệ thống tự động:

- **Kiểm tra Uptime** — ping URL định kỳ, ghi nhận trạng thái hoạt động (online/lỗi).
- **Kiểm tra SSL** — đọc thông tin chứng chỉ SSL của website, hiển thị số ngày còn lại trước khi hết hạn.

## Đọc kết quả

Trên danh sách Website, mỗi mục hiển thị:

- Trạng thái hiện tại (đang hoạt động / gặp lỗi)
- Số ngày còn lại của chứng chỉ SSL
- Thời điểm kiểm tra gần nhất

## Xoá Website

Chọn website cần xoá trong danh sách và chọn hành động xoá — thao tác này chỉ dừng theo dõi, không ảnh hưởng gì tới website thật.

## Mẹo sử dụng

- Kết hợp với [Alerts](/docs/alerts) để nhận thông báo khi website die hoặc SSL sắp hết hạn (nếu tính năng cảnh báo cho Website đã được kết nối).
- Chu kỳ kiểm tra quá ngắn (vài giây) có thể không cần thiết với website ít thay đổi — nên đặt từ vài phút trở lên.
