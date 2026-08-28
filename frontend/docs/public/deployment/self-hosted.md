---
title: "Triển khai Self-Hosted"
description: "Hướng dẫn cài đặt, quản trị bằng CLI datrix, nâng cấp, sao lưu và khôi phục DatrixOps Community Edition."
---

DatrixOps Community Edition (CE) là phiên bản mã nguồn mở tự host hoàn chỉnh, bao gồm **Control Plane** quản trị tập trung và **DatrixOps Agent** cài đặt trên các máy chủ cần giám sát. Toàn bộ cơ sở dữ liệu PostgreSQL, số liệu telemetry, logs và lịch sử audit hoàn toàn nằm trên hạ tầng của bạn.

---

## 1. Yêu cầu hệ thống

| Tài nguyên | Khuyến nghị tối thiểu | Ghi chú |
| :--- | :--- | :--- |
| **Hệ điều hành** | Ubuntu 20.04+, Debian 11+, CentOS/RHEL 8+, AlmaLinux | Kiến trúc `x86_64` (amd64) hoặc `aarch64` (arm64) |
| **CPU** | 1 Core | 2 Cores nếu giám sát > 50 máy chủ |
| **RAM** | 2 GB | Tối thiểu 1.5 GB khả dụng |
| **Ổ cứng** | 20 GB SSD | Tùy thuộc vào thời gian lưu trữ metrics |
| **Cổng mạng (Inbound)** | `80/TCP`, `443/TCP` | Mở trên Firewall / Security Group (AWS/GCP/DigitalOcean) |

---

## 2. Cài đặt tự động trong 1 lệnh

Đăng nhập vào VPS với quyền `root` hoặc `sudo` và chạy lệnh:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/bootstrap.sh | sudo bash
```

### Trình cài đặt tự động xử lý:
1. **Kiểm tra môi trường:** Cài đặt `docker`, `docker compose`, `curl`, `openssl`, `jq` nếu máy chủ chưa có.
2. **Lựa chọn chế độ truy cập:**
   * **Public IP (Mặc định):** Truy cập qua `http://<IP_VPS>` (cổng 80 tiêu chuẩn).
   * **Custom Domain:** Nhập domain riêng (ví dụ `monitor.example.com`). Hệ thống tự động cấp phát và gia hạn chứng chỉ **HTTPS / SSL miễn phí** qua Caddy Gateway.
3. **Cấu hình Quản trị viên:** Thiết lập username quản trị (mặc định `admin`) và mật khẩu an toàn (tự đặt hoặc tự động sinh).
4. **Tự động kích hoạt Self-Monitoring:** Cài đặt Agent và kết nối ngay chính VPS Control Plane vào Dashboard để giám sát tài nguyên tức thì.
5. **Đăng ký lệnh quản trị `datrix`:** Tạo symlink toàn cục tại `/usr/local/bin/datrix`.

---

## 3. Quản trị hệ thống với CLI `datrix`

Sau khi cài đặt xong, bạn có thể quản trị toàn bộ hệ thống bằng lệnh `datrix` trực tiếp trong terminal.

### 📋 Menu Quản trị Tương tác

Gõ lệnh không kèm tham số để mở bảng điều khiển:

```bash
datrix
```
*(Hoặc `sudo datrix` nếu đang dùng tài khoản user thường)*

Giao diện trực quan xuất hiện:

```text
============================================================
  DatrixOps Management
============================================================
  1) Show login information
  2) Show service status
  3) Reset administrator password
  4) Follow service logs
  5) Restart services
  6) Upgrade DatrixOps
  7) Create backup
  0) Exit
============================================================
Select:
```

### ⚡ Các lệnh CLI trực tiếp (Non-interactive)

Bạn có thể chạy trực tiếp từng tác vụ mà không cần mở menu:

| Lệnh CLI | Chức năng | Ví dụ |
| :--- | :--- | :--- |
| `datrix info` | Xem URL đăng nhập, phiên bản CE Server & Agent, tên tài khoản Admin | `datrix info` |
| `datrix status` | Kiểm tra trạng thái các container Docker và dịch vụ Agent | `datrix status` |
| `datrix reset-password` | Đổi mật khẩu tài khoản quản trị viên an toàn | `datrix reset-password admin` |
| `datrix logs` | Xem stream log thời gian thực của tất cả container (Ctrl+C để thoát) | `datrix logs` |
| `datrix restart` | Khởi động lại toàn bộ các container và dịch vụ Agent | `datrix restart` |
| `datrix update` | Tự động sao lưu và nâng cấp lên phiên bản CE mới nhất | `datrix update` |
| `datrix backup` | Tạo bản sao lưu toàn diện (Database + Cấu hình `.env`) | `datrix backup` |
| `datrix help` | Xem danh sách hướng dẫn lệnh | `datrix help` |

---

## 4. Nâng cấp phiên bản (Upgrades)

Quy trình nâng cấp của DatrixOps hoàn toàn tự động và luôn **tạo backup an toàn trước khi nâng cấp**.

### Cách 1: Nâng cấp trực tiếp qua CLI

```bash
sudo datrix update
```

### Cách 2: Kiểm tra phiên bản mới mà không nâng cấp

```bash
sudo /opt/datrixops/deploy/upgrade.sh --check
```
*Output mẫu:*
```text
============================================================
  DatrixOps Release Update Check
============================================================
  Installed Version : v1.8.2
  Latest Version    : v1.8.3
============================================================
[WARN] New version v1.8.3 is available! Run upgrade to apply.
```

### Cách 3: Buộc cài đặt lại / Nâng cấp cưỡng bức (`--force`)

Nếu container gặp sự cố hoặc muốn đồng bộ lại mã nguồn:

```bash
sudo /opt/datrixops/deploy/upgrade.sh --force
```

### Cách 4: Bật lịch tự động nâng cấp hàng ngày (Auto-update Cron)

Hệ thống hỗ trợ tự động kiểm tra và nâng cấp hàng ngày vào lúc 03:00 sáng:

```bash
# Bật tự động nâng cấp hàng ngày
sudo /opt/datrixops/deploy/upgrade.sh --setup-cron

# Tắt tự động nâng cấp
sudo /opt/datrixops/deploy/upgrade.sh --disable-auto-update
```
*(File cấu hình cron được lưu tại `/etc/cron.d/datrixops-auto-update` và log ghi tại `/var/log/datrixops-auto-upgrade.log`).*

---

## 5. Sao lưu & Khôi phục (Backup & Disaster Recovery)

### Tạo bản sao lưu (Backup)

Chạy lệnh:
```bash
sudo datrix backup
```
* Bản backup nén dạng `.tar.gz` được lưu tại `/opt/datrixops/backups/`.
* File backup chứa toàn bộ:
  1. `database.dump`: Dump nhị phân toàn bộ cơ sở dữ liệu PostgreSQL (người dùng, servers, audit log, metrics).
  2. `environment.env`: Bản sao cấu hình bí mật (`JWT_SECRET`, `POSTGRES_PASSWORD`, `SETUP_TOKEN`...).
  3. `manifest.txt`: Metadata thời gian và commit git tương ứng.

### Khôi phục dữ liệu (Restore)

Khi chuyển sang máy chủ mới hoặc phục hồi sau sự cố:

```bash
sudo /opt/datrixops/deploy/restore.sh /opt/datrixops/backups/datrixops-backup-YYYY-MM-DD-HHMMSS.tar.gz --yes
```

> [!WARNING]
> Quá trình khôi phục sẽ ghi đè dữ liệu cơ sở dữ liệu hiện tại bằng dữ liệu trong bản backup. Tham số `--yes` là bắt buộc để xác nhận hành động.

---

## 6. Đổi mật khẩu Quản trị viên (Password Reset)

Nếu quên mật khẩu đăng nhập Dashboard:

```bash
sudo datrix reset-password
```
Nhập mật khẩu mới (tối thiểu 12 ký tự). Hệ thống sẽ băm mật khẩu bằng thuật toán an toàn và lưu trữ trực tiếp vào cơ sở dữ liệu.

---

## 7. Cấu hình Nâng cao & Tùy biến

Toàn bộ cấu hình hệ thống được lưu tại file `/opt/datrixops/.env` (hoặc `/opt/datrixops/deploy/.env`):

```bash
# Chỉnh sửa cấu hình
sudo nano /opt/datrixops/.env

# Áp dụng cấu hình mới
sudo datrix restart
```

### Các biến môi trường quan trọng:

| Biến môi trường | Mặc định | Mô tả |
| :--- | :--- | :--- |
| `PUBLIC_URL` | `http://<IP>` hoặc `https://<domain>` | URL chính thức để truy cập Dashboard |
| `CADDY_SITE_ADDRESS` | `http://<IP>` hoặc `<domain>` | Cấu hình cho Caddy Gateway tự động cấp SSL |
| `DATRIXOPS_HTTP_PORT` | `80` | Cổng HTTP lắng nghe bên ngoài host |
| `DATRIXOPS_HTTPS_PORT` | `443` | Cổng HTTPS lắng nghe bên ngoài host |
| `AGENT_VERSION` | `1.5.9` | Phiên bản Agent mặc định được phân phối |
