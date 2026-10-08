---
title: "Network Quality Diagnostics"
description: "Architecture of ICMP/TCP latency measurements, Gateway uplink, dynamic tag grouping, and line stability monitoring."
---

The **Network Quality Diagnostics** system in DatrixOps enables real-time monitoring of round-trip latency, packet loss percentage, and network stability across monitored servers and fleet-wide ISP infrastructure.

---

## 1. Core Architectural Principles

- **Dynamic Target Configuration (No Hardcoded IPs):** All probe targets (host, port, group tag, probe method, alert thresholds) are stored in the database (`network_targets`) and managed directly from the web control plane.
- **Strict Protocol Separation:**
  - **ICMP Ping:** Measures round-trip time (RTT) and packet loss percentage (`packet_loss: %`).
  - **TCP Socket Connect:** Measures socket connection latency to specific service ports (e.g. 443, 53, 3306) without synthesizing artificial packet loss.
- **Dynamic Tag Grouping:** Targets can be tagged flexibly: `Domestic`, `International`, `DNS`, `Database`, `Gateway`, etc. The system automatically categorizes and renders organized cards.
- **Automated Local Gateway Uplink:** An optional gateway target (`is_gateway = true`) dynamically discovers the host agent's default routing gateway, instantly highlighting local switch or physical cable congestion.

---

## 2. Two-Tier Interface Model

### A. Centralized Network Hub (`/dashboard/network`)
The single administrative center for network diagnostic configuration:
1. **Target CRUD:** Create, edit, toggle, or delete targets.
2. **Batch Assignment:** Assign diagnostic targets to multiple agents simultaneously.
3. **Preset Catalog:** 1-click preset addition for common endpoints:
   - *Cloudflare DNS* (`1.1.1.1` - ICMP)
   - *Google Public DNS* (`8.8.8.8` - ICMP)
   - *VN Telco DNS* (VNPT, Viettel, FPT)
   - *Local Gateway Uplink* (Dynamically resolved gateway)
4. **On-demand Probe (Test Now):** Instantly trigger a probe on an individual target.
5. **Fleet-wide Tag Health:** Aggregated status across all nodes to detect transit or submarine cable incidents quickly.

### B. Agent Detail View (`/dashboard/servers/[id]` → tab `network`)
A strictly **read-only** context view:
- **Gateway Uplink Card:** Displays latency to the local gateway if configured.
- **Dynamic Tag Cards:** Grouped overview showing average latency and health status (*Optimal*, *Warning*, *Critical*).
- **Target Breakdown Table:** Filterable by tag and searchable by target name or host.
- **Time-Series Modal:** Click any target to inspect historical latency and packet loss trends.
- Quick link to manage targets on the centralized hub.

---

## 3. Alert Thresholds & Fallbacks

| Target Type | Warning Threshold | Critical Threshold | Packet Loss Critical |
| :--- | :---: | :---: | :---: |
| **Gateway Target** | `> 20.0 ms` | `> 80.0 ms` | `> 20.0 %` |
| **Standard Target** | `> 50.0 ms` | `> 150.0 ms` | `> 20.0 %` |

Status precedence hierarchy: `Critical` (Red) overrides `Warning` (Yellow), which overrides `Optimal` (Green).
