# Feature Spec: Agent v1

## 1. Mục tiêu
Agent là phần mềm chạy trên các VPS con. Nó có nhiệm vụ lấy thông tin hệ điều hành (CPU, RAM) và gửi (Heartbeat) về máy chủ trung tâm định kỳ để máy chủ biết VPS đó còn sống hay đã chết.

## 2. Đặc điểm kỹ thuật
- **Ngôn ngữ**: Go (tạo ra file binary duy nhất không cần cài cắm gì thêm).
- **Thư viện Metrics**: Sử dụng `github.com/shirou/gopsutil` để lấy thông tin CPU và RAM một cách đồng nhất giữa Linux/Mac/Windows.
- **Heartbeat Loop**: 
  - Khởi động lên: Gửi ngay 1 nhịp tim đầu tiên kèm thông tin phần cứng (OS, RAM Total, CPU Cores).
  - Vòng lặp: Cứ mỗi 10 giây (hoặc lấy từ cấu hình), gửi 1 nhịp tim (có thể kèm theo chỉ số sử dụng %CPU, %RAM).
- **Bảo mật (Agent Token)**: Đọc từ biến môi trường `DATRIXOPS_AGENT_TOKEN`. Gửi token này lên header `Authorization: Bearer <token>` ở mọi Request. Core API sẽ tự tìm xem token này thuộc về server nào.

## 3. API Tương tác (Backend)
- Endpoint: `POST /api/v1/agent/heartbeat`
- Headers: `Authorization: Bearer <agent_token>`
- Body: 
```json
{
  "os_name": "Ubuntu 22.04",
  "cpu_cores": 4,
  "cpu_usage": 15.5,
  "memory_total": 8589934592,
  "memory_used": 1024500000
}
```

## 4. Xử lý lỗi & Graceful Shutdown
- Nếu lỗi mạng/không gọi được Core API: Log ra màn hình, chờ nhịp sau gọi lại, KHÔNG ĐƯỢC CRASH.
- Khi nhấn Ctrl+C: Dọn dẹp an toàn và thoát.
