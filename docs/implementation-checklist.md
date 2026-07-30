# DatrixOps implementation checklist

Updated from source audit on 2026-07-30. `[x]` means implemented in source,
`[~]` means partial or awaiting end-to-end proof, `[ ]` means missing, and
`[!]` means intentionally disabled/deferred.

## P0 — releasable monitoring core

- [x] Required secrets and public URL validation; no production secret fallback.
- [x] Full Compose topology: gateway, frontend, backend, worker and PostgreSQL.
- [x] Internal PostgreSQL/Backend networking, health checks, named volumes and log rotation.
- [x] One-time initial setup wizard and locked public registration.
- [x] Expiring, one-time, hashed Agent enrollment token.
- [x] Unique post-enrollment Agent credential stored hashed.
- [x] Dynamic self-hosted installer URLs; no runtime production-domain dependency.
- [x] Website checks with trusted TLS, bounded concurrency and failure classification.
- [x] Website status/latency/failure history.
- [x] Alert dedup, durable condition duration and recovery for CPU/RAM/disk/offline.
- [x] Telegram, Discord, SMTP email and HMAC system webhooks.
- [x] Raw metrics and operational retention cleanup.
- [x] Transactional versioned migration registry with immutable checksums.
- [x] Backup, clean-host-aware restore, upgrade and uninstall scripts.
- [x] Signed multi-platform Agent artifact/checksum release flow.
- [x] CI source checks, race tests, Docker build, secret and dependency scanning.
- [x] Required end-user documentation.
- [x] Isolated empty-volume E2E on Ubuntu 25.04: setup, locked registration, login, Agent enrollment, heartbeat, real metrics, website check, offline duration, dedup and recovery.
- [x] In-place restore and second clean Docker project/volume restore on Ubuntu 25.04.
- [~] Clean Ubuntu 24.04 install and full E2E run.
- [~] Restore test on a separate clean host.
- [~] Hosted CI and tagged release workflow run.

## P1 — production stability

- [ ] Five-minute and hourly metrics downsampling.
- [ ] Full metrics set: load, iowait, steal, swap, inode, network error/drop.
- [ ] Incident records with acknowledge, note and timeline.
- [ ] Alert maintenance, silence, cooldown, repeat and flapping protection.
- [ ] Website/SSL/service/container alert rule types.
- [ ] Unified notification delivery history and connection test for all providers.
- [~] ADMIN/OPERATOR/VIEWER route enforcement exists; administrator-managed user/role lifecycle is incomplete.
- [~] Self-monitoring: API/worker health and worker heartbeat exist; status dashboard is missing.
- [~] Agent update: signature/checksum/platform/atomic replace exist; rollback/history E2E is missing.
- [ ] Agent credential rotation and explicit revoke UI.
- [~] Docker monitoring and inventory expansion.

## P2 — advanced, default off

- [!] `ENABLE_WEB_TERMINAL=false`
- [!] `ENABLE_REMOTE_SCRIPTS=false`
- [!] `ENABLE_SERVICE_CONTROLS=false`
- [!] `ENABLE_READ_ONLY_LOGS=false`
- [~] Cron telemetry.
- [~] Windows/macOS Agent support (secondary to Linux headless).

These features must not delay or weaken the monitoring core. Arbitrary shell,
writable file manager and cross-host actions remain out of scope until a
separate security review.

## Verification commands

```bash
(cd backend && go test ./... && go test -race ./... && go vet ./...)
(cd agent && go test ./... && go test -race ./... && go vet ./...)
(cd frontend && npm ci && npm run lint && npx tsc --noEmit --incremental false && npm run build)
docker compose --env-file .env -f docker-compose.yml config
docker compose --env-file .env -f docker-compose.yml build --no-cache
```

Do not mark the P0 E2E/restore items complete without recorded results from a
clean Ubuntu 24.04 host.

The latest isolated run and its remaining limitations are recorded in
[`E2E-REPORT-2026-07-30.md`](E2E-REPORT-2026-07-30.md).
