---
title: Web Terminal từ xa
description: Truy cập shell dòng lệnh an toàn trực tiếp từ trình duyệt qua WebSocket đảo chiều.
---

# Web Terminal từ xa

Tính năng Web Terminal của DatrixOps cho phép bạn truy cập dòng lệnh của bất kỳ máy chủ Linux nào trực tiếp ngay trong trình duyệt web một cách an toàn và tức thì. Nhờ kiến trúc kênh WebSocket đảo chiều (reverse WebSocket tunnel), bạn có thể quản trị máy chủ từ xa mà không cần mở cổng SSH 22 hay thiết lập máy chủ trung chuyển (bastion host) phức tạp.

---

## Tại sao nên dùng Web Terminal đảo chiều?

Cách dùng SSH truyền thống thường đòi hỏi:
- Mở cổng Inbound `22` ra Internet công cộng, tiềm ẩn nguy cơ bị dò quét mật khẩu (brute-force).
- Máy chủ phải có IP tĩnh, cấu hình VPN hoặc phải đi qua nhiều lớp máy chủ nhảy (jump host).

**Kiến trúc WebSocket đảo chiều của DatrixOps:**
1. Bạn yêu cầu mở phiên terminal từ bảng điều khiển DatrixOps Dashboard.
2. Máy chủ DatrixOps gửi thông điệp yêu cầu tới Agent đang chạy qua kênh điều khiển sẵn có.
3. Agent khởi tạo một terminal ảo (`pty`) trên máy chủ và chủ động thiết lập kết nối WebSocket mã hóa **chiều đi (outbound)** ngược về máy chủ DatrixOps.
4. Trình duyệt của bạn kết nối vào luồng này, đem lại trải nghiệm dòng lệnh mượt mà, tốc độ cao và đầy đủ tính năng tương tác.

```
[ Trình duyệt (xterm.js) ] <─── WSS ───> [ Máy chủ DatrixOps ] <─── WSS Outbound ─── [ Shell PTY Máy chủ ]
```

---

## Cách mở phiên Web Terminal

1. Đăng nhập vào bảng điều khiển DatrixOps.
2. Vào mục **Servers** và chọn máy chủ Linux bạn muốn kết nối.
3. Trên thanh tab chi tiết máy chủ, nhấp chọn **Web Terminal**.
4. Nhấn nút **Connect Terminal**.
5. Trong vòng 1 đến 2 giây, cửa sổ dòng lệnh chuẩn (`xterm.js`) sẽ hiển thị trên trình duyệt với dấu nhắc lệnh quen thuộc của hệ điều hành.

---

## Các tính năng nổi bật

- **Tương tác PTY đầy đủ**: Hỗ trợ trọn vẹn các lệnh tương tác toàn màn hình như `top`, `htop`, `vim`, `nano`, `less` và các giao diện ncurses.
- **Tự động co giãn kích thước**: Tự động đồng bộ số cột và dòng khi bạn thu phóng cửa sổ trình duyệt hoặc bật chế độ toàn màn hình (Full Screen).
- **Sao chép và dán thuận tiện**: Hỗ trợ các phím tắt sao chép/dán tiêu chuẩn (`Ctrl+Shift+V` / `Cmd+V`).
- **Màu sắc chuẩn ANSI & Phông chữ rõ nét**: Độ tương phản cao, hỗ trợ True Color và bảng mã tiếng Việt Unicode (UTF-8).
- **Ngắt kết nối sạch sẽ**: Khi bạn thoát phiên (`exit`) hoặc đóng tab trình duyệt, Agent sẽ dọn dẹp tiến trình con, không để sót tiến trình mồ côi (zombie/orphan).

---

## Bảo mật & Khuyến nghị vận hành

- **Không cần mở cổng Inbound**: Giữ cổng `22` đóng hoàn toàn trên tường lửa hoặc Cloud Security Group.
- **Mã hóa toàn diện**: Mọi thao tác phím và dữ liệu truyền tải đều được mã hóa bằng TLS (`wss://`).
- **Lưu vết kiểm toán (Audit Trail)**: Mọi thao tác mở phiên và ngắt kết nối terminal đều được ghi nhận tại **Team Access → Audit Trail** (`/dashboard/manage/audit`), lưu rõ tài khoản thực hiện, ID máy chủ và thời điểm.
- **Phân quyền truy cập**: Chỉ tài khoản quản trị viên hoặc người vận hành được cấp quyền mới có thể kích hoạt Web Terminal.

> [!NOTE]
> Phiên Web Terminal chạy dưới ngữ cảnh quyền hạn của dịch vụ `datrix-agent` trên Linux. Hãy đảm bảo chỉ những thành viên đáng tin cậy trong đội ngũ mới được cấp quyền truy cập hệ thống.

---

## Bước tiếp theo

- Quản lý các tiến trình dịch vụ hệ thống tại [Giám sát máy chủ & Dịch vụ](/docs/vi/features/servers).
- Giám sát các tác vụ tự động chạy ngầm trong [Giám sát tác vụ Cron](/docs/vi/features/cron-monitoring).
