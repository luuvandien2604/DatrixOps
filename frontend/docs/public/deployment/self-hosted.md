---
title: "Triển khai Self-Hosted"
description: "Cài đặt và vận hành DatrixOps Community Edition trên hạ tầng của bạn."
---

DatrixOps Community Edition gồm một **Control Plane** tự host và Agent cài trên
từng server cần giám sát. PostgreSQL, metrics, audit history và cấu hình nằm trên
hạ tầng do bạn quản lý.

## Cài Control Plane

Máy chủ khuyến nghị: Linux, 1 CPU, 2 GB RAM, 20 GB disk và TCP 80/443. Chạy:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/install.sh | sudo bash
```

Installer chuẩn bị Docker, Caddy, secret, signed Agent artifacts, database
migration và container. Sau khi hoàn tất, mở `http://<IP>/setup` hoặc
`https://<domain>/setup` để tạo local administrator đầu tiên.

## Trách nhiệm vận hành

Bạn chịu trách nhiệm cho DNS/TLS, firewall, backup, nâng cấp, dung lượng lưu
trữ và quyền truy cập host. DatrixOps không gửi dữ liệu vận hành tới một SaaS
bắt buộc.

## Nâng cấp

```bash
sudo /opt/datrixops/deploy/upgrade.sh
```

Script backup trước, cập nhật image/migration rồi kiểm tra readiness. Với Agent
từ xa, thử **Update Agent** trên một server canary trước khi cập nhật hàng loạt.
