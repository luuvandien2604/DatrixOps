---
title: "Tài khoản và server đầu tiên"
description: "Hoàn tất setup, đăng nhập và cài Agent cho server đầu tiên."
---

## Tạo local administrator

Sau khi cài Control Plane, mở URL `/login` do installer in ra. Đăng nhập bằng
administrator đã được tự sinh và lưu tại `/opt/datrixops/.admin-credentials`
(chỉ root đọc được, mode `0600`). Public signup bị tắt mặc định.

## Thêm server

1. Mở **Servers → Add Server**.
2. Nhập tên server và chọn nền tảng.
3. Tạo server record.
4. Sao chép đúng lệnh cài Agent mà Dashboard sinh ra.
5. Chạy lệnh trên server đích bằng quyền được yêu cầu.

Lệnh chứa enrollment token ngắn hạn dành riêng cho server đó. Không đưa lệnh
vào chat công khai, ticket hỗ trợ hoặc Git.

Server có thể hiển thị **Offline** trước heartbeat đầu tiên. Nếu không chuyển
sang **Online**, xem [Cài đặt Agent](/docs/getting-started/installation) và
[Xử lý sự cố](/docs/troubleshooting/common-issues).
