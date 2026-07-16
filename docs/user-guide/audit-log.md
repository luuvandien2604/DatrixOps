---
title: "Nhật ký truy vết (Audit Log)"
description: "Xem lại lịch sử các thao tác quan trọng đã thực hiện trên hệ thống."
role: "public"
order: 8
---

# Nhật ký truy vết (Audit Log)

Audit Log ghi lại các thao tác quan trọng trên hệ thống — phục vụ truy vết khi cần kiểm tra ai đã làm gì, vào lúc nào.

## Xem Audit Log

1. Vào **Manage → Audit**.
2. Danh sách hiển thị các sự kiện gần nhất, sắp xếp theo thời gian giảm dần (mới nhất lên trên).
3. Mỗi mục ghi nhận:
   - Người thực hiện
   - Hành động (ví dụ: tạo server, xoá API Key, đổi cấu hình alert)
   - Thời điểm thực hiện

## Khi nào nên kiểm tra Audit Log

- Khi có thay đổi bất ngờ trên hệ thống mà không rõ nguyên nhân.
- Khi cần xác nhận lại thao tác quản trị đã thực hiện đúng chưa.
- Khi làm việc nhóm nhiều người cùng có quyền truy cập dashboard.
