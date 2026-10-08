---
title: Network Quality Diagnostics
description: Measure ICMP/TCP latency, Gateway uplink, dynamic tag targets, and packet loss.
---

# Network Quality Diagnostics

DatrixOps provides continuous, multi-target network quality probing directly from your monitored servers. Instead of relying solely on external uptime checkers, DatrixOps lets each server actively diagnose its own network environment—measuring local gateway health, ISP transit latency, DNS resolution speed, and international packet loss.

---

## Key Concepts

### Dynamic Tag Grouping
Diagnostic targets are grouped dynamically by user-defined **tags** rather than rigid silos. For example, you can create tags such as:
- `Domestic` / `Trong nước`: Local cloud providers, domestic CDN points, and local DNS.
- `International` / `Quốc tế`: Global nodes in Singapore, Tokyo, Europe, or the United States.
- `Database` / `Internal`: Internal cluster addresses, Redis caches, or private VPN endpoints.

### Protocol Separation (ICMP vs. TCP)
- **ICMP Ping**: Measures round-trip time (RTT latency in ms) and calculates **packet loss percentage (%)**.
- **TCP Socket Probing**: Tests connection handshake speed against a specific port (e.g., port `443` for web or `3306` for MySQL). TCP tests report pure latency without mixing packet loss percentages.

### Automatic Local Gateway Uplink
You can enable the **Local Gateway** probe (`is_gateway = true`). When enabled, the agent dynamically resolves the host's default gateway IP address on each cycle, allowing you to instantly determine whether an incident is caused by local network card/switch degradation or ISP transit issues.

---

## Centralized Network Hub (`/dashboard/network`)

The **Network Quality** hub is the central location for configuring and reviewing network probes across your entire fleet.

### 1. Preset Catalog
When adding new targets, you can pick from popular one-click presets:
- **Local Gateway**: Dynamically probes the default router uplink.
- **Cloudflare DNS (`1.1.1.1`)**: Global Anycast DNS latency.
- **Google Public DNS (`8.8.8.8`)**: Reliable baseline ping.
- **Vietnam Telco DNS**: VNPT (`203.162.4.191`), Viettel (`203.113.131.1`), FPT (`210.245.24.20`).

### 2. Managing Targets (Create, Edit, Delete)
Click **Add Target** to configure a diagnostic probe:
- **Target Name**: Descriptive name (e.g., `Singapore Edge` or `Production Gateway`).
- **Host / IP**: Hostname or IP address (e.g., `sg.speedtest.net` or `1.1.1.1`).
- **Port**: Required for TCP probes (e.g., `443`). Omitted for ICMP ping.
- **Tag**: Custom category tag (e.g., `Domestic`, `International`, `DNS`).
- **Probe Method**: Choose `ICMP (Ping)` or `TCP (Socket)`.
- **Probes per Run**: Number of packets sent per check (default: `5`).
- **Alert Thresholds**:
  - **Latency Warning**: e.g., `50 ms`.
  - **Latency Critical**: e.g., `150 ms`.
  - **Packet Loss Critical**: e.g., `20%`.
- **Target Agents**: Select specific servers or assign to all agents in bulk.

### 3. On-Demand "Test Now"
To test network health immediately without waiting for the next scheduled probe interval, click the **Test Now** button next to any target. The agent performs the probe on-demand and displays real-time latency and packet loss.

---

## Per-Server Network Quality View

Navigate to **Servers → [Select Server] → Network Quality** to view diagnostic health for a specific machine:

- **Gateway Uplink Card**: Displays real-time gateway latency and link status if configured.
- **Dynamic Tag Cards**: Grouped summaries showing average latency and worst-case packet loss per tag.
- **Target Breakdown Table**: Lists all active probes on this machine with status indicators (`optimal`, `warning`, `critical`).
- **Interactive Time-Series Charts**: Click on any target row to open historical graphs showing round-trip latency and packet loss over time.
- **Manage Targets Shortcut**: Click the **Manage Targets** button to jump directly to the Centralized Hub filtered by this server.

---

## Status Hierarchy & Thresholds

Each probe result is evaluated against configured thresholds:

| Status | Meaning | Standard Fallback | Gateway Fallback |
| :--- | :--- | :--- | :--- |
| **Optimal** | Latency and packet loss within normal limits | `< 50 ms`, `0% loss` | `< 20 ms`, `0% loss` |
| **Warning** | Elevated latency detected | `> 50 ms` | `> 20 ms` |
| **Critical** | Excessive latency or severe packet loss | `> 150 ms` or `> 20% loss` | `> 80 ms` or `> 20% loss` |

> [!TIP]
> If a server reports high latency on international targets but the Local Gateway uplink card is green (< 5 ms), the issue is almost certainly an international undersea cable or ISP peering problem, not an issue with your local server.

---

## Next Steps

- Configure alerts for high packet loss in [Alerts & Notifications](/docs/features/alerts).
- Monitor web application latency in [Website & SSL Monitoring](/docs/features/uptime).
