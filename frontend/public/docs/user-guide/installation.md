# Hướng dẫn cài đặt Agent

Agent là một phần mềm siêu nhẹ có nhiệm vụ thu thập thông số tài nguyên (CPU, RAM, Disk, Network) của máy chủ và gửi về Dashboard.

## 1. Yêu cầu hệ thống (Firewall)
- **Tường lửa (Firewall):** Bạn **KHÔNG** cần phải mở bất kỳ Port nào trên máy chủ cần cài Agent. Agent hoạt động dựa trên cơ chế kết nối Outbound ra ngoài internet (Tới cổng 443/80 của máy chủ Dashboard).
- **Hệ điều hành:** Hỗ trợ Linux (Ubuntu, CentOS, Debian...) và Windows Server.

## 2. Các bước cài đặt

**Bước 1:** Đăng nhập vào DatrixOps Dashboard.
**Bước 2:** Chuyển đến menu **Quản lý Server**.
**Bước 3:** Bấm nút **Thêm Server** và nhập tên gợi nhớ cho máy chủ của bạn.
**Bước 4:** Một cửa sổ chứa lệnh cài đặt sẽ hiện ra. Chọn hệ điều hành tương ứng (Linux hoặc Windows).
**Bước 5:** Copy toàn bộ đoạn lệnh đó, dán (paste) vào Terminal / PowerShell của máy chủ con và nhấn Enter. 

*(Đối với Linux, bạn cần quyền `root`. Đối với Windows, bạn cần chạy PowerShell bằng quyền `Administrator`)*.

## 3. Khởi động lại hoặc cập nhật
Mã cài đặt đã tự động thiết lập Systemd (trên Linux) và Task Scheduler (trên Windows) để Agent tự động chạy ngầm và tự khởi động cùng hệ điều hành (Run on startup).

Nếu Dashboard ra mắt phiên bản mới và bạn cần cập nhật Agent, chỉ cần copy lại lệnh cài đặt cũ trên Dashboard và chạy lại một lần nữa. Mã cài đặt sẽ tự động tải file mới, đè lên bản cũ và khởi động lại dịch vụ một cách an toàn.
