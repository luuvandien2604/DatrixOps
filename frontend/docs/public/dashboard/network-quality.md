---
title: "Chẩn đoán chất lượng mạng"
description: "Kiến trúc đo lường độ trễ mạng ICMP/TCP, Gateway uplink, phân nhóm tag động và theo dõi độ ổn định đường truyền."
---

Hệ thống **Chẩn đoán chất lượng mạng (Network Quality Diagnostics)** của DatrixOps cho phép bạn theo dõi độ trễ (latency), tỷ lệ mất gói (packet loss) và chất lượng kết nối Internet/Nội bộ của từng máy chủ và toàn bộ hạ tầng (fleet-wide) theo thời gian thực.

---

## 1. Nguyên lý kiến trúc cốt lõi

- **Mục tiêu chẩn đoán linh hoạt (Không hardcode IP):** Toàn bộ mục tiêu giám sát (host, port, tag phân nhóm, phương thức đo, ngưỡng cảnh báo) được lưu trữ tập trung tại cơ sở dữ liệu `network_targets` và cấu hình trực tiếp từ giao diện điều khiển.
- **Tách biệt giao thức đo (Protocol Separation):**
  - **ICMP Ping:** Đo lường độ trễ khứ hồi (RTT) và tỷ lệ mất gói (`packet_loss: %`).
  - **TCP Socket Connect:** Đo lường thời gian bắt tay TCP (socket connection latency) tới cổng dịch vụ xác định (ví dụ port 443, 53, 3306), không trộn lẫn tỷ lệ packet loss giả lập.
- **Phân nhóm Tag động (Dynamic Tag Grouping):** Bạn có thể tự do gán nhãn mục tiêu theo nhu cầu thực tế: `Trong nước`, `Quốc tế`, `DNS`, `Database`, `Gateway`,... Hệ thống tự động phân loại và gom nhóm thẻ trực quan.
- **Local Gateway Uplink tự động:** Mục tiêu nội bộ (`is_gateway = true`) tự động phân giải IP default gateway của card mạng chính trên Agent, giúp phát hiện ngay lập tức tình trạng nghẽn cáp mạng hoặc chập chờn tại switch/router cục bộ.

---

## 2. Giao diện hai tầng (Two-Tier Interface)

DatrixOps áp dụng mô hình phân tách vai trò rõ ràng giữa Quản lý tập trung và Giám sát ngữ cảnh:

### A. Trung tâm điều hành mạng (`/dashboard/network`)
Là nơi **quản trị duy nhất** cho toàn bộ cấu hình mục tiêu mạng:
1. **CRUD Targets:** Tạo mới, chỉnh sửa, bật/tắt hoặc xóa mục tiêu đo lường.
2. **Gán hàng loạt (Batch Assignment):** Gán một mục tiêu kiểm tra cho nhiều Agent cùng lúc chỉ với một thao tác.
3. **Danh mục mẫu (Preset Catalog):** Tạo nhanh các mục tiêu chuẩn hóa chỉ bằng 1 cú nhấp chuột:
   - *Cloudflare DNS* (`1.1.1.1` - ICMP)
   - *Google Public DNS* (`8.8.8.8` - ICMP)
   - *Việt Nam Telco DNS* (VNPT `123.30.224.2`, Viettel `203.113.131.1`, FPT `210.245.24.20`)
   - *Local Gateway Uplink* (Tự động resolve gateway của host)
4. **Kiểm tra tức thì (Test Now):** Gửi yêu cầu đo ngay lập tức đến một mục tiêu chỉ định mà không cần chờ chu kỳ định kỳ.
5. **Tổng quan sức khỏe Tag toàn mạng (Fleet-wide Tag Health):** Thống kê sức khỏe các nhóm tag trên toàn bộ hạ tầng máy chủ, giúp phát hiện nhanh sự cố đứt cáp quang biển hoặc nghẽn mạng diện rộng của ISP.

### B. Tab "Network Quality" trên từng máy chủ (`/dashboard/servers/[id]` → tab `network`)
Giao diện **chuyên biệt cho việc theo dõi (Read-only)**:
- **Thẻ Gateway Uplink:** Hiển thị trực quan độ trễ tới gateway mạng nội bộ (nếu có cấu hình).
- **Các nhóm thẻ Tag động:** Gom nhóm mục tiêu theo tag (Trong nước, Quốc tế, DNS) với chỉ số độ trễ trung bình và trạng thái sức khỏe (*Tối ưu*, *Cảnh báo*, *Nguy cấp*).
- **Bảng chi tiết Targets:** Lọc nhanh theo tag, tìm kiếm theo tên/host.
- **Biểu đồ Time-Series chuyên sâu:** Nhấn vào bất kỳ target nào để mở modal biểu đồ lịch sử độ trễ (Latency ms) và tỷ lệ rớt gói (Packet Loss %) theo thời gian.
- Nút **Quản lý targets** chuyển hướng nhanh về Trung tâm điều hành mạng với bộ lọc của chính máy chủ đó.

---

## 3. Ngưỡng cảnh báo và Tiêu chuẩn đánh giá

Mỗi mục tiêu có thể cấu hình ngưỡng riêng hoặc áp dụng ngưỡng mặc định của hệ thống:

| Loại mục tiêu | Ngưỡng Cảnh báo (Warning) | Ngưỡng Nguy cấp (Critical) | Ngưỡng Rớt gói (Loss Critical) |
| :--- | :---: | :---: | :---: |
| **Mục tiêu Gateway nội bộ** | `> 20.0 ms` | `> 80.0 ms` | `> 20.0 %` |
| **Mục tiêu Internet tiêu chuẩn** | `> 50.0 ms` | `> 150.0 ms` | `> 20.0 %` |

- **Thứ tự ưu tiên trạng thái:** `Critical` (Đỏ) có độ ưu tiên cao nhất, tiếp theo đến `Warning` (Vàng) và `Optimal` (Xanh lục).

---

## 4. Tương thích môi trường Container & OS

Agent chạy chẩn đoán mạng tương thích hoàn toàn trên:
- **Linux:** Hỗ trợ cả hệ thống sử dụng GNU Ping tiêu chuẩn lẫn BusyBox Ping trên môi trường container tối giản (Alpine Linux).
- **macOS & Windows:** Hỗ trợ kiểm tra độ trễ socket TCP và ICMP ping nguyên bản.
