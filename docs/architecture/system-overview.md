# DatrixOps — System Overview

> **Build small. Design for growth.**
> **Only implement what you need today. Design so tomorrow is easy.**

## 1. DatrixOps là gì?

DatrixOps là một **công cụ quản lý hạ tầng cá nhân** (Personal Infrastructure Manager) dành cho những người quản lý một hoặc nhiều VPS/Cloud Server. Thay vì phải SSH vào từng máy để kiểm tra CPU, RAM, Disk, Docker containers hay SSL certificates, DatrixOps tập trung tất cả vào **một dashboard duy nhất**.

**Mục tiêu:** Xây một công cụ mà chính mình sẽ dùng mỗi ngày.

**Đây KHÔNG phải:**
- Datadog, Grafana, hay Prometheus clone.
- Sản phẩm SaaS multi-tenant.
- Hệ thống phân tán microservices.

**Đây LÀ:**
- Công cụ cá nhân, deploy trên cloud server của chính mình.
- Một binary Go duy nhất cho API, một binary Go duy nhất cho Agent.
- Một PostgreSQL duy nhất cho mọi dữ liệu.

---

## 2. Các thành phần (Components)

Hệ thống có đúng **4 thành phần**:

### 2.1. Core API (Go — Single Binary)

Chạy trên cloud server chính. Đảm nhận mọi thứ:

- **REST API** phục vụ Dashboard (xác thực, quản lý server, trả dữ liệu).
- **Ingestion API** nhận dữ liệu từ Agent (`POST /api/v1/metrics`).
- **Background Jobs** (Scheduler) chạy trong cùng process: check SSL, ping website, đánh giá alert rules.
- **Health/Ready/Version** endpoints cho monitoring chính nó.

Sau này khi cần mới tách Scheduler ra process riêng.

### 2.2. Agent (Go — Single Binary)

Một file thực thi duy nhất, cài đặt trên mỗi VPS cần giám sát. Agent:

- Thu thập thông số hệ thống (CPU, RAM, Disk, Load Average, Uptime).
- Gửi dữ liệu về Core API qua HTTPS mỗi N giây.
- Gửi heartbeat để Core API biết server còn sống.
- Gửi thông tin hệ điều hành (OS, Kernel, Hostname).

Agent phải cực kỳ nhẹ (< 20MB RAM, < 1% CPU) và không có dependency nào ngoài bản thân file binary.

### 2.3. Web Dashboard (Next.js)

Giao diện người dùng chạy trên trình duyệt:

- Đăng nhập / Đăng ký.
- Xem danh sách servers (online/offline).
- Xem biểu đồ CPU, RAM, Disk theo thời gian.
- Quản lý alert rules, xem trạng thái SSL, websites.

### 2.4. PostgreSQL

Một database duy nhất lưu trữ mọi thứ: users, servers, metrics, containers, alerts, SSL checks, websites. Không cần thêm database khác ở quy mô này.

---

## 3. Data Flow (Luồng dữ liệu)

### 3.1. Agent → Core API (Push Metrics)

```text
Agent (trên VPS)
    │
    │  HTTP POST /api/v1/metrics
    │  Header: Authorization: Bearer <agent_token>
    │  Body: { cpu, memory, disk, load, ... }
    │
    ▼
Core API
    │
    │  Validate token → tìm server_id
    │  Insert vào bảng metrics
    │
    ▼
PostgreSQL (bảng metrics)
```

Chu kỳ: mỗi 10–30 giây (configurable).

### 3.2. Dashboard → Core API (Query Data)

```text
Browser (Next.js)
    │
    │  GET /api/v1/servers/{id}/metrics?from=...&to=...
    │  Header: Authorization: Bearer <jwt_token>
    │
    ▼
Core API
    │
    │  Verify JWT → query PostgreSQL
    │  Trả JSON response
    │
    ▼
Dashboard render biểu đồ (Recharts)
```

### 3.3. Scheduler (Background Jobs — chạy trong Core API)

```text
Core API (Background Goroutine)
    │
    │  Mỗi 5 phút:
    │  ├── Check SSL expiration cho các websites đã đăng ký
    │  ├── HTTP ping websites, đo latency
    │  ├── So sánh metrics với alert rules
    │  └── Gửi notification nếu vi phạm (Telegram, Discord)
    │
    ▼
PostgreSQL (cập nhật ssl_checks, websites, alerts)
```

### 3.4. Heartbeat (Agent liveness)

```text
Agent gửi heartbeat mỗi 60 giây
    │
    ▼
Core API cập nhật servers.status = 'online', servers.updated_at = NOW()
    │
    ▼
Scheduler: Nếu updated_at > 3 phút trước → status = 'offline' → alert
```

---

## 4. Kiến trúc Code (Code Architecture)

### 4.1. Ba lớp (Three Layers)

Mỗi module tuân theo:

```text
Handler (HTTP layer)
    │  Nhận request, parse input, gọi Service, trả response
    │  KHÔNG truy cập DB trực tiếp
    ▼
Service (Business logic)
    │  Xử lý logic nghiệp vụ
    │  KHÔNG biết HTTP, KHÔNG trả HTTP status
    │  Trả error, Handler quyết định status code
    ▼
Repository (Data access)
    │  Query PostgreSQL
    │  KHÔNG biết DTO, chỉ trả data từ DB
    ▼
PostgreSQL
```

### 4.2. Dependency Injection

Không dùng biến global. Mọi dependency được truyền qua `Container`:

```go
type Container struct {
    DB     *pgxpool.Pool
    Logger *slog.Logger
    Config *Config
}
```

Mỗi module nhận `*Container` khi đăng ký routes.

### 4.3. Module Independence

- Module không import module khác.
- Nếu cần chia sẻ: dùng `platform/` (infrastructure) hoặc `shared/` (types/interfaces).
- Thêm module mới = thêm thư mục mới, không sửa module cũ.

---

## 5. Tổ chức thư mục (Directory Structure)

```text
DatrixOps/
│
├── backend/                       # Core API (Go)
│   ├── cmd/api/main.go            # Entrypoint
│   ├── internal/
│   │   ├── core/                  # Module nền tảng (auth, server)
│   │   ├── modules/               # Module tính năng (metric, docker, ssl...)
│   │   ├── platform/              # Hạ tầng (config, database, logger, middleware, response)
│   │   └── shared/                # Types/interfaces dùng chung (khi cần)
│   └── migrations/
│
├── agent/                         # Agent (Go)
│   ├── cmd/agent/main.go
│   └── internal/
│       ├── collectors/            # cpu/, memory/, disk/, heartbeat/
│       ├── sender/
│       └── config/
│
├── frontend/                      # Dashboard (Next.js)
│   └── src/
│       ├── app/
│       ├── modules/
│       ├── components/
│       ├── lib/
│       └── hooks/
│
├── docs/                          # Tài liệu
├── docker-compose.yml             # PostgreSQL
└── README.md
```

---

## 6. Bảo mật (Security)

- **Agent ↔ API:** Mỗi server có một `agent_token` duy nhất. Agent gửi token trong header `Authorization: Bearer <token>`.
- **Dashboard ↔ API:** JWT + Refresh Token. Access token ngắn hạn (15 phút), refresh token dài hạn (7 ngày).
- **Database:** PostgreSQL không expose port ra internet, chỉ giao tiếp nội bộ trong Docker network.
- **HTTPS:** Caddy hoặc Nginx reverse proxy cấp SSL tự động (Let's Encrypt).
- **Password:** Bcrypt hash, không bao giờ lưu plaintext.

---

## 7. Backward Compatibility

> **Không sửa API cũ nếu chưa thật sự cần. Nếu phải thay đổi, tạo API mới hoặc tăng version.**

Mọi API bắt đầu bằng `/api/v1/`. Frontend và Agent luôn hoạt động ổn định sau mỗi lần deploy backend.
