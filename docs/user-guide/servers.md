---
title: "Quản lý Server"
description: "Xem danh sách server, theo dõi CPU/RAM, tiến trình, dịch vụ và container Docker."
role: "public"
order: 4
---

# Quản lý Server

## Xem danh sách Server

1. Vào mục **Servers** trên sidebar.
2. Danh sách hiển thị tất cả server đã cài Agent, kèm trạng thái **Online** (màu xanh) hoặc **Offline** (màu xám/đỏ).
3. Trạng thái cập nhật gần như theo thời gian thực — server chuyển Offline nếu Agent ngừng gửi dữ liệu quá 1 phút.

## Xem chi tiết một Server

1. Từ danh sách, bấm vào tên server muốn xem.
2. Trang chi tiết hiển thị 4 tab:

### Tab Tổng quan (Overview)
Biểu đồ CPU và RAM theo thời gian thực, cập nhật mỗi vài giây.

### Tab Tiến trình (Processes)
Danh sách các tiến trình đang chạy trên server, sắp xếp theo mức tiêu thụ CPU/RAM — hữu ích khi cần tìm tiến trình đang chiếm tài nguyên bất thường.

### Tab Dịch vụ (Services)
Trạng thái các service hệ thống (systemd) đang chạy trên server.

### Tab Docker
1. Danh sách toàn bộ container Docker trên server.
2. Với mỗi container, có thể:
   - **Start** — khởi động container đang dừng
   - **Stop** — dừng container đang chạy
   - **Restart** — khởi động lại container
   - **Xem Logs** — mở cửa sổ xem 100 dòng log gần nhất

> Lưu ý: thao tác Start/Stop/Restart/Logs được gửi dưới dạng lệnh tới Agent và thực thi ở lần Agent báo cáo tiếp theo — có thể mất vài giây để thấy kết quả, không phải tức thì.

## Ghi chú
- Dữ liệu CPU/RAM/Network/Disk được Agent gửi về định kỳ (mặc định mỗi 10 giây).
- Dữ liệu chi tiết (Processes/Services/Docker) chỉ được cập nhật mỗi 60 giây một lần, nên có thể có độ trễ nhất định so với biểu đồ CPU/RAM.
