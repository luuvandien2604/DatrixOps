# DatrixOps AI Agent Guidelines & Architecture Reference

## Overview
This document contains system guidelines, design principles, and architectural standards for AI agents operating on the DatrixOps codebase.

---

## 1. Network Quality Diagnostics Architecture

### 1.1 Design Principles
- **No Hard-Coded Target IPs**: Diagnostic targets (host, port, tag, probe method, alert thresholds) are stored in the database (`network_targets`), managed by users via the control plane API.
- **Dynamic Tag Grouping**: Targets are grouped dynamically by user-defined `tag` (e.g., `Trong nước`, `Quốc tế`, `DNS`, `Database`). There are no fixed 3-pillar silos.
- **Optional Gateway Uplink**: The local gateway probe is optional (`is_gateway = true`). Gateway probes dynamically resolve the agent host's default gateway. If not configured, `gateway` in the diagnostic report is `nil`/omitted.
- **Strict Protocol Separation**: ICMP probes measure packet loss and round-trip latency; TCP probes measure socket connection latency without packet loss percentage (`packet_loss: null`). Metrics across distinct protocols are never averaged or combined into mixed aggregates.
- **Threshold Fallbacks**:
  - Default Fallback Constants (when target thresholds are omitted or `0`):
    - Standard Targets: Warning = `50.0ms`, Critical = `150.0ms`, Packet Loss Critical = `20.0%`.
    - Gateway Targets: Warning = `20.0ms`, Critical = `80.0ms`, Packet Loss Critical = `20.0%`.
  - Status Hierarchy: `critical` takes precedence over `warning`, which takes precedence over `optimal`.

### 1.2 Two-Tier Frontend Interface
1. **Centralized Hub (`/dashboard/network`)**:
   - Sole location for target CRUD (create, update, delete).
   - Multi-agent batch assignment (`agent_ids: []string`).
   - Preset catalog (Cloudflare, Google Public DNS, VN Telco DNS, Local Gateway).
   - Multi-agent cross-filtering and search.
   - Fleet-wide Tag Health Overview (`GetNetworkQualityOverview`) to detect wide-area ISP/transit incidents.
   - Single target on-demand probe (`POST /api/v1/network-targets/{id}/test-now`).
2. **Agent Detail View (`/dashboard/servers/[id]` tab `network`)**:
   - Renamed to "Network Quality".
   - Strictly **read-only** (no CRUD creation forms).
   - Displays gateway uplink card (if configured) + dynamic tag group cards.
   - Target breakdown table with quick filter by tag.
   - In-context modal with latency & packet loss time-series charts.
   - "Quản lý targets" action button redirecting to `/dashboard/network?agent_id=${params.id}`.

### 1.3 Database Schema & Historical Tracking
- **`network_targets`**: Stores target configuration per agent (`agent_id`, `name`, `host`, `port`, `tag`, `probe_method`, `probes_per_run`, `alert_latency_warning_ms`, `alert_latency_critical_ms`, `alert_loss_critical_pct`, `is_gateway`, `enabled`).
- **`network_target_results`**: Time-series log storing probe run metrics (`target_id`, `agent_id`, `status`, `latency_ms`, `packet_loss`, `probes_total`, `probes_success`, `probes_failed`, `error_message`, `probed_at`).
- **Future Maintenance Notes**:
  - **Data Retention**: An automated cleanup cron job or retention worker should periodically prune records older than $N$ days (e.g. 14-30 days) from `network_target_results`.
  - **History Downsampling**: `GetNetworkTargetHistory` currently enforces a safe point limit (`LIMIT 150`). When extended historical time ranges (30d+) are needed, bucket aggregation / downsampling (`time_bucket` or step resolution) should be applied.

### 1.4 Container & OS Compatibility
- For Alpine Linux agents running inside minimal Docker containers, `iputils` is included in the backend Dockerfile, and ping output parsing regex supports both GNU ping (`rtt min/avg/max/mdev`) and BusyBox ping (`round-trip min/avg/max`).

---

## 2. Coding Guidelines
- **Backend (Go)**:
  - Keep business logic in `internal/core/server/service.go` and data persistence in `repository.go`.
  - Use transaction blocks when inserting batch targets.
  - Run `go test -v -race ./...` before finalizing changes.
- **Frontend (Next.js / React)**:
  - Use Vanilla CSS and Tailwind utilities matching the project's CSS variables (`var(--background-card)`, `var(--border-color)`, `var(--color-muted)`).
  - Use `react-hot-toast` for notifications.
  - Client components using `useSearchParams()` must be wrapped with `<Suspense>` to support Next.js static prerendering.
