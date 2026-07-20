---
title: "Xử lý sự cố"
description: "Chẩn đoán Agent offline, thiếu dữ liệu, lỗi phiên bản, update, quyền và kết nối mạng."
---

Luôn bắt đầu bằng ba dữ kiện: Agent service có chạy không, log nói gì, và host có kết nối được endpoint DatrixOps không.

## Agent không online

Linux:

```bash
sudo systemctl status datrixops-agent
sudo journalctl -u datrixops-agent -n 200 --no-pager
curl -I https://datrixops.vandien.space
```

macOS:

```bash
sudo launchctl print system/com.datrixops.agent
tail -n 200 /var/log/datrixops-agent.log
```

Windows PowerShell:

```powershell
Get-ScheduledTask -TaskName "DatrixOpsAgent"
Get-Content "C:\Program Files\DatrixOps\agent.log" -Tail 200
```

Lỗi `401` ở heartbeat thường là Agent Token không khớp, không phải JWT của trình duyệt.

## Server không xuất hiện hoặc thiếu IP

Xác nhận bạn đang ở đúng tài khoản/workspace và đã cài bằng token của server record vừa tạo. IP và inventory đến từ snapshot chi tiết, nên chờ lần snapshot tiếp theo sau heartbeat đầu tiên.

## Sai version hoặc không có thông báo update

Version ở UI phải đến từ heartbeat. Restart Agent và kiểm tra log startup. Nếu latest version sai, người quản trị cần kiểm tra `AGENT_VERSION` trong Backend đang chạy và release đã publish; rebuild frontend không phải lúc nào cũng cần chỉ để thay artifact public, nhưng container/frontend volume và cách deploy thực tế quyết định file nào đang được phục vụ.

## Update failed hoặc bị kẹt

1. Đọc trạng thái task trên Overview thay vì chỉ nhìn toast.
2. Chờ tối đa timeout của task; task stale sẽ được đánh dấu failed/timed out.
3. Tìm lỗi `manifest`, `signature`, `checksum`, `permission` hoặc restart trong Agent log.
4. Kiểm tra host truy cập được `/releases/<version>/manifest.json`, `manifest.sig` và artifact.
5. Với Agent legacy, chạy updater token-free một lần theo bài [Phiên bản và cập nhật](/docs/agent-management/updates).

## Permission denied hoặc service không khởi động

Installer cần root/Administrator. Kiểm tra owner và executable bit của binary trên Linux/macOS, sau đó xem log service. Không chạy installer lặp lại trước khi hiểu lỗi vì việc đó có thể che mất nguyên nhân ban đầu.

## Network timeout và firewall

Cho phép DNS và HTTPS outbound tới domain DatrixOps. Reverse terminal còn cần WebSocket upgrade qua reverse proxy. Kiểm tra proxy doanh nghiệp có chặn WebSocket hoặc thay chứng thư TLS hay không.

## Agent online nhưng Terminal channel disconnected

Từ bản Agent có terminal diagnostics, heartbeat gửi lỗi handshake gần nhất để Dashboard phân biệt `401`, `403`, `404/200`, `502/503`, TLS và timeout. Bạn vẫn có thể chọn **Start terminal**: Backend hub sẽ kiểm tra trạng thái kết nối thực tế thay vì UI khóa nút chỉ vì một heartbeat cũ.

Kiểm tra log Agent:

```bash
sudo journalctl -u datrixops-agent -n 200 --no-pager | grep -i terminal
```

Endpoint `/api/v1/agent/terminal` phải được reverse proxy chuyển thẳng tới Backend với `Upgrade` và `Connection` headers. `401` khi không có token là phản hồi bình thường; `200` HTML hoặc `404` cho thấy request đang rơi vào Frontend/sai upstream.

## Dữ liệu biểu đồ bị đứt

Khoảng đứt khi Agent offline là hành vi đúng: hệ thống không nối giả giữa hai điểm không có heartbeat. Nếu Agent vẫn online, kiểm tra log lỗi gửi heartbeat và thời gian hệ thống. Snapshot tiến trình/dịch vụ cập nhật chậm hơn metrics cơ bản.

## Lấy log và báo lỗi

Khi báo lỗi, cung cấp:

- OS và architecture.
- Agent version hiển thị trong log startup.
- Thời điểm xảy ra kèm timezone.
- Task state/error đã được che token.
- Đoạn log ngắn liên quan.

Không gửi Agent Token, JWT, private signing key, database URL hoặc toàn bộ file environment.
