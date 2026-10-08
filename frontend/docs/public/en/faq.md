---
title: "Frequently Asked Questions"
description: "Answers to common questions regarding DatrixOps architecture, security, operations, and platform capabilities."
---

## 1. Does DatrixOps require any inbound ports (like SSH) open on monitored servers?

**No.** The Datrix Agent operates strictly on an **Outbound-only** model:
- The Agent initiates all outbound connections over HTTPS and Reverse WebSocket to the Control Plane.
- You do not need to open any incoming firewall ports on monitored client machines, including SSH port 22.
- Servers behind NAT, internal firewalls, or private enterprise VPCs connect seamlessly without port-forwarding.

---

## 2. Which operating systems and architectures are supported by the Agent?

The Datrix Agent is cross-compiled into native static binaries:
- **Linux:** `amd64` (x86_64) and `arm64` (aarch64) — Compatible with Ubuntu, Debian, CentOS, RHEL, AlmaLinux, Rocky Linux, and Alpine Linux.
- **macOS:** Intel (`amd64`) and Apple Silicon (`arm64`).
- **Windows:** `amd64` (running natively as a Windows Service).

---

## 3. How frequently is monitoring telemetry collected and updated?

- **Heartbeat & System Metrics (CPU, RAM, Disk, Network):** Dispatched every 5 to 10 seconds.
- **Detailed Snapshots (Processes, OS Services, Docker Containers):** Collected and reported every 60 seconds.
- **Network Quality Diagnostics:** Measurement intervals are user-configurable per target group (typically 10s to 60s).

---

## 4. Why are there gaps in the charts instead of a continuous line?

DatrixOps is engineered to report **accurate, unmanipulated metrics**. When a server is shut down, reboots, or loses internet connectivity, the system renders an intentional gap on the timeline. This ensures engineering teams can identify the exact onset and resolution window of an outage rather than looking at interpolated artificial metrics.

---

## 5. Where is monitoring data stored? Is any telemetry sent externally?

In the **Community Edition (Self-Hosted)**, all server inventories, telemetry time-series, diagnostic results, alerting configurations, and audit trails remain **100% on your own infrastructure** in PostgreSQL. No telemetry or operational data is ever transmitted to external servers.

---

## 6. How does the browser-based Web Terminal function securely?

When an administrator opens the Web Terminal on the Dashboard:
1. The browser initiates an authenticated WebSocket session to the Control Plane.
2. The Control Plane bridges this request across an existing secure Reverse WebSocket established by the Agent.
3. The Agent allocates a local pseudo-terminal (PTY) session (bash/sh on Linux) and streams bidirectional I/O in real time.
4. All terminal interactions are authenticated against your role and recorded in the audit log.

---

## 7. What is the difference between "Uninstall Agent & Delete" and "Delete Record Only"?

When removing a server from the Control Plane:
- **Uninstall Agent & Delete (Recommended):** Used when the server is currently Online. The Control Plane signals the Agent to gracefully stop its daemon, purge local binaries, and confirm completion before removing the server record from the dashboard.
- **Delete Record Only:** Instantly removes the server entry from the dashboard without contacting the machine. Used when the host has already been permanently decommissioned, destroyed in the cloud, or unreachable.

---

## 8. What is the resource overhead of running the Datrix Agent?

The Datrix Agent is written in Go and optimized for minimal footprint:
- Memory: Typically uses **10 MB – 15 MB** of RAM.
- CPU: Consistently consumes less than **0.5%** CPU under normal telemetry collection.
- Zero runtime dependencies: No Python, Node.js, or Java runtime is required on the host.
