---
title: "Các tính năng của hệ thống"
description: "Danh sách các tính năng giám sát nổi bật của DatrixOps."
role: "public"
order: 3
---

# Tính năng nổi bật

Hệ thống DatrixOps chia các tính năng thành nhiều nhóm để bạn dễ dàng quản lý.

## 1. Giám sát phần cứng (Hardware Metrics)
- **CPU:** Theo dõi phần trăm sử dụng (Usage), Load Average (1m, 5m, 15m), số lượng Cores và tốc độ xung nhịp hiện tại.
- **RAM / Memory:** Mức sử dụng bộ nhớ (Used, Free, Cache, Swap).
- **Disk (Ổ cứng):** Giám sát chi tiết từng phân vùng (`/`, `/home`, `/data`), dung lượng đã dùng, IOPS, lưu lượng đọc (Read), ghi (Write).
- **Network (Mạng):** Băng thông vào/ra (Up/Down) theo từng interface mạng (eth0, ens3...).

## 2. Giám sát dịch vụ (Service Monitoring)
- **Website & HTTP:** Ping URL để đảm bảo website luôn hoạt động, ghi nhận độ trễ (Latency) theo thời gian thực.
- **Chứng chỉ SSL:** Tự động lấy thông tin nhà cung cấp (Issuer), ngày hết hạn và đếm ngược, giúp bạn không bao giờ quên gia hạn SSL.
- **Dịch vụ hệ thống:** (Đang triển khai) Theo dõi trạng thái Nginx, MySQL, Docker, Redis...

## 3. Hệ thống biểu đồ
- Toàn bộ dữ liệu thu thập được lưu trữ lại dưới dạng chuỗi thời gian (time-series).
- Bạn có thể xem lại dữ liệu theo nhiều khung giờ: 1 phút, 5 phút, 1 giờ, 24 giờ, 7 ngày.

## 4. Cập nhật Agent tự động
- Không cần phải SSH vào máy chủ để nâng cấp Agent mỗi khi có tính năng mới.
- Tính năng **Auto Update** sẽ nhận biết phiên bản mới và chỉ định máy chủ tải về, khởi động lại một cách an toàn mà không làm mất dữ liệu giám sát.
