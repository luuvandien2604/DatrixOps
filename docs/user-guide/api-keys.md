---
title: "API Keys"
description: "Tạo và quản lý API Key để tích hợp DatrixOps với công cụ bên ngoài."
role: "public"
order: 7
---

# API Keys

API Key cho phép bạn gọi REST API của DatrixOps từ bên ngoài — ví dụ từ script tự động, pipeline CI/CD, hoặc Postman — mà không cần đăng nhập bằng tài khoản.

## Tạo API Key mới

1. Vào **Manage → API**.
2. Chọn tạo Key mới (Create), đặt tên gợi nhớ (ví dụ: "CI/CD Pipeline").
3. Hệ thống sinh ra một chuỗi Key.
4. **Sao chép và lưu lại Key ngay lập tức** — đây là lần duy nhất Key được hiển thị đầy đủ, không thể xem lại sau đó.

## Sử dụng API Key

Đính kèm Key vào header `Authorization` khi gọi API, ví dụ:

```
Authorization: Bearer <api_key_của_bạn>
```

## Thu hồi (Revoke) Key

1. Vào **Manage → API**, tìm Key cần thu hồi trong danh sách.
2. Chọn **Revoke Key**.
3. Sau khi thu hồi, Key ngừng hoạt động ngay lập tức — mọi request dùng Key này sẽ bị từ chối.

## Lưu ý bảo mật

- Không chia sẻ API Key qua kênh không an toàn (chat công khai, commit vào Git...).
- Nếu nghi ngờ Key bị lộ, thu hồi ngay và tạo Key mới.
- Nên đặt tên Key theo mục đích sử dụng để dễ quản lý khi có nhiều Key.
