---
title: "Phiên bản và cập nhật Agent"
description: "Kiểm tra phiên bản, cập nhật một hoặc nhiều Agent và hiểu trạng thái xác nhận heartbeat."
---

Phiên bản hiển thị ở header và **Running Agent Version** đến từ heartbeat của binary đang chạy. Đây là nguồn xác nhận cuối cùng—không phải việc task đã được nhận hay file mới đã tải xong.

## Thông báo Update available

Backend đọc `AGENT_VERSION` làm phiên bản release hiện hành và so sánh với phiên bản Agent báo cáo. Khi khác phiên bản, frontend hiển thị **Update available**. Backend và release artifact phải cùng version. Publisher production phải đưa signed release ra public HTTPS và xác minh lại trước khi đổi `AGENT_VERSION`, nhờ đó Agent không thể nhận task trỏ tới release mà Frontend chưa phục vụ.

## Cập nhật một Agent

1. Mở **Servers** rồi chọn server.
2. Chọn **Update available** hoặc nút update trong Overview.
3. Xác nhận thao tác.
4. Theo dõi trạng thái queued → claimed/processing → chờ restart → confirmed hoặc failed/timed out.
5. Chỉ xem là thành công khi heartbeat mới báo đúng target version.

Nút update phải giữ trạng thái từ task lưu trong Backend, nên refresh hoặc chuyển trang không làm mất tiến trình thực.

## Tự động cập nhật

Mở **Overview** của server và bật **Automatic Agent updates**. Chính sách này được lưu riêng cho từng Agent và mặc định tắt; yêu cầu Agent 1.3.0 trở lên. Khi heartbeat của Agent đã bật chính sách báo phiên bản cũ hơn, Backend tạo cùng loại signed `agent_update` task đang dùng cho quy trình thủ công.

Khi tắt, Backend hủy các automatic task vẫn còn queued. Task đã được Agent nhận sẽ không bị ngắt giữa chừng vì có thể làm hỏng quá trình thay binary. Nếu một target release thất bại, lần thử tự động kế tiếp được giới hạn sau một giờ; người vận hành vẫn có thể retry thủ công.

Tự động cập nhật không bỏ qua bất kỳ bước kiểm tra manifest signature, SHA-256, định dạng executable, version marker, restart hoặc heartbeat confirmation nào.

## Update all agents

Ở danh sách **Servers**, chọn **Update all agents**. Backend tạo task riêng cho từng Agent cần update và tránh tạo hai update active cho cùng server. Agent offline chỉ có thể nhận task khi kết nối lại, miễn task chưa hết hạn.

> **Important:** Không đóng gói token vào task update. Agent dùng service configuration hiện có và tải artifact release dành cho đúng OS/architecture.

## Quy trình xác minh

Với Agent nhận payload update mới, quy trình hiện tại là:

1. Backend gắn `target_version` và release base URL vào task.
2. Agent tải `manifest.json` và `manifest.sig`.
3. Agent xác minh chữ ký Ed25519 bằng public key được nhúng.
4. Agent kiểm tra schema manifest và chọn artifact đúng `GOOS/GOARCH`.
5. Agent tải binary, kiểm tra size, SHA-256, định dạng executable và version marker.
6. Agent thay/stage binary rồi yêu cầu systemd, launchd hoặc Scheduled Task restart.
7. Backend giữ task ở trạng thái processing cho đến khi heartbeat báo target version.

## Yêu cầu tối thiểu và Agent cũ

Các Agent rất cũ không hiểu đầy đủ response envelope hoặc updater mới. Dashboard có thể yêu cầu cập nhật thủ công một lần:

Linux/macOS:

```bash
curl -fsSL https://datrixops.vandien.space/update-agent.sh | sudo sh
```

Windows PowerShell Administrator:

```powershell
irm https://datrixops.vandien.space/update-agent.ps1 | iex
```

Script này giữ Agent Token và service configuration hiện tại, nhưng updater thủ công tương thích installer chỉ kiểm tra định dạng executable; chuỗi signed-manifest đầy đủ nằm trong self-update của Agent mới.

## Khi update thất bại

- Mở task state trên Overview và đọc thông báo failed/timed out.
- Kiểm tra Agent log để thấy lỗi manifest, signature, checksum, permission hoặc restart.
- Xác nhận release URL trả đúng target version và Backend `AGENT_VERSION` trùng release.
- Nếu mọi hệ điều hành cùng update thất bại, kiểm tra `/releases/<VERSION>/manifest.json` và `manifest.sig` có được Frontend container hiện tại phục vụ hay không. Sau khi triển khai runtime mount `frontend/public`, cần recreate Frontend một lần.
- Đảm bảo service manager có chính sách tự khởi động lại Agent.

> **Warning:** Source hiện chưa có rollback tự động hoàn chỉnh sau khi binary mới không gửi heartbeat. Giữ release cũ bất biến và chuẩn bị thay binary thủ công nếu bản mới không thể khởi động. Không ghi đè cùng một version bằng binary khác.
