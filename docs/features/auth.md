# Feature Spec: Authentication Module

## 1. Mục tiêu
Cung cấp cơ chế xác thực cho người quản trị (Admin) truy cập vào Next.js Dashboard. Bảo vệ các API liên quan đến quản lý server và hệ thống.

## 2. Đặc điểm kỹ thuật
- **Single User Constraint**: DatrixOps chỉ phục vụ 1 tài khoản duy nhất. Khi bảng `users` đã có dữ liệu, mọi nỗ lực gọi API `/register` đều bị từ chối với HTTP 403 Forbidden.
- **Bảo mật mật khẩu**: Sử dụng `bcrypt` (cost mặc định 10) để mã hóa mật khẩu trước khi lưu.
- **Authentication Flow**:
  - Dùng **JWT (JSON Web Token)** cho Access Token, thời hạn sống ngắn (15 phút). Access Token được gửi kèm header `Authorization: Bearer <token>` từ Frontend.
  - Dùng **Opaque Token** (chuỗi ngẫu nhiên, ví dụ: sinh từ crypto/rand hoặc UUID) cho Refresh Token, thời hạn sống dài (7 ngày), lưu vào DB.
- **Logout**: Thu hồi Refresh Token (xóa khỏi bảng `refresh_tokens`).

## 3. Database Changes (Migration)
Tạo bảng `users` và `refresh_tokens`. Xem chi tiết trong schema.

## 4. API Endpoints
- `POST /api/v1/auth/register` (Tạo tài khoản đầu tiên)
- `POST /api/v1/auth/login` (Đăng nhập, cấp Access + Refresh Token)
- `POST /api/v1/auth/refresh` (Cấp lại Access Token mới)
- `POST /api/v1/auth/logout` (Thu hồi Refresh Token, yêu cầu Auth)

## 5. Cấu hình hệ thống (Config)
- Yêu cầu cấu hình biến môi trường `JWT_SECRET` trên Server. Nếu chạy ở môi trường development mà không có, log warning và dùng secret mặc định.
