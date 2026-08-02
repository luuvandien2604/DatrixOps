---
title: "Quản lý server"
description: "Quản lý metadata, thông tin hệ thống, dịch vụ, Docker và server offline."
---

## Đổi tên và tổ chức server

Mở server, chỉnh các metadata được giao diện hỗ trợ như tên, group, tags, provider, region hoặc environment rồi lưu. Những giá trị này thuộc server record trong DatrixOps; chúng không thay đổi hostname của hệ điều hành.

## Xem thông tin hệ thống

Tab **Overview** dùng heartbeat và snapshot gần nhất để hiển thị OS, kernel, virtualization, uptime, phiên bản Agent, package updates và disk. Khi Agent offline, một phần thông tin cuối cùng vẫn được hiển thị nhưng không được xem là dữ liệu live.

## Quản lý server offline

1. Kiểm tra thời điểm heartbeat cuối và log Agent.
2. Không bấm update, restart hoặc service action liên tục khi Agent chưa thể nhận task.
3. Khắc phục DNS, HTTPS outbound, Agent Token hoặc service Agent trên host.
4. Chỉ force delete record khi máy đã mất, không còn truy cập được hoặc bạn chấp nhận tự gỡ Agent thủ công.

> **Important:** Với Linux Agent online có hỗ trợ remote uninstall, nút xóa sẽ gửi task gỡ Agent trước và chỉ xóa server record sau khi helper xác nhận hoàn tất. Xem [Gỡ Agent và xóa server](/docs/server-management/delete-server).

## Dịch vụ hệ điều hành

DatrixOps dùng danh sách service Agent đã báo cáo, không nhận tên lệnh shell tùy ý. Linux dùng `systemctl`, macOS dùng `launchctl`, Windows dùng `sc.exe`. Các nút Start, Stop, Restart và Reload phụ thuộc OS; Windows không có thao tác reload tổng quát.

Agent DatrixOps được bảo vệ khỏi thao tác service thông thường để tránh tự ngắt kết nối. Điều khiển service yêu cầu Agent đạt phiên bản tối thiểu theo thông báo trên dashboard và Agent phải online.

## Docker

Khi Docker có mặt, dashboard có thể xếp hàng task start, stop, restart và lấy phần log gần nhất. Task chỉ chạy khi Agent nhận được qua heartbeat và Docker CLI có quyền truy cập Docker daemon.

## Truy cập dòng lệnh từ xa

Web Terminal là tính năng riêng dành trước tiên cho Linux headless/server. Nó không dùng SSH và không cần mở cổng 22 inbound. Xem hướng dẫn, giới hạn và xử lý lỗi tại [Web Terminal](/docs/server-management/web-terminal).
