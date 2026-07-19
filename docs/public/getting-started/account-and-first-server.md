---
title: "Tài khoản và server đầu tiên"
description: "Đăng ký, đăng nhập, tạo server và chuẩn bị lệnh cài Agent an toàn."
---

Mục tiêu của hướng dẫn này là tạo một server record và nhận lệnh cài đặt dành riêng cho máy đó.

## Điều kiện cần

- Có quyền truy cập trang DatrixOps.
- Có quyền quản trị trên máy sẽ cài Agent.
- Máy cho phép kết nối HTTPS outbound tới `datrixops.vandien.space`.

## Tạo tài khoản và đăng nhập

1. Mở trang **Register**, nhập email và mật khẩu rồi hoàn tất đăng ký.
2. Mở **Login** và đăng nhập bằng tài khoản vừa tạo.
3. Sau khi dashboard xuất hiện, mở **Servers**.

Phiên web dùng access token và refresh token. Nếu phiên hết hạn, API client sẽ thử refresh trước khi yêu cầu đăng nhập lại.

## Thêm server

1. Chọn **+ Add Server**.
2. Nhập tên dễ nhận biết, ví dụ `api-production-01`.
3. Chọn nền tảng Linux, macOS hoặc Windows.
4. Xác nhận để tạo server.
5. Sao chép đúng lệnh cài đặt dashboard sinh ra.

Lệnh chứa Agent Token duy nhất. Không gửi lệnh đó vào chat công khai, ticket hỗ trợ hoặc commit vào Git.

> **Warning:** Ví dụ trong tài liệu dùng `<AGENT_TOKEN>`. Luôn dùng token do dashboard cấp cho server của bạn; không tự tạo hoặc tái sử dụng token của server khác.

## Kết quả mong đợi

Trước khi cài Agent, server có thể hiển thị **Offline**. Sau khi cài thành công, heartbeat đầu tiên thường làm trạng thái đổi sang **Online** trong một khoảng ngắn. Danh sách server sẽ bắt đầu có IP, hệ điều hành và số liệu tài nguyên.

Nếu server không online, tiếp tục với [Cài đặt Agent](/docs/getting-started/installation) và [Xử lý sự cố](/docs/troubleshooting/common-issues).

