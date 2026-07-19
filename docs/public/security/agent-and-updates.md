---
title: "Kết nối và signed updates"
description: "Hiểu cách Agent xác thực, cách release được ký và những trách nhiệm bảo mật của người dùng."
---

## Kết nối Agent–Server

Agent chủ động gửi heartbeat tới `/api/v1/agent/heartbeat` qua HTTPS và đặt Agent Token trong `Authorization: Bearer …`. Backend so token với server record. Đây là cơ chế khác với JWT dùng cho phiên web.

Không cần mở cổng inbound để gửi metrics. Reverse terminal cũng bắt đầu bằng WebSocket outbound từ Agent, nhưng shell chỉ mở sau khi Backend chấp nhận ticket của người dùng đã xác thực.

## Signed Agent Updates

Release mới có manifest mô tả version, thời điểm phát hành và artifact cho từng OS/architecture. Manifest được ký bằng Ed25519. Agent chứa public key để kiểm tra chữ ký; private signing key không nằm trong Agent hoặc dashboard.

Ed25519 giúp Agent trả lời câu hỏi: “Manifest này có thực sự do người giữ release key tạo ra và có bị sửa không?”. Sau đó SHA-256 giúp xác nhận binary tải xuống đúng từng byte như manifest đã ký.

Agent từ chối update khi:

- Chữ ký không hợp lệ.
- Manifest sai schema hoặc sai target version.
- Không có artifact cho OS/architecture hiện tại.
- Kích thước hoặc SHA-256 không khớp.
- File không có định dạng executable phù hợp.
- Binary không chứa marker version được yêu cầu.

> **Note:** TLS bảo vệ đường truyền; chữ ký release và checksum bảo vệ tính xác thực/toàn vẹn của artifact. Ba lớp này bổ sung cho nhau.

## Bảo vệ token và lệnh cài

- Chỉ sao chép lệnh install vào terminal của đúng server.
- Không commit token, chụp ảnh token hoặc gửi qua kênh công khai.
- Nếu nghi token lộ, xóa/re-register server để nhận token mới theo workflow hiện có.
- Giới hạn quyền truy cập tài khoản DatrixOps vì remote task có thể thay đổi máy.
- Giữ OS, CA certificates và service manager được cập nhật.

## Giới hạn bảo mật hiện tại

CORS backend hiện cho phép origin `*`; triển khai production nên giới hạn qua reverse proxy hoặc thay policy Backend. Web Terminal có audit metadata và timeout, nhưng là shell có quyền cao chứ không phải command allowlist. DatrixOps chưa thay thế hardening host, firewall, least privilege hoặc backup của bạn.

