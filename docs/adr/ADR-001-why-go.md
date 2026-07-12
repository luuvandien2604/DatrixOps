# ADR-001: Why Go?

## Status

Accepted

## Context

DatrixOps cần một ngôn ngữ cho Backend (Core API) và Agent. Các lựa chọn: Go, Node.js (TypeScript), Python, Rust.

Agent cần biên dịch thành một binary duy nhất, nhẹ, không dependency. Core API cần xử lý nhiều request đồng thời (Agent gửi metrics mỗi 10-30 giây).

## Decision

Chọn **Go** cho cả Backend và Agent.

## Reasons

- **Single binary:** `go build` tạo ra một file thực thi duy nhất, không cần runtime (Node, Python). Lý tưởng cho Agent.
- **Low resource usage:** Agent chạy < 20MB RAM, < 1% CPU.
- **Concurrency:** Goroutines xử lý nhiều request đồng thời hiệu quả hơn thread-based model.
- **Standard library mạnh:** `net/http` (Go 1.22+) đủ mạnh để xây REST API mà không cần framework.
- **Cross-compilation:** Dễ dàng build Agent cho Linux/Windows/macOS từ một máy duy nhất.
- **Ecosystem:** `pgx`, `sqlc`, `slog` đều là thư viện production-grade.
- **Industry adoption:** Rất nhiều công ty infrastructure/DevOps dùng Go (Docker, Kubernetes, Terraform, Prometheus).

## Consequences

- Phải học Go nếu chưa biết (nhưng Go rất dễ học).
- Không dùng Gin. Dùng `net/http` Go 1.22+ hoặc `chi` để giảm dependency.
