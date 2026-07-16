---
title: "Tổng quan Dashboard"
description: "Làm quen với giao diện chính của DatrixOps trước khi đi sâu vào từng tính năng."
role: "public"
order: 3
---

# Tổng quan Dashboard

> Trang này giúp bạn định vị nhanh các khu vực chính trên giao diện trước khi đọc hướng dẫn chi tiết từng tính năng. (Ảnh chụp màn hình sẽ được bổ sung sau.)

## Bố cục chung

Giao diện DatrixOps gồm 3 vùng chính:

1. **Thanh điều hướng trái (Sidebar)** — menu chính, luôn hiển thị, gồm các mục: Dashboard, Servers, Alerts, Websites, Manage (API, Audit).
2. **Thanh trên cùng (Top bar)** — tên trang hiện tại, avatar tài khoản, nút đăng xuất.
3. **Khu vực nội dung chính** — thay đổi theo mục bạn chọn ở sidebar.

## Trang chủ (Dashboard)

Là trang đầu tiên sau khi đăng nhập, hiển thị:

- **Total Servers** — tổng số server đã kết nối Agent.
- **Online / Offline** — số lượng server đang hoạt động và mất kết nối.
- **Alerts Feed** — danh sách cảnh báo mới nhất, sắp xếp theo thời gian gần nhất lên trên.

## Sidebar — các mục chính

| Mục | Mô tả ngắn |
|---|---|
| **Dashboard** | Trang tổng quan (như trên) |
| **Servers** | Danh sách và chi tiết từng máy chủ đang giám sát |
| **Alerts** | Thiết lập quy tắc cảnh báo và kênh nhận thông báo |
| **Websites** | Giám sát uptime và SSL cho các website |
| **Manage → API** | Quản lý API Key tích hợp bên ngoài |
| **Manage → Audit** | Xem lịch sử thao tác trên hệ thống |

> Một số mục khác trong sidebar (Network, Performance, Security, Logs, Manage → Backup/Config/Users/Servers) hiện đang **trong quá trình phát triển**, chưa có chức năng sử dụng được.

## Bước tiếp theo

- Chưa cài Agent? Xem [Hướng dẫn cài đặt Agent](/docs/agent-installation).
- Đã có server? Xem [Quản lý Server](/docs/servers) để biết cách xem chi tiết CPU, RAM, Docker...
