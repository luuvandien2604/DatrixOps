---
title: "Câu hỏi thường gặp"
description: "Giải đáp theo các chức năng đã tồn tại trong source DatrixOps."
---

## DatrixOps có cần mở cổng SSH không?

Không cho việc gửi metrics. Agent chủ động kết nối HTTPS outbound. Web Terminal dùng reverse WebSocket và không yêu cầu lưu SSH credential, nhưng hiện chỉ được UI bật cho Linux server phù hợp.

## Agent hỗ trợ hệ điều hành nào?

Linux amd64/arm64, macOS Intel/Apple Silicon và Windows amd64 có artifact release. Dịch vụ, cron, Docker và terminal có mức hỗ trợ khác nhau theo OS.

## Bao lâu dữ liệu cập nhật một lần?

Heartbeat dùng interval cấu hình của Agent; snapshot tiến trình, dịch vụ và Docker khoảng mỗi 60 giây. Task remote được nhận qua heartbeat nên có độ trễ theo mô hình poll.

## Vì sao biểu đồ có khoảng trống?

Khoảng trống cho biết không có metric trong thời gian đó, thường do Agent offline hoặc heartbeat lỗi. DatrixOps không nội suy để biến khoảng mất dữ liệu thành đường liên tục giả.

## Bấm update có nghĩa là đã cập nhật xong chưa?

Không. Queued hoặc claimed chỉ cho biết task đã được tạo/nhận. Thành công chỉ được xác nhận khi Agent restart và heartbeat báo đúng target version.

## Update all agents có dùng chung token không?

Không. Backend tạo task trên từng server record; mỗi Agent vẫn xác thực bằng token hiện có của chính nó.

## Có tự rollback Agent không?

Chưa hoàn chỉnh. Update xác minh artifact trước khi thay binary và service manager cố khởi động lại, nhưng chưa có watchdog rollback đầy đủ khi bản mới không heartbeat. Người vận hành cần giữ release cũ và kế hoạch phục hồi thủ công.

## Xóa server có gỡ Agent khỏi máy không?

Không. Xóa record và gỡ service trên host là hai thao tác riêng. Gỡ service theo [Cài đặt Agent](/docs/getting-started/installation) trước hoặc sau tùy quy trình của bạn.

## DatrixOps có thay thế Prometheus hoặc SIEM không?

Không nên giả định như vậy. DatrixOps hiện tập trung vào fleet monitoring, task vận hành, alert cơ bản, website/SSL và Agent lifecycle. Một số màn hình Network, Performance, Security và Logs còn đang phát triển.

