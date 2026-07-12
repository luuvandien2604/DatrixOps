# DatrixOps — Database Schema

> Tài liệu này mô tả thiết kế cơ sở dữ liệu. Chỉ tạo migration khi implement module tương ứng.

## Nguyên tắc

- Một PostgreSQL duy nhất cho mọi dữ liệu.
- Thêm bảng mới khi implement module mới. Không tạo trước.
- Primary key dùng UUID (`gen_random_uuid()`).
- Timestamp dùng `TIMESTAMPTZ` (timezone-aware).
- Tên bảng: số ít (`metric`, không phải `metrics`). Ngoại trừ khi convention Go/SQL yêu cầu khác.

---

## Core Tables (Sprint 2 — Module auth + server)

### users

| Column | Type | Constraints | Mô tả |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| email | VARCHAR(255) | UNIQUE, NOT NULL | |
| password_hash | VARCHAR(255) | NOT NULL | Bcrypt |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

### refresh_tokens

| Column | Type | Constraints | Mô tả |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| user_id | UUID | FK → users.id, NOT NULL | |
| token | VARCHAR(512) | UNIQUE, NOT NULL | Opaque token |
| expires_at | TIMESTAMPTZ | NOT NULL | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |

### servers

| Column | Type | Constraints | Mô tả |
| :--- | :--- | :--- | :--- |
| id | UUID | PK, DEFAULT gen_random_uuid() | |
| user_id | UUID | FK → users.id, NOT NULL | |
| name | VARCHAR(255) | NOT NULL | Tên hiển thị |
| ip_address | VARCHAR(45) | | IPv4 hoặc IPv6 |
| agent_token | VARCHAR(255) | UNIQUE, NOT NULL | Agent xác thực bằng token này |
| status | VARCHAR(20) | DEFAULT 'offline' | online / offline |
| os_info | JSONB | | { os, kernel, hostname, arch, ... } |
| created_at | TIMESTAMPTZ | DEFAULT NOW() | |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() | Heartbeat cập nhật field này |

---

## Monitoring Tables (Sprint 3 — Module metric)

### metrics

Một bảng duy nhất cho tất cả system metrics. Tối ưu sau khi cần.

| Column | Type | Constraints | Mô tả |
| :--- | :--- | :--- | :--- |
| id | BIGSERIAL | PK | Auto-increment cho hiệu năng insert |
| server_id | UUID | FK → servers.id, NOT NULL | |
| cpu_usage | REAL | | Phần trăm (0–100) |
| memory_total | BIGINT | | Bytes |
| memory_used | BIGINT | | Bytes |
| memory_usage | REAL | | Phần trăm |
| disk_total | BIGINT | | Bytes |
| disk_used | BIGINT | | Bytes |
| disk_usage | REAL | | Phần trăm |
| load_1 | REAL | | Load average 1 phút |
| load_5 | REAL | | Load average 5 phút |
| load_15 | REAL | | Load average 15 phút |
| collected_at | TIMESTAMPTZ | NOT NULL | Thời điểm Agent thu thập |

**Index:**

```sql
CREATE INDEX idx_metrics_server_time ON metrics (server_id, collected_at DESC);
```

---

## Future Tables (Chỉ tạo khi implement module)

Các bảng dưới đây là **thiết kế dự kiến**, không tạo migration cho đến khi bắt đầu code module tương ứng.

### containers (Module docker)

| Column | Type | Mô tả |
| :--- | :--- | :--- |
| id | UUID | PK |
| server_id | UUID | FK → servers.id |
| container_id | VARCHAR(64) | Docker container ID |
| name | VARCHAR(255) | Container name |
| image | VARCHAR(255) | Image name:tag |
| status | VARCHAR(50) | running, stopped, exited |
| collected_at | TIMESTAMPTZ | |

### websites (Module website)

| Column | Type | Mô tả |
| :--- | :--- | :--- |
| id | UUID | PK |
| user_id | UUID | FK → users.id |
| url | VARCHAR(2048) | URL to check |
| expected_status | INT | Expected HTTP status (200) |
| check_interval_seconds | INT | Check interval |
| status | VARCHAR(20) | up / down |
| last_response_time_ms | INT | Latency |
| last_checked_at | TIMESTAMPTZ | |

### ssl_checks (Module ssl)

| Column | Type | Mô tả |
| :--- | :--- | :--- |
| id | UUID | PK |
| website_id | UUID | FK → websites.id |
| issuer | VARCHAR(255) | Certificate issuer |
| valid_from | TIMESTAMPTZ | |
| valid_to | TIMESTAMPTZ | |
| last_checked_at | TIMESTAMPTZ | |

### alerts (Module alert)

| Column | Type | Mô tả |
| :--- | :--- | :--- |
| id | UUID | PK |
| user_id | UUID | FK → users.id |
| server_id | UUID | FK → servers.id (nullable) |
| metric_type | VARCHAR(50) | cpu_usage, memory_usage, disk_usage |
| condition | VARCHAR(10) | gt, lt, eq |
| threshold | REAL | Ngưỡng |
| duration_seconds | INT | Phải vi phạm liên tục bao lâu |
| channel | VARCHAR(20) | telegram, discord, email |
| channel_config | JSONB | { chat_id, webhook_url, ... } |
| status | VARCHAR(20) | ok, pending, firing, resolved |
| enabled | BOOLEAN | DEFAULT true |
| created_at | TIMESTAMPTZ | |

---

## Data Retention (Tương lai)

Khi bảng `metrics` quá lớn:
- Cronjob xóa dữ liệu chi tiết > 30 ngày.
- Tùy chọn: downsample thành dữ liệu trung bình theo giờ trước khi xóa.
- Chưa implement ở MVP.
