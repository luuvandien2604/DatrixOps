# DatrixOps — REST API Specification

> Tài liệu này mô tả toàn bộ API. Thêm endpoint khi implement module tương ứng.

## Conventions

### Base URL

```
/api/v1
```

### Response Format

Mọi response đều có cùng cấu trúc:

```json
// Success
{
  "success": true,
  "data": { ... },
  "error": null
}

// Success (list)
{
  "success": true,
  "data": [ ... ],
  "error": null
}

// Error
{
  "success": false,
  "data": null,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Email is required"
  }
}
```

### Authentication

- **Dashboard → API:** JWT trong header `Authorization: Bearer <access_token>`.
- **Agent → API:** Agent token trong header `Authorization: Bearer <agent_token>`.

### Error Codes

| Code | HTTP Status | Mô tả |
| :--- | :--- | :--- |
| VALIDATION_ERROR | 400 | Input không hợp lệ |
| UNAUTHORIZED | 401 | Thiếu hoặc sai token |
| FORBIDDEN | 403 | Không có quyền |
| NOT_FOUND | 404 | Resource không tồn tại |
| CONFLICT | 409 | Trùng lặp (email đã tồn tại) |
| INTERNAL_ERROR | 500 | Lỗi server |

---

## System Endpoints (Không cần auth)

### `GET /health`

Kiểm tra API có sống không.

**Response:** `200 OK`
```json
{ "status": "ok" }
```

### `GET /ready`

Kiểm tra API đã kết nối được database chưa.

**Response:** `200 OK` hoặc `503 Service Unavailable`
```json
{ "status": "ready", "database": "connected" }
```

### `GET /api/v1/version`

Thông tin phiên bản.

**Response:**
```json
{
  "success": true,
  "data": {
    "version": "0.1.0",
    "commit": "a1b2c3d",
    "build_time": "2026-07-12T14:00:00Z",
    "go_version": "go1.22.5"
  }
}
```

---

## Auth Module

### `POST /api/v1/auth/register`

Đăng ký tài khoản mới.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "created_at": "2026-07-12T14:00:00Z"
  }
}
```

**Errors:** `VALIDATION_ERROR`, `CONFLICT` (email đã tồn tại)

### `POST /api/v1/auth/login`

Đăng nhập, trả về access token + refresh token.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "opaque-token-string",
    "expires_in": 900
  }
}
```

**Errors:** `UNAUTHORIZED` (sai email/password)

### `POST /api/v1/auth/refresh`

Lấy access token mới bằng refresh token.

**Request:**
```json
{
  "refresh_token": "opaque-token-string"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOi...",
    "expires_in": 900
  }
}
```

**Errors:** `UNAUTHORIZED` (refresh token hết hạn hoặc không hợp lệ)

### `POST /api/v1/auth/logout`

Thu hồi refresh token.

**Headers:** `Authorization: Bearer <access_token>`

**Request:**
```json
{
  "refresh_token": "opaque-token-string"
}
```

**Response:** `200 OK`

---

## Server Module

### `GET /api/v1/servers`

Lấy danh sách servers của user.

**Headers:** `Authorization: Bearer <access_token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "VPS-Oracle",
      "ip_address": "1.2.3.4",
      "status": "online",
      "os_info": { "os": "Ubuntu 24.04", "kernel": "6.5.0" },
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

### `POST /api/v1/servers`

Thêm server mới. Hệ thống tự sinh `agent_token`.

**Headers:** `Authorization: Bearer <access_token>`

**Request:**
```json
{
  "name": "VPS-Oracle",
  "ip_address": "1.2.3.4"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "VPS-Oracle",
    "ip_address": "1.2.3.4",
    "agent_token": "generated-token-here",
    "status": "offline",
    "created_at": "..."
  }
}
```

### `GET /api/v1/servers/{id}`

Lấy thông tin chi tiết một server.

### `DELETE /api/v1/servers/{id}`

Xóa server (và toàn bộ metrics liên quan).

### `GET /api/v1/servers/{id}/cron-jobs`

Returns cron jobs discovered by the agent for a user-owned server. `last_run_at`,
`next_run_at`, and `last_status` remain absent until real execution telemetry is
available.

### `POST /api/v1/servers/{id}/tasks`

Queues an allowlisted remote task. Arbitrary shell commands are not accepted.

```json
{
  "type": "docker_logs",
  "payload": "{\"container_id\":\"api\"}",
  "idempotency_key": "logs-api-20260718T101600Z",
  "timeout_seconds": 60
}
```

`timeout_seconds` must be between 10 and 900 seconds. Reusing an idempotency key
for the same server returns the existing task instead of dispatching it twice.

Native service-control task types are `service_start`, `service_stop`,
`service_restart`, and `service_reload`. Their payload must identify a service
present in the latest agent-reported inventory:

```json
{
  "type": "service_restart",
  "payload": "{\"service_name\":\"nginx\",\"service_manager\":\"systemd\"}",
  "timeout_seconds": 90
}
```

Supported managers are `systemd`, `launchd`, and `windows-scm`. Generic reload
is unavailable for `windows-scm`.

### `POST /api/v1/servers/actions/update-agents`

Queues an `agent_update` task for every server owned by the authenticated user.
Servers that already have a pending or processing update are skipped. Tasks can
be claimed for 24 hours and use a 300-second execution timeout.

```json
{
  "success": true,
  "data": {
    "total": 8,
    "queued": 6,
    "skipped": 2,
    "tasks": ["task-uuid"]
  }
}
```

---

## Agent Ingestion API

### `POST /api/v1/agent/heartbeat`

Agent gửi heartbeat để báo server còn sống.

**Headers:** `Authorization: Bearer <agent_token>`

**Request:**
```json
{
  "os_info": {
    "os": "Ubuntu 24.04",
    "kernel": "6.5.0-44-generic",
    "hostname": "vps-oracle",
    "arch": "x86_64",
    "uptime_seconds": 1234567
  }
}
```

**Response:** `200 OK`

### `POST /api/v1/agent/metrics`

Agent gửi metrics định kỳ.

**Headers:** `Authorization: Bearer <agent_token>`

**Request:**
```json
{
  "cpu_usage": 15.4,
  "memory_total": 4294967296,
  "memory_used": 1811939328,
  "memory_usage": 42.1,
  "disk_total": 53687091200,
  "disk_used": 32748134400,
  "disk_usage": 61.0,
  "load_1": 0.52,
  "load_5": 0.48,
  "load_15": 0.45,
  "collected_at": "2026-07-12T14:00:00Z"
}
```

**Response:** `200 OK`

---

## Metric Module

### `GET /api/v1/servers/{id}/metrics`

Lấy metrics theo thời gian cho biểu đồ.

**Headers:** `Authorization: Bearer <access_token>`

**Query Params:**
- `from` (required): ISO 8601 timestamp
- `to` (required): ISO 8601 timestamp
- `interval` (optional): `1m`, `5m`, `1h`, `1d` (mặc định tự chọn dựa trên khoảng thời gian)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "collected_at": "2026-07-12T14:00:00Z",
      "cpu_usage": 15.4,
      "memory_usage": 42.1,
      "disk_usage": 61.0,
      "load_1": 0.52
    },
    { "..." : "..." }
  ]
}
```

### `GET /api/v1/servers/{id}/metrics/latest`

Lấy metrics mới nhất (cho dashboard overview).

---

## Future APIs (Chỉ implement khi tới module tương ứng)

### Website Module
- `GET /api/v1/websites`
- `POST /api/v1/websites`
- `DELETE /api/v1/websites/{id}`

### Docker Module
- `GET /api/v1/servers/{id}/containers`

### Alert Module
- `GET /api/v1/alerts`
- `POST /api/v1/alerts`
- `PUT /api/v1/alerts/{id}`
- `DELETE /api/v1/alerts/{id}`
