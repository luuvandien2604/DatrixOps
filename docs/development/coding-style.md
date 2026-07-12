# DatrixOps — Coding Style & Conventions

> Tài liệu này quy định các conventions dùng trong toàn bộ dự án. Mục tiêu: giữ chất lượng code ổn định khi số module tăng lên.

---

## 1. Go (Backend & Agent)

### Architecture Rules

| Quy tắc | Giải thích |
| :--- | :--- |
| Handler không truy cập DB | Handler gọi Service, Service gọi Repository |
| Service không trả HTTP status | Service trả `error`, Handler quyết định HTTP status |
| Repository không biết DTO | Repository chỉ trả raw data / entity từ DB |
| Module không import module khác | Dùng `platform/`, `shared/`, hoặc interface |
| `platform/` chỉ chứa infra code | database, logger, config, middleware, response |
| `shared/` không chứa business logic | Chỉ types và interfaces dùng chung |
| Không dùng biến global | Truyền dependency qua `Container` |
| Không `panic()` trong handler | Trả error response chuẩn |

### Naming Conventions

```go
// Package names: lowercase, singular
package auth
package server
package metric

// Struct names: PascalCase
type Server struct {}
type MetricRepository struct {}

// Interface names: verb-er hoặc mô tả hành vi
type ServerRepository interface {}
type TokenGenerator interface {}

// Function/method: PascalCase (exported), camelCase (unexported)
func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {}
func (s *Service) validateEmail(email string) error {}

// File names: lowercase, underscore
handler.go
service.go
repository.go
routes.go
```

### Error Handling

```go
// ✅ Trả error có context
return fmt.Errorf("find server by id %s: %w", id, err)

// ❌ Không swallow error
result, err := repo.FindByID(id)
if err != nil {
    log.Println(err) // ← KHÔNG. Phải return error
}

// ✅ Custom error types khi cần phân biệt
var ErrNotFound = errors.New("not found")
var ErrConflict = errors.New("conflict")
```

### API Response

Mọi handler đều dùng helper functions từ `platform/response/`:

```go
// ✅
response.Success(w, http.StatusOK, data)
response.Error(w, http.StatusNotFound, "SERVER_NOT_FOUND", "Server not found")

// ❌ Không tự viết json.Marshal trong handler
```

### Route Registration

Mỗi module có file `routes.go` với function:

```go
func RegisterRoutes(mux *http.ServeMux, c *Container) {
    repo := NewRepository(c.DB)
    svc  := NewService(repo)
    h    := NewHandler(svc)

    mux.HandleFunc("POST /api/v1/auth/login", h.Login)
    mux.HandleFunc("POST /api/v1/auth/register", h.Register)
}
```

`main.go` chỉ gọi `RegisterRoutes()` cho từng module.

### Dependency Injection

```go
type Container struct {
    DB     *pgxpool.Pool
    Logger *slog.Logger
    Config *Config
}

// Module nhận Container khi đăng ký routes
// KHÔNG dùng biến global để truy cập DB hoặc Config
```

---

## 2. TypeScript / Next.js (Frontend)

### File & Folder Naming

```text
// Components: PascalCase
ServerCard.tsx
DashboardLayout.tsx

// Hooks: camelCase, prefix "use"
useServers.ts
useAuth.ts

// Lib/utils: camelCase
apiClient.ts
formatBytes.ts

// Module folder: singular, lowercase
modules/dashboard/
modules/server/
modules/metric/
```

### Component Structure

```tsx
// ✅ Một component, một file
// ✅ Props interface khai báo rõ ràng
interface ServerCardProps {
  name: string;
  status: 'online' | 'offline';
  cpuUsage: number;
}

export function ServerCard({ name, status, cpuUsage }: ServerCardProps) {
  return (/* ... */);
}
```

### API Client

```typescript
// ✅ Centralized API client trong lib/
const response = await apiClient.get<Server[]>('/api/v1/servers');

// ❌ Không fetch trực tiếp trong component
```

---

## 3. SQL / Database

### Migration Files

```text
// Format: {timestamp}_{description}.sql
20260712_001_create_users.sql
20260712_002_create_servers.sql
20260713_001_create_metrics.sql
```

### SQL Style

```sql
-- ✅ UPPERCASE keywords
SELECT id, name, status
FROM servers
WHERE user_id = $1
ORDER BY created_at DESC;

-- ✅ Tên bảng, cột: lowercase, underscore
created_at
agent_token
os_info
```

---

## 4. Git Conventions

### Branch Naming

```text
main                    # Production-ready
feature/auth            # Tính năng mới
feature/metric          # Tính năng mới
fix/heartbeat-timeout   # Bug fix
docs/api-spec           # Tài liệu
```

### Commit Messages

```text
feat(auth): add login and register endpoints
feat(agent): implement cpu collector
fix(metric): correct disk usage calculation
docs(api): update rest-api specification
chore: update docker-compose postgresql version
```

Format: `type(scope): description`

Types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`

---

## 5. Module Definition of Done

Một module được coi là **hoàn thành** khi:

- [ ] Có migration (nếu module cần DB).
- [ ] Có API hoạt động (test được bằng cURL/Postman).
- [ ] Có test cơ bản (ít nhất happy path).
- [ ] Tài liệu cập nhật (Feature Spec trong `docs/features/`).
- [ ] Có giao diện (nếu liên quan frontend).
