---
title: Lệnh CLI datrix
description: Danh mục các lệnh kiểm tra, khởi động, dừng và gỡ lỗi Agent.
---

# Danh mục lệnh `datrix` & `datrix-agent` CLI

DatrixOps cung cấp hai công cụ dòng lệnh chuyên biệt hỗ trợ vận hành:
1. **`datrix`**: Cài đặt trên máy chủ trung tâm (Control Plane) để quản lý các container, sao lưu, đổi mật khẩu và xem log.
2. **`datrix-agent`**: Cài đặt trên các máy chủ được giám sát để quản lý vòng đời dịch vụ, chẩn đoán kết nối và bọc lệnh cron.

---

## Phần 1: Công cụ quản trị máy chủ (`datrix`)

Lệnh `datrix` được đặt tại `/usr/local/bin/datrix` trên máy chủ trung tâm của bạn.

### Giao diện tương tác trực quan
Chạy lệnh `sudo datrix` không kèm tham số để mở bảng chọn menu:

```bash
sudo datrix
```

### Các lệnh thực thi trực tiếp

| Cú pháp lệnh | Mô tả tác vụ |
| :--- | :--- |
| `sudo datrix info` | Hiển thị URL truy cập bảng điều khiển, IP/Domain và tài khoản admin ban đầu. |
| `sudo datrix status` | Kiểm tra trạng thái hoạt động của các container (`caddy`, `backend`, `frontend`). |
| `sudo datrix reset-password` | Đặt lại mật khẩu tài khoản quản trị trực tiếp mà không cần can thiệp DB. |
| `sudo datrix logs` | Theo dõi luồng nhật ký thời gian thực của toàn bộ hệ thống (`Ctrl+C` để thoát). |
| `sudo datrix restart` | Khởi động lại an toàn cụm ứng dụng Docker Compose. |
| `sudo datrix backup` | Thực hiện sao lưu tức thời và lưu tệp nén vào `/opt/datrixops/backups/`. |
| `sudo datrix upgrade` | Tải về các bản dựng mới nhất, cập nhật database và chạy lại dịch vụ. |

---

## Phần 2: Công cụ Agent trên máy chủ giám sát (`datrix-agent`)

Tệp chạy `datrix-agent` nằm tại `/usr/local/bin/datrix-agent` trên Linux/macOS (hoặc `C:\Program Files\DatrixAgent\` trên Windows).

### Kiểm tra phiên bản cài đặt
```bash
datrix-agent version
```
*Kết quả mẫu:*
```text
datrix-agent version v1.4.2 (darwin/arm64, commit: a1b2c3d, built: 2026-10-01)
```

### Kiểm tra trạng thái kết nối của Agent
Kiểm tra tính hợp lệ của tệp cấu hình và thử nghiệm kết nối tới máy chủ trung tâm:

```bash
sudo datrix-agent status
```
*Kết quả mẫu:*
```text
Configuration : /etc/datrix-agent/agent.yaml [VALID]
Control Plane : https://ops.tenmien.com [CONNECTED]
Agent ID      : agt_8f3a92bc17d0
Uptime        : 14d 8h 22m
```

### Chạy thử nghiệm thu thập chỉ số tức thì
Thu thập ngay lập tức chỉ số phần cứng và thực hiện đo kiểm mạng, in kết quả ra màn hình mà không cần chờ chu kỳ định kỳ:

```bash
sudo datrix-agent test
```

### Tự cập nhật Agent lên phiên bản mới
Tải về bản dựng mới nhất từ máy chủ DatrixOps, kiểm tra chữ ký số Ed25519, thay thế tệp nhị phân và khởi động lại dịch vụ ngầm:

```bash
sudo datrix-agent update
```

### Tiện ích bọc lệnh Cron thu thập số liệu
Gắn bọc các tác vụ tự động để ghi nhận thời điểm chạy, thời lượng xử lý, mã kết thúc và nhật ký lỗi:

```bash
datrix-agent cron wrap --job "<TEN_TAC_VU>" -- <LENH_CUA_BAN>
```

**Ví dụ:**
```bash
datrix-agent cron wrap --job "nightly-db-dump" -- /usr/local/bin/dump-db.sh --all
```

---

## Bước tiếp theo

- Xem bảng mô tả các biến môi trường tại [Biến môi trường .env](/docs/vi/reference/configuration).
- Xử lý các sự cố kết nối của Agent trong [Xử lý sự cố thường gặp](/docs/vi/troubleshooting/common-issues).
