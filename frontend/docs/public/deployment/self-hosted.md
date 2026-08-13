---
title: "Triển khai Self-Hosted"
description: "Cài đặt và vận hành DatrixOps Community Edition trên hạ tầng của bạn."
---

DatrixOps Community Edition gồm một **Control Plane** tự host và Agent cài trên
từng server cần giám sát. PostgreSQL, metrics, audit history và cấu hình nằm trên
hạ tầng do bạn quản lý.

## Cài Control Plane

Máy chủ khuyến nghị: Linux, 1 CPU, 2 GB RAM, 20 GB disk và TCP 7800 inbound. Chạy:

```bash
curl -fsSL https://raw.githubusercontent.com/luuvandien2604/DatrixOps/main/deploy/bootstrap.sh | sudo bash
```

Installer chuẩn bị Docker, Caddy, secret, signed Agent artifacts, database
migration và container. Installer tự tạo administrator đầu tiên và in thông
tin đăng nhập. Mở `http://<IP>:7800/login` để đăng nhập.

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
