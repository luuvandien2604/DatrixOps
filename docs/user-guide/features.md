---
title: "Các tính năng của hệ thống"
description: "Danh sách các tính năng nổi bật của nền tảng quản trị và giám sát DatrixOps."
role: "public"
order: 3
---

# Tính năng nổi bật của DatrixOps

DatrixOps cung cấp một bộ công cụ toàn diện giúp bạn quản lý, giám sát và vận hành hạ tầng máy chủ một cách mượt mà nhất.

## 1. Giám sát phần cứng & Hệ điều hành (Hardware Metrics)
- **CPU & Load Average:** Theo dõi phần trăm sử dụng (Usage), Load Average (1m, 5m, 15m), số lượng Cores và tốc độ xung nhịp hiện tại.
- **RAM / Memory:** Mức sử dụng bộ nhớ (Used, Free, Cache, Swap).
- **Disk (Ổ cứng):** Giám sát chi tiết từng phân vùng (`/`, `/home`, `/data`), dung lượng đã dùng, IOPS, lưu lượng đọc (Read), ghi (Write).
- **Network (Mạng):** Băng thông vào/ra (Up/Down) theo từng interface mạng (eth0, ens3...).
- **Tiến trình (Processes):** Xem các tiến trình đang ngốn CPU/RAM nhất (Top Processes).

## 2. Quản lý Server Group & Tags
- Phân chia máy chủ theo từng nhóm (Ví dụ: `Production`, `Staging`, `Database`).
- Gắn thẻ (Tags) linh hoạt (`web`, `redis`, `vietnam`) để dễ dàng tìm kiếm, lọc và phân bổ chính sách cảnh báo.

## 3. Hệ thống Cảnh báo thông minh (Alerting)
- Cảnh báo tức thì khi máy chủ mất kết nối (Offline quá 1 phút).
- Tích hợp gửi thông báo về các kênh phổ biến: **Discord**, **Telegram** thông qua Webhook.
- Cho phép tùy chỉnh thiết lập cảnh báo theo từng nhóm máy chủ.

## 4. Multi-Tenant & Quản trị tập trung (SaaS Ready)
- Cấu trúc dữ liệu cách ly hoàn toàn giữa các người dùng (Data Isolation). Mỗi người dùng có một không gian làm việc (Workspace) riêng.
- Phân quyền RBAC (Role-Based Access Control) với các vai trò rõ ràng: `superadmin` (quản trị toàn hệ thống) và `user` (người dùng tiêu chuẩn).

## 5. Nhật ký truy vết (Audit Logs)
- Ghi nhận chi tiết mọi thay đổi quan trọng trên hệ thống (Tạo/Xóa máy chủ, chỉnh sửa Group/Tags, thay đổi cấu hình...).
- Giúp người quản trị truy vết ai đã thao tác gì và vào lúc nào, bảo vệ an toàn cho hệ thống.

## 6. Public REST API Keys
- Dễ dàng tạo mã truy cập (API Keys) để tích hợp DatrixOps với các công cụ bên thứ ba (CI/CD, Postman, Script tự động).
- Cơ chế bảo mật cao: Key chỉ hiển thị một lần duy nhất lúc khởi tạo và được mã hóa bảo mật trên Backend.

## 7. Giám sát dịch vụ (Service Monitoring)
- **Website & HTTP:** Ping URL định kỳ để đảm bảo website luôn hoạt động, ghi nhận độ trễ (Latency) theo thời gian thực.
- **Chứng chỉ SSL:** Tự động lấy thông tin nhà cung cấp (Issuer), phân tích ngày hết hạn và đếm ngược thời gian, giúp bạn không bao giờ quên gia hạn SSL.

## 8. Thực thi lệnh từ xa (Remote Tasks)
- Chạy các câu lệnh Bash/PowerShell trên một hoặc nhiều máy chủ cùng lúc ngay từ giao diện Web.
- Phản hồi log trả về theo thời gian thực (Real-time Console) sử dụng Server-Sent Events (SSE) / WebSocket.

## 9. Cập nhật Agent tự động
- Không cần SSH thủ công vào máy chủ để nâng cấp Agent mỗi khi có tính năng mới.
- Tính năng **Auto Update** cho phép chọn máy chủ và thực thi lệnh cập nhật từ xa một cách an toàn mà không làm mất dữ liệu giám sát.
