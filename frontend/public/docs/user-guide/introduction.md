# Giới thiệu DatrixOps

Chào mừng bạn đến với **DatrixOps** – Giải pháp giám sát và quản lý máy chủ (Server/VPS) chuyên nghiệp, tối giản và hiệu quả.

## Tại sao chọn DatrixOps?

Thay vì phải SSH vào từng máy chủ để kiểm tra tài nguyên hệ thống (CPU, RAM, Disk, Network) bằng lệnh `htop`, DatrixOps mang tất cả thông số của bạn lên một Bảng điều khiển (Dashboard) duy nhất.

### Tính năng nổi bật
- **Theo dõi Thời gian thực (Real-time Monitoring):** Biểu đồ CPU, RAM, Network, Disk được cập nhật liên tục mỗi 10 giây.
- **Biểu đồ Thông minh (Time-Series):** Hỗ trợ xem lại lịch sử dữ liệu lên đến 7 ngày mà không bị giật lag nhờ công nghệ nén dữ liệu (Downsampling) tự động.
- **Agent siêu nhẹ:** Chỉ là 1 tệp tin (Binary) duy nhất, viết bằng Go, không cần cài đặt Node.js hay Python trên máy khách. Tiêu tốn chưa tới 10MB RAM.
- **Bảo mật tuyệt đối:** Hoàn toàn **KHÔNG** yêu cầu mở Port trên máy khách. Agent chỉ chủ động gọi ra ngoài (Outbound) tới máy chủ trung tâm.

## Kiến trúc hệ thống
Hệ thống gồm 2 phần chính:
1. **DatrixOps Dashboard (Server-side):** Nơi bạn đăng nhập, quản lý và xem biểu đồ. Thường được cài trên 1 máy chủ chính.
2. **DatrixOps Agent (Client-side):** Là phần mềm nhỏ chạy ngầm trên tất cả các VPS/Server mà bạn muốn giám sát. Nhiệm vụ của nó là đọc thông số máy và gửi về Dashboard.

Hãy chuyển sang bài tiếp theo để xem Hướng dẫn cài đặt.
