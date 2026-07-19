---
title: "Đọc Dashboard"
description: "Hiểu trạng thái server và các chỉ số CPU, RAM, disk, network trên DatrixOps."
---

Dashboard tổng hợp heartbeat thật từ Agent và dữ liệu lưu trong PostgreSQL. Không có Agent hoặc heartbeat mới thì DatrixOps không tạo số liệu giả.

## Trạng thái server

- **Online:** Backend vừa nhận heartbeat trong cửa sổ trạng thái hiện hành.
- **Offline:** Không còn heartbeat đủ mới. Dữ liệu lịch sử vẫn được giữ.
- **Degraded:** Hiện chưa phải trạng thái server chuẩn hóa trong backend. Cảnh báo tài nguyên và sự cố từng chức năng được thể hiện riêng; không nên diễn giải **Online** là mọi dịch vụ đều khỏe.

Các khoảng Agent offline phải xuất hiện như khoảng thiếu metrics trên biểu đồ. Timeline vẫn tiến theo thời gian thực để bạn nhìn thấy chính xác lúc dữ liệu dừng và quay lại.

## CPU, RAM, disk và network

| Chỉ số | Cách đọc |
|---|---|
| CPU | Phần trăm CPU toàn hệ thống tại heartbeat. Spike ngắn cần được đánh giá cùng xu hướng. |
| RAM | Bộ nhớ đang dùng so với tổng bộ nhớ Agent báo cáo. |
| Disk | Dung lượng system disk đã dùng; khác với Disk I/O theo thời gian. |
| Network | Số byte vào/ra hoặc throughput được suy ra từ các mẫu liên tiếp. |
| Disk I/O | Hoạt động đọc/ghi, không phải phần trăm dung lượng. |

> **Note:** Một điểm dữ liệu bằng `0` và một khoảng không có dữ liệu mang ý nghĩa khác nhau. Khoảng trống cho biết không có metrics; `0` là giá trị Agent thực sự báo cáo.

## Danh sách server

Trang **Servers** hiển thị tên, IP tốt nhất đã biết, OS/CPU, CPU, RAM, disk, trạng thái và quick actions. Nhấn vào thẻ/hàng server để mở chi tiết. IP được giữ từ snapshot gần nhất nên vẫn có thể xuất hiện khi Agent offline.

## Trang chi tiết server

- **Overview:** OS, phiên bản Agent, kernel, virtualization, uptime, package updates và system disk.
- **Inventory:** dữ liệu phần cứng/phần mềm Agent đã thu thập.
- **Cron Monitoring:** có trên nền tảng được hỗ trợ.
- **Processes:** tổng CPU/RAM và nhóm tiến trình tiêu thụ cao.
- **System/Windows/Launch Services:** service manager theo OS.
- **Docker/Containers:** trạng thái và thao tác container nếu Docker khả dụng.
- **Terminal:** reverse terminal theo điều kiện an toàn của server.

## Dữ liệu cập nhật khi nào?

Agent gửi heartbeat theo `DATRIXOPS_INTERVAL`; installer hiện không đặt biến này nên dùng mặc định trong Agent. Snapshot chi tiết được gửi khoảng mỗi 60 giây. Task remote được Agent nhận theo mô hình poll qua heartbeat, vì vậy không phải mọi thao tác đều phản hồi ngay lập tức.

