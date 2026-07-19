---
title: "DatrixOps là gì?"
description: "Kiến trúc, thành phần, nền tảng hỗ trợ và yêu cầu để bắt đầu giám sát hạ tầng với DatrixOps."
---

DatrixOps là control plane giám sát và vận hành server. Thay vì đăng nhập từng máy để xem tài nguyên, bạn theo dõi CPU, bộ nhớ, disk, network, tiến trình, dịch vụ và Docker từ một dashboard thống nhất.

## DatrixOps giải quyết vấn đề gì?

- Nhìn nhanh máy nào đang online hoặc đã mất heartbeat.
- Theo dõi telemetry theo thời gian và giữ khoảng trống khi Agent offline.
- Xem inventory, tiến trình, dịch vụ hệ điều hành và container từ xa.
- Tạo cảnh báo CPU, bộ nhớ hoặc offline và gửi qua Telegram/Discord.
- Theo dõi website, trạng thái HTTPS và thời hạn chứng thư.
- Phân phối bản Agent mới từ control plane sau khi người vận hành xác nhận.

## Các thành phần chính

| Thành phần | Trách nhiệm |
|---|---|
| Dashboard | Giao diện web để xem dữ liệu và gửi thao tác đã được cho phép. |
| Backend API | Xác thực, nhận heartbeat, lưu dữ liệu, xếp hàng task và chạy scheduler. |
| PostgreSQL | Lưu server, metrics, task, alert, website và audit data. |
| Agent | Binary Go chạy trên máy cần giám sát, chủ động kết nối ra Backend. |

Agent gửi heartbeat định kỳ qua HTTPS. Backend trả về những task đang chờ; Agent kiểm tra và thực hiện task phù hợp. Vì Agent chủ động kết nối ra ngoài, việc giám sát cơ bản không yêu cầu mở cổng inbound trên máy được quản lý.

> **Important:** DatrixOps Agent cần một Agent Token riêng cho từng server. Token này xác định server khi gửi heartbeat và phải được bảo vệ như mật khẩu.

## Nền tảng Agent hỗ trợ

Release hiện tại tạo artifact cho:

- Linux `amd64` và `arm64`.
- macOS Intel (`amd64`) và Apple Silicon (`arm64`).
- Windows `amd64`.

Các chức năng phụ thuộc hệ điều hành. Linux dùng systemd, macOS dùng launchd và Windows dùng Service Control Manager. Web Terminal chỉ được dashboard bật cho Linux server phù hợp; macOS, Windows và máy Linux desktop/personal bị khóa theo chính sách an toàn hiện tại.

## Yêu cầu hệ thống

Máy cài Agent cần:

1. Kết nối HTTPS outbound tới DatrixOps.
2. Quyền `root` trên Linux/macOS hoặc Administrator trên Windows để cài service.
3. Một kiến trúc CPU nằm trong danh sách hỗ trợ.
4. Đồng hồ hệ thống chính xác để TLS và dữ liệu thời gian hoạt động đúng.

Dashboard cần trình duyệt hiện đại có JavaScript và local storage. Docker chỉ xuất hiện khi Docker CLI/daemon có trên Agent. Dữ liệu dịch vụ phụ thuộc service manager gốc của hệ điều hành.

> **Note:** Network, Performance, Security và Logs vẫn có những khu vực đang phát triển. Tài liệu public không xem các màn hình placeholder là tính năng đã hoàn thành.

