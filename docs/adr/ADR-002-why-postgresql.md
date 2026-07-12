# ADR-002: Why PostgreSQL Only?

## Status

Accepted

## Context

Dự án cần lưu trữ: users, servers, metrics (time-series), containers, alerts, websites, SSL checks. Các lựa chọn:

- PostgreSQL + InfluxDB (TSDB riêng cho metrics).
- PostgreSQL + Prometheus (metrics riêng).
- PostgreSQL duy nhất cho mọi thứ.

## Decision

Chọn **một PostgreSQL duy nhất** cho mọi dữ liệu, bao gồm cả metrics.

## Reasons

- **Một DB duy nhất:** Không cần backup, maintain, vận hành thêm database thứ hai.
- **Đủ cho quy mô cá nhân:** Vài VPS, metrics mỗi 10-30 giây → vài trăm rows/phút. PostgreSQL xử lý dư sức.
- **Index hiệu quả:** `CREATE INDEX idx_metrics_server_time ON metrics(server_id, collected_at DESC)` đủ nhanh cho queries thông thường.
- **JSONB:** Lưu trữ dữ liệu semi-structured (os_info, channel_config) mà không cần thêm bảng.
- **Ecosystem:** pgx, sqlc, migration tools, monitoring — tất cả đều mature.

## Consequences

- Khi dữ liệu metrics quá lớn (>100M rows), cần chiến lược data retention (xóa dữ liệu cũ).
- Nếu sau này cần tối ưu, có thể thêm TimescaleDB (extension của PostgreSQL) mà không đổi stack.
- Không có InfluxDB hay Prometheus trong stack → đơn giản hơn nhưng thiếu built-in downsampling.
