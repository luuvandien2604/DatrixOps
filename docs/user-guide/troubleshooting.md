# Khắc phục sự cố (Troubleshooting)

## 1. Lỗi Server báo "Chưa có dữ liệu"

Nếu máy chủ của bạn hiển thị màn hình trống kèm thông báo **"Chưa có dữ liệu"** tại trang Giám sát (Monitoring), thì có nghĩa là Dashboard chưa nhận được bất kỳ tín hiệu (Metrics) nào từ con Server đó.

### Nguyên nhân và cách sửa
**Nguyên nhân 1: Bạn chưa cài Agent trên Server đó**
- Khắc phục: Vào mục Quản lý Server, bấm biểu tượng "Tải về" (Download) cạnh tên Server để lấy lệnh cài đặt. Chạy lệnh đó trên VPS của bạn.

**Nguyên nhân 2: Phiên bản Agent đã quá cũ**
- Nếu bạn vừa nâng cấp Dashboard lên bản mới nhất (có hỗ trợ lưu trữ Time-series, theo dõi 7 ngày và đo Network/Disk), nhưng Agent trên VPS vẫn là phiên bản cũ, chúng sẽ không tương thích.
- Khắc phục: Bạn chỉ cần chạy lại lệnh cài đặt Agent trên VPS. Lệnh cài sẽ tự động tải phiên bản mới nhất đè lên bản cũ và gửi thông số ngay lập tức.

**Nguyên nhân 3: Máy chủ bị chặn mạng**
- Kiểm tra xem máy chủ có bị tường lửa (Firewall) chặn không cho phép truy cập ra ngoài mạng Internet (Outbound) hay không. Agent cần kết nối tới `cổng 443` hoặc `80` của domain chứa Dashboard.

## 2. Lỗi cài đặt PowerShell trên Windows

Nếu bạn copy lệnh cài đặt PowerShell vào máy chủ Windows và gặp các lỗi chữ đỏ (Lỗi Parser, Unexpected token):

**Nguyên nhân:** Lỗi này xảy ra do định dạng Encoding (UTF-8) khi copy lệnh từ Web vào PowerShell, hoặc do phiên bản PowerShell của máy quá cũ.

**Khắc phục:**
DatrixOps cung cấp 2 chế độ dòng lệnh cài đặt cho Windows: Chế độ mặc định (`PowerShell`) và chế độ dự phòng (`CMD / Batch`). 
Hãy thử sử dụng tab **CMD** (Lệnh cài đặt bắt đầu bằng `cmd.exe /c ...`). Chạy lệnh này bằng Command Prompt (Quyền Administrator) thay vì dùng PowerShell. Lệnh Batch này ổn định hơn và bỏ qua được các lỗi Encoding của môi trường Windows Server cũ.
