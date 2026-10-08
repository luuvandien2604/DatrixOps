---
title: Chẩn đoán chất lượng mạng
description: Đo lường độ trễ ICMP/TCP, Gateway uplink, phân nhóm thẻ và tỷ lệ mất gói.
---

# Chẩn đoán chất lượng mạng

DatrixOps cung cấp tính năng đo kiểm chất lượng mạng liên tục và đa mục tiêu từ chính các máy chủ được giám sát của bạn. Thay vì chỉ phụ thuộc vào các công cụ kiểm tra từ bên ngoài, DatrixOps cho phép từng máy chủ chủ động tự chẩn đoán môi trường mạng của nó—từ độ trễ Gateway nội bộ, chất lượng đường truyền ISP, tốc độ phân giải DNS cho đến tỷ lệ mất gói tin quốc tế.

---

## Các khái niệm cốt lõi

### Phân nhóm thẻ linh hoạt (Dynamic Tag Grouping)
Các mục tiêu đo kiểm được phân nhóm động dựa trên **thẻ (tag)** do bạn tùy ý đặt thay vì các cột cố định. Ví dụ:
- `Trong nước`: Đo tới CDN nội địa, máy chủ đám mây trong nước, DNS nhà mạng.
- `Quốc tế`: Đo tới Singapore, Tokyo, Hồng Kông hoặc Hoa Kỳ.
- `DNS`: Đo tới Cloudflare `1.1.1.1`, Google `8.8.8.8`.
- `Database` / `Nội bộ`: Đo độ trễ kết nối tới các cụm database private, Redis hoặc VPN.

### Phân tách giao thức chuẩn xác (ICMP vs. TCP)
- **ICMP Ping**: Đo lường thời gian phản hồi vòng lặp (độ trễ ms) và tính toán chính xác **tỷ lệ mất gói tin (Packet Loss %)**.
- **TCP Socket**: Kiểm tra tốc độ bắt tay kết nối tới một cổng dịch vụ cụ thể (ví dụ: cổng `443` của web hoặc cổng `3306` của MySQL). Thử nghiệm TCP ghi nhận độ trễ kết nối thuần túy và không tính toán tỷ lệ mất gói.

### Tự động nhận diện Gateway nội bộ (Local Gateway Uplink)
Bạn có thể bật tùy chọn **Gateway Uplink** (`is_gateway = true`). Khi bật, Agent trên máy chủ sẽ tự động dò tìm địa chỉ IP Default Gateway nội bộ theo từng chu kỳ. Điều này giúp bạn nhận biết ngay lập tức sự cố nằm ở switch/card mạng nội bộ hay nằm ở đường truyền ISP bên ngoài.

---

## Trung tâm mạng tập trung (`/dashboard/network`)

Mục **Network Quality** trên menu chính là nơi quản trị tập trung toàn bộ mục tiêu đo kiểm trên toàn hệ thống.

### 1. Thư viện mục tiêu mẫu (Preset Catalog)
Khi thêm mục tiêu mới, bạn có thể chọn nhanh các mẫu phổ biến có sẵn:
- **Local Gateway**: Tự động đo tới router/gateway mặc định của máy chủ.
- **Cloudflare DNS (`1.1.1.1`)**: Kiểm tra độ trễ Anycast toàn cầu.
- **Google Public DNS (`8.8.8.8`)**: Mục tiêu ping ổn định chuẩn quốc tế.
- **DNS các nhà mạng Việt Nam**: VNPT (`203.162.4.191`), Viettel (`203.113.131.1`), FPT (`210.245.24.20`).

### 2. Quản lý mục tiêu (Thêm, Sửa, Xóa)
Nhấn nút **Add Target** để thiết lập mục tiêu mới:
- **Tên mục tiêu**: Tên gợi nhớ (ví dụ: `Singapore Edge` hoặc `Cổng Gateway chính`).
- **Host / IP**: Tên miền hoặc địa chỉ IP (ví dụ: `sg.speedtest.net` hoặc `1.1.1.1`).
- **Cổng (Port)**: Bắt buộc nếu chọn phương thức TCP (ví dụ: `443`). Bỏ trống nếu dùng ICMP ping.
- **Thẻ phân nhóm (Tag)**: Nhập tên nhóm thẻ (ví dụ: `Trong nước`, `Quốc tế`, `DNS`).
- **Phương thức kiểm tra**: Chọn `ICMP (Ping)` hoặc `TCP (Socket)`.
- **Số gói tin mỗi chu kỳ (Probes per run)**: Số gói gửi đi mỗi lần đo (mặc định: `5`).
- **Ngưỡng cảnh báo**:
  - **Cảnh báo độ trễ (Warning ms)**: ví dụ `50 ms`.
  - **Nguy cấp độ trễ (Critical ms)**: ví dụ `150 ms`.
  - **Mất gói nguy cấp (Packet Loss Critical %)**: ví dụ `20%`.
- **Gán cho máy chủ**: Chọn một hoặc nhiều máy chủ cùng thực hiện đo kiểm mục tiêu này.

### 3. Kiểm tra tức thì với "Test Now"
Để kiểm tra tình trạng kết nối mạng ngay lập tức mà không cần đợi chu kỳ đo định kỳ, hãy nhấn nút **Test Now** bên cạnh mục tiêu. Agent sẽ lập tức chạy lệnh đo và trả về kết quả độ trễ và mất gói tin ngay trên màn hình.

---

## Xem chất lượng mạng theo từng máy chủ

Truy cập **Servers → [Chọn máy chủ] → Network Quality**:

- **Thẻ Gateway Uplink**: Thể hiện trực quan độ trễ gateway nội bộ và trạng thái kết nối.
- **Các khối thẻ (Tag Group Cards)**: Thống kê tổng hợp độ trễ trung bình và tỷ lệ mất gói cao nhất theo từng nhóm thẻ.
- **Bảng chi tiết các mục tiêu**: Liệt kê mọi đích đến kèm nhãn trạng thái (`optimal`, `warning`, `critical`).
- **Biểu đồ chuỗi thời gian**: Nhấp vào bất kỳ mục tiêu nào để mở hộp thoại biểu đồ thể hiện lịch sử biến thiên độ trễ và mất gói tin theo thời gian.
- **Nút "Quản lý targets"**: Nhấn nút chuyển nhanh sang Trung tâm mạng tập trung đã lọc sẵn theo máy chủ này.

---

## Bảng phân cấp trạng thái & Ngưỡng mặc định

| Trạng thái | Ý nghĩa | Ngưỡng mặc định (Mục tiêu chuẩn) | Ngưỡng mặc định (Gateway) |
| :--- | :--- | :--- | :--- |
| **Optimal** | Độ trễ thấp, không mất gói | `< 50 ms`, `0% loss` | `< 20 ms`, `0% loss` |
| **Warning** | Độ trễ bắt đầu tăng cao | `> 50 ms` | `> 20 ms` |
| **Critical** | Độ trễ rất cao hoặc mất gói nghiêm trọng | `> 150 ms` hoặc `> 20% loss` | `> 80 ms` hoặc `> 20% loss` |

> [!TIP]
> Nếu máy chủ hiển thị độ trễ cao tới các mục tiêu Quốc tế nhưng thẻ Gateway Uplink vẫn báo xanh lá (< 5 ms), nguyên nhân sự cố chắc chắn là do đứt cáp quang biển hoặc nghẽn tuyến quốc tế của nhà mạng, không phải do máy chủ của bạn gặp vấn đề.

---

## Bước tiếp theo

- Thiết lập cảnh báo khi mất gói tin trong [Cảnh báo & Kênh thông báo](/docs/vi/features/alerts).
- Giám sát độ sẵn sàng của trang web tại [Giám sát Website & SSL](/docs/vi/features/uptime).
