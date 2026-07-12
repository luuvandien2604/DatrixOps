# ADR-003: Why Monorepo?

## Status

Accepted

## Context

Dự án có 3 thành phần: Backend (Go), Agent (Go), Frontend (Next.js). Có thể tổ chức thành:

- 3 repositories riêng biệt.
- 1 monorepo chứa tất cả.

## Decision

Chọn **Monorepo** — một repository duy nhất chứa backend, agent, frontend, docs.

## Reasons

- **Một người phát triển:** Không cần overhead quản lý 3 repos, 3 CI pipelines, 3 PR processes.
- **Atomic changes:** Khi thay đổi API format, có thể sửa backend + frontend + docs trong cùng một commit.
- **Shared context:** Docs, docker-compose, CI/CD nằm cùng một nơi.
- **Đơn giản:** `git clone` một lần là có toàn bộ dự án.

## Consequences

- CI/CD cần config để chỉ build phần thay đổi (hoặc build tất cả — chấp nhận được ở quy mô nhỏ).
- Nếu sau này có nhiều người, có thể cần CODEOWNERS hoặc tách repo. Nhưng chưa cần lo bây giờ.
