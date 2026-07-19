---
title: "Server và truy cập từ xa"
description: "Quản lý metadata, dịch vụ, Docker, server offline và Web Terminal một cách an toàn."
---

## Đổi tên và tổ chức server

Mở server, chỉnh metadata được giao diện hỗ trợ như tên, group, tags, provider, region hoặc environment rồi lưu. Các giá trị này thuộc server record; chúng không đổi hostname của hệ điều hành.

## Xem thông tin hệ thống

Tab **Overview** dùng snapshot và heartbeat để hiển thị OS, kernel, virtualization, uptime, phiên bản Agent, package updates và disk. Khi Agent offline, một phần thông tin gần nhất vẫn còn nhưng không được xem là dữ liệu live.

## Quản lý server offline

1. Kiểm tra thời điểm heartbeat cuối và log Agent.
2. Không bấm update/service action liên tục khi Agent chưa thể nhận task.
3. Khắc phục DNS, HTTPS outbound hoặc service Agent trên host.
4. Chỉ xóa server khi chắc chắn không cần lịch sử và token đăng ký nữa.

Xóa server sẽ xóa các bản ghi phụ thuộc theo foreign key, gồm metrics và task liên quan. Hành động này khác với gỡ binary Agent trên host.

## Dịch vụ hệ điều hành

DatrixOps dùng danh sách service Agent đã báo cáo, không nhận tên lệnh shell tùy ý. Linux dùng `systemctl`, macOS dùng `launchctl`, Windows dùng `sc.exe`. Các nút Start, Stop, Restart và Reload phụ thuộc OS; Windows không có thao tác reload tổng quát.

Agent DatrixOps được bảo vệ khỏi thao tác service để tránh tự ngắt kết nối. Điều khiển service yêu cầu Agent tối thiểu theo thông báo trên dashboard và Agent phải online.

## Docker

Khi Docker có mặt, dashboard có thể xếp hàng task start, stop, restart và lấy tối đa phần log gần nhất. Task chỉ chạy khi Agent nhận được qua heartbeat và Docker CLI có quyền truy cập daemon.

## Web Terminal

Reverse terminal dùng WebSocket outbound từ Agent tới Backend; không yêu cầu nhập SSH password/private key vào DatrixOps và không cần mở cổng SSH inbound. Người dùng phải xác nhận mở phiên; ticket là single-use, một server chỉ có một phiên active, và phiên tối đa 30 phút.

Hiện dashboard chỉ cho phép Web Terminal với Linux server phù hợp. macOS, Windows và Linux desktop/personal bị chặn theo chính sách vì Agent chạy dưới service account/root, không đại diện cho phiên desktop đang đăng nhập.

> **Warning:** Shell chạy với quyền của service Agent—thường là `root` trên Linux. Mọi lệnh có thể thay đổi hệ thống. Chỉ cấp tài khoản DatrixOps cho người vận hành được tin cậy và đóng terminal ngay khi xong.

Nếu thấy `AGENT_UNAVAILABLE`, kiểm tra Agent online, phiên bản tối thiểu, trạng thái terminal channel và reverse-proxy WebSocket. Xem thêm [Xử lý sự cố](/docs/troubleshooting/common-issues).

