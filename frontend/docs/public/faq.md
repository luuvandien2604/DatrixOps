---
title: "Câu hỏi thường gặp"
description: "Giải đáp các thắc mắc phổ biến về kiến trúc, bảo mật, vận hành và tính năng của DatrixOps."
---

## 1. DatrixOps có yêu cầu mở cổng inbound (như SSH hay port riêng) trên máy chủ được giám sát không?

**Hoàn toàn không.** Datrix Agent hoạt động 100% theo cơ chế **Outbound-only**:
- Agent chủ động gửi dữ liệu và nhận task qua kết nối HTTPS và Reverse WebSocket ngược về Control Plane.
- Bạn không cần mở bất kỳ cổng kết nối chiều vào (inbound port) nào trên máy chủ khách, kể cả cổng SSH 22.
- Máy chủ nằm sau NAT, tường lửa nội bộ hoặc mạng riêng doanh nghiệp (VPN/VPC) đều có thể kết nối bình thường mà không cần cấu hình port-forwarding.

---

## 2. Agent hỗ trợ những hệ điều hành và kiến trúc nào?

Datrix Agent được biên dịch nhị phân tĩnh (single static binary), hỗ trợ các nền tảng:
- **Linux:** `amd64` (x86_64) và `arm64` (aarch64) — Tương thích với Ubuntu, Debian, CentOS, RHEL, AlmaLinux, Rocky Linux, Alpine Linux.
- **macOS:** Intel (`amd64`) và Apple Silicon (`arm64`).
- **Windows:** `amd64` (chạy dưới dạng Windows Service).

---

## 3. Dữ liệu giám sát được cập nhật với tần suất như thế nào?

- **Heartbeat & Chỉ số tức thời (CPU, RAM, Disk, Network):** Gửi về Control Plane định kỳ mỗi 5 đến 10 giây.
- **Snapshot chi tiết (Tiến trình, Dịch vụ hệ thống, Docker container):** Được Agent thu thập và cập nhật mỗi 60 giây.
- **Chẩn đoán mạng (Network Quality):** Tần suất đo do người dùng cấu hình linh hoạt cho từng nhóm target (mặc định từ 10s đến 60s).

---

## 4. Tại sao biểu đồ tài nguyên có khoảng trống (gaps) thay vì đường liền mạch?

DatrixOps cam kết phản ánh **trung thực dữ liệu thực tế**. Khi máy chủ bị mất mạng, sập nguồn hoặc Agent dừng hoạt động, hệ thống sẽ để trống khoảng thời gian đó trên biểu đồ thời gian thực thay vì vẽ nối giả lập giữa hai điểm dữ liệu. Điều này giúp đội ngũ vận hành nhìn thấy chính xác thời điểm bắt đầu và kết thúc của sự cố downtime.

---

## 5. Dữ liệu của tôi được lưu trữ ở đâu? Có gửi ra bên ngoài không?

Với phiên bản **Community Edition (Self-Hosted)**, toàn bộ dữ liệu gồm: thông tin máy chủ, chuỗi số liệu tài nguyên (metrics), lịch sử đo mạng, cấu hình cảnh báo và nhật ký kiểm toán (audit logs) được lưu trữ **100% trên chính máy chủ của bạn** (trong cơ sở dữ liệu PostgreSQL cục bộ). Hệ thống hoàn toàn không gửi bất kỳ dữ liệu telemetry nào về máy chủ bên thứ ba.

---

## 6. Tính năng Web Terminal hoạt động như thế nào qua trình duyệt?

Khi bạn nhấn mở Terminal trên Dashboard:
1. Trình duyệt mở kết nối WebSocket an toàn tới Control Plane.
2. Control Plane chuyển tiếp yêu cầu tới Agent thông qua kênh Reverse WebSocket đã thiết lập sẵn.
3. Agent khởi tạo một phiên pseudo-terminal (PTY) cục bộ (bash/sh trên Linux) và truyền tải luồng dữ liệu I/O hai chiều theo thời gian thực.
4. Mọi thao tác đều được xác thực bằng phiên đăng nhập quản trị và ghi nhận vào Audit Log.

---

## 7. Khác biệt giữa "Uninstall Agent & Delete" và "Delete Record Only"?

Khi xóa một máy chủ khỏi hệ thống:
- **Uninstall Agent & Delete (Khuyên dùng):** Áp dụng khi máy chủ đang Online. Control Plane sẽ gửi lệnh xuống Agent để dừng service, tự động gỡ bỏ file nhị phân trên máy chủ khách, sau đó mới xóa dữ liệu trên Dashboard.
- **Delete Record Only:** Chỉ xóa bản ghi trên Dashboard, không can thiệp vào máy chủ khách. Thường dùng khi máy chủ đã bị hủy (terminated trên Cloud), mất hoàn toàn kết nối hoặc khi cần dọn dẹp khẩn cấp.

---

## 8. Datrix Agent tiêu tốn bao nhiêu tài nguyên hệ thống?

Datrix Agent được tối ưu hóa ở mức tối đa bằng ngôn ngữ Go:
- Dung lượng RAM: Thông thường chỉ chiếm khoảng **10 MB – 15 MB**.
- Mức tiêu thụ CPU: Dưới **0.5%** CPU trong điều kiện hoạt động định kỳ.
- Không có runtime phụ thuộc (không cần cài Python, Node.js hay Java).
