# Feature Spec: Server Module

## 1. Mục tiêu
Cho phép Admin quản lý (thêm, sửa, xóa, liệt kê) các Server (VPS/Cloud) cần theo dõi, đồng thời tự động cấp phát `agent_token` cho từng server.

## 2. Đặc điểm kỹ thuật
- **Agent Token Generation**:
  - Khi tạo một server mới, Backend tự động sinh ra một chuỗi `agent_token` ngẫu nhiên (dạng UUID hoặc chuỗi Base64/Hex).
  - Chuỗi `agent_token` này đại diện cho Server. Agent nào có token này sẽ gửi được metrics vào hệ thống với danh nghĩa của server đó.
  - Token chỉ được hiển thị ở Frontend **1 lần duy nhất** ngay sau khi gọi API tạo server thành công (để tránh rủi ro lộ token nếu bị xem trộm dashboard).
- **Trạng thái Server (Status)**:
  - Default khi mới tạo: `offline`.
  - Nếu trường `updated_at` (cập nhật thông qua heartbeat của Agent) cách thời điểm hiện tại `< 3 phút` (hoặc tùy cấu hình), thì coi như `online`. (Note: Việc set `online`/`offline` có thể được tính real-time trên query hoặc bằng Scheduler). Cho MVP, ta tính dựa trên field status và cập nhật qua heartbeat, hoặc Frontend có thể tự tính từ `updated_at`.
- **Bảo mật**: Toàn bộ API của module này yêu cầu xác thực qua header `Authorization: Bearer <jwt_access_token>`.

## 3. Database Changes
Bảng `servers`:
- id (UUID)
- user_id (UUID, khóa ngoại tham chiếu users)
- name (Tên định danh)
- ip_address (Địa chỉ IP của server)
- agent_token (Token xác thực)
- status (Trạng thái)
- os_info (Cấu hình OS, kiểu JSONB)
- created_at, updated_at

## 4. API Endpoints
Yêu cầu Auth (JWT):
- `GET /api/v1/servers` (List servers)
- `POST /api/v1/servers` (Create server, returns agent_token)
- `DELETE /api/v1/servers/{id}` (Delete server)

## 5. Middleware Auth
Tạo middleware xác thực JWT cho tất cả API cần bảo mật. Middleware này sẽ kiểm tra tính hợp lệ của token và đưa `user_id` vào Context.
