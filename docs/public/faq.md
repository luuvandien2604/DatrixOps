---
title: "Câu hỏi thường gặp"
description: "Giải đáp theo các chức năng đã tồn tại trong source DatrixOps."
---

## DatrixOps có cần mở cổng SSH không?

Không cho việc gửi metrics hoặc dùng Web Terminal. Agent chủ động kết nối HTTPS/WSS outbound; DatrixOps không cần lưu SSH password/private key và không yêu cầu mở cổng 22 inbound. SSH vẫn nên được giữ như kênh cứu hộ khi Agent hoặc control plane không hoạt động. Web Terminal hiện được ưu tiên cho Linux headless/server.

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

Có khi bạn chọn **Uninstall Agent & Delete** trên một Linux Agent đang online và báo hỗ trợ remote uninstall. Backend giữ server record, Agent chạy helper gỡ service/binary, rồi Backend chỉ xóa record sau khi nhận xác nhận hoàn tất.

**Delete Record Only** chỉ xóa dữ liệu DatrixOps và có thể để lại Agent trên máy. Tùy chọn này dành cho máy đã mất, Agent offline, hệ điều hành chưa hỗ trợ hoặc trường hợp cần recovery. Xem [Gỡ Agent và xóa server](/docs/server-management/delete-server).


## Vì sao Web Terminal báo `can't access tty`?

Shell đã nối vào PTY nhưng chưa có controlling terminal đúng chuẩn. Chạy `tty` và `ps -o pid,ppid,sid,pgid,tpgid,tty,stat,cmd -p $$`; nếu `TT` là `?` hoặc `TPGID=-1`, cập nhật Agent lên bản có PTY Linux hoàn chỉnh. Xem [Web Terminal](/docs/server-management/web-terminal).

## DatrixOps có thay thế Prometheus hoặc SIEM không?

Không nên giả định như vậy. DatrixOps hiện tập trung vào fleet monitoring, task vận hành, alert cơ bản, website/SSL và Agent lifecycle. Một số màn hình Network, Performance, Security và Logs còn đang phát triển.

