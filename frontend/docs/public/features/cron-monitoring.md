---
title: Giám sát tác vụ Cron
description: Theo dõi lịch sử chạy, thời gian thực thi và mã thoát lỗi của Cron job.
---

# Giám sát tác vụ Cron

Các tác vụ chạy ngầm định kỳ (như sao lưu cơ sở dữ liệu, dọn dẹp bộ đệm cache, gửi báo cáo hàng ngày) thường gặp sự cố mà không ai hay biết. Phương thức gửi email truyền thống của cron thường bị bỏ lỡ hoặc rơi vào hộp thư rác (spam).

DatrixOps cung cấp tính năng **Giám sát tác vụ Cron (Cron Execution Telemetry)** giúp ghi nhận chính xác thời điểm thực thi, đo lường thời gian chạy, nắm bắt mã kết thúc (exit code) và hiển thị thông báo ngay khi có sự cố xảy ra.

---

## Cách thức hoạt động

DatrixOps đem lại hai mức độ giám sát:

1. **Khám phá Crontab hệ thống**: Agent tự động quét và liệt kê danh sách các lịch trình cron hiện có trên máy chủ Linux (từ `/etc/crontab`, `/etc/cron.d/` và crontab của người dùng).
2. **Đo kiểm thực thi trực tiếp**: Bằng cách gắn tiền tố lệnh bọc `datrix-agent cron wrap` vào dòng lệnh cron, Agent sẽ ghi nhận chính xác mốc thời gian bắt đầu, thời lượng xử lý, kết quả đầu ra và mã trạng thái thoát.

```
[ Lịch chạy Crontab ] ──> [ datrix-agent cron wrap ] ──> [ Kịch bản / Script ]
                                   │
                                   ▼ Báo cáo số liệu thực thi
                        [ DatrixOps Dashboard ]
```

---

## Gắn bọc lệnh Cron để thu thập dữ liệu

Để kích hoạt tính năng theo dõi chi tiết cho bất kỳ tác vụ cron nào, hãy chỉnh sửa lệnh trong crontab với tiện ích `datrix-agent cron wrap`:

### Ví dụ: Sao lưu cơ sở dữ liệu hàng đêm

Giả sử bạn đang có một lệnh cron trong `/etc/crontab` hoặc `crontab -e`:

```bash
# Lệnh gốc ban đầu
0 2 * * * /usr/local/bin/backup-database.sh
```

Hãy cập nhật lại thành:

```bash
# Lệnh đã gắn bộ thu thập DatrixOps
0 2 * * * datrix-agent cron wrap --job "db-nightly-backup" -- /usr/local/bin/backup-database.sh
```

### Giải thích các tham số
- `--job "db-nightly-backup"`: Tên định danh gợi nhớ hiển thị trên Dashboard.
- `--`: Dấu phân cách các cờ lệnh của Agent với kịch bản chính của bạn.
- `/usr/local/bin/backup-database.sh`: Lệnh thực thi gốc. Lệnh này vẫn chạy với đúng các biến môi trường và quyền hạn tài khoản như bình thường.

---

## Xem dữ liệu Cron trên Dashboard

Truy cập **Servers → [Chọn máy chủ] → Cron Jobs**:

### 1. Bảng theo dõi tác vụ
- **Tên tác vụ (Job Name)**: Tên định danh đã đặt trong cờ `--job` hoặc đường dẫn tệp thực thi.
- **Lịch biểu (Schedule)**: Chu kỳ biểu thức cron (ví dụ: `0 2 * * *` hoặc `*/15 * * * *`).
- **Lần chạy gần nhất (Last Run)**: Thời gian tương đối tính từ lần chạy mới nhất (ví dụ: `3 giờ trước`).
- **Thời lượng (Duration)**: Thời gian xử lý thực tế (ví dụ: `42.5s` hoặc `3m 12s`).
- **Mã kết thúc (Exit Code)**:
  - **Thành công (Xanh lá)**: Mã thoát trả về bằng `0`.
  - **Thất bại (Đỏ)**: Mã thoát khác `0` (ví dụ: `1`, `127`).

### 2. Lịch sử thực thi & Nhật ký lỗi
Nhấp vào bất kỳ tác vụ nào để mở bảng lịch sử:
- Danh sách các mốc thời gian và thời lượng của các lần chạy trước đó.
- Trích đoạn nhật ký đầu ra (stdout / stderr) được ghi lại khi lệnh chạy thất bại, giúp bạn tìm ra nguyên nhân lỗi ngay trên giao diện web mà không cần truy cập máy chủ để đọc log.

---

## Khuyến nghị vận hành

- **Tác vụ quan trọng**: Luôn bọc các kịch bản sao lưu dữ liệu, thanh toán tự động và đồng bộ tệp.
- **Đường dẫn tuyệt đối**: Sử dụng đường dẫn tuyệt đối (ví dụ: `/usr/bin/python3` thay vì `python3`) bên trong script để tránh sai khác môi trường biến PATH.
- **Phân quyền**: Đảm bảo người dùng sở hữu cron có quyền thực thi tệp `/usr/local/bin/datrix-agent`.

---

## Bước tiếp theo

- Thiết lập thông báo sự cố tức thời tại [Cảnh báo & Kênh thông báo](/docs/vi/features/alerts).
- Chạy kiểm tra thủ công từ xa với [Web Terminal từ xa](/docs/vi/features/web-terminal).
