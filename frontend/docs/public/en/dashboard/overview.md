---
title: "Dashboard Overview"
description: "Understand server state, telemetry metrics (CPU, RAM, disk, network), and navigation areas in DatrixOps."
---

The DatrixOps Dashboard aggregates real telemetry reported periodically by Datrix Agents and persisted in PostgreSQL. It never fabricates simulated data during agent offline periods.

---

## 1. Server States

- **Online (Green):** The backend received a valid heartbeat within the expected time window (typically 30 - 60 seconds).
- **Offline (Gray/Red):** No heartbeat received within the threshold. Historical data is preserved intact.
- **Timeline Gaps:** Periods when an agent was offline are rendered as clean gaps on time-series charts, clearly indicating when connectivity ceased and resumed.

---

## 2. Resource Telemetry Metrics

| Metric | Meaning & Interpretation |
| :--- | :--- |
| **CPU Usage** | Instantaneous overall system CPU load percentage. Transient spikes should be evaluated against historical averages. |
| **RAM Utilization** | Actual memory in use compared to total physical memory detected by the Agent. |
| **Disk Capacity** | Root filesystem capacity percentage and absolute gigabytes utilized. |
| **Disk I/O** | Read/write throughput rates over time (MB/s or IOPS), distinct from disk capacity. |
| **Network Throughput** | Inbound (Rx) and outbound (Tx) byte rates derived between consecutive probe samples. |

---

## 3. Navigation Sections

1. **Servers (`/dashboard/servers`):** Fleet overview displaying server IP, OS, resource utilization cards, and quick actions.
2. **Network Quality (`/dashboard/network`):** Central hub for network diagnostics, ICMP/TCP probe targets, and fleet-wide ISP health.
3. **Websites (`/dashboard/websites`):** Availability (Uptime) monitoring and SSL/TLS certificate expiry tracking.
4. **Alert Center (`/dashboard/alerts`):** Alert rule definitions, active incidents, and Telegram/Discord/Email channel configurations.
5. **Audit Logs (`/dashboard/audit`):** Immutable operational audit trail of user actions.

---

## 4. Server Detail Tabs (`/dashboard/servers/[id]`)

Clicking any server provides deep-dive contextual tabs:
- **Overview:** Operating system, kernel, agent version, system uptime, and CPU specs.
- **Resources:** Time-series charts for CPU, RAM, Disk, Disk I/O, and Network over 1h, 24h, and 7d horizons.
- **Network Quality:** Local gateway uplink status, dynamic tag cards, and historical latency/loss charts.
- **Docker:** Discovered container states with remote start/stop/restart controls.
- **Processes:** Live top processes sorted by CPU and memory consumption.
- **Services:** Native OS service controls (systemd, launchd, Windows services).
- **Web Terminal:** Browser-based interactive shell connected via secure Reverse WebSockets.
