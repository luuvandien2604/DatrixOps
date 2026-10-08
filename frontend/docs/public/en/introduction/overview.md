---
title: Overview & Capabilities
description: What is DatrixOps, supported platforms, and how the platform works.
---

# Overview & Capabilities

DatrixOps is an all-in-one infrastructure monitoring and operations platform designed for system administrators, DevOps engineers, and server operators. It provides centralized visibility into Linux, macOS, and Windows servers, Docker containers, network uplink health, website availability, and cron execution telemetry—all managed from a sleek web dashboard.

Whether you manage a single virtual private server (VPS) or a hybrid multi-cloud fleet of hundreds of bare-metal machines, DatrixOps gives you immediate insights without complex configuration.

---

## Key Capabilities

### 1. Unified Server & Resource Monitoring
- **Real-Time Telemetry**: Monitor CPU utilization, RAM usage, storage volume capacity, and network interface throughput (Rx/Tx).
- **Service Management**: Inspect and manage system services (systemd on Linux, Services on Windows) directly from the browser.
- **Docker Inventory**: Track running container states, CPU/memory consumption, and uptime without connecting to SSH.

### 2. Network Quality Diagnostics
- **Multi-Target Probing**: Run automated ICMP ping and TCP socket latency checks against local gateways, telco DNS, and international targets.
- **Dynamic Tag Grouping**: Categorize network probes into custom tags (e.g., `Domestic`, `International`, `DNS`, `Database`).
- **Packet Loss & Jitter Detection**: Pinpoint routing bottlenecks, ISP peering drops, and uplink packet degradation before users report downtime.

### 3. Website & SSL Monitoring
- **Uptime Tracking**: Continuous availability checks for HTTP and HTTPS web endpoints.
- **SSL Certificate Expiration Alerts**: Automatically track TLS/SSL certificate validity and receive warnings well before certificates expire.
- **Response Latency Auditing**: Measure DNS lookup, TLS handshake, and HTTP response time across all endpoints.

### 4. Incident Alerts & Multi-Channel Notifications
- **Granular Thresholds**: Define customizable alert triggers for high CPU/RAM/Disk consumption or sudden server offline events.
- **Instant Dispatch**: Receive notifications immediately via Telegram, Discord, and Email.
- **Smart Muting & Cooldowns**: Avoid notification floods during temporary maintenance windows.

### 5. Secure Remote Web Terminal
- **Zero Inbound Ports**: Open a full-featured terminal directly in the web browser using secure reverse WebSocket channels.
- **No Direct SSH Exposure**: Manage headless servers behind NAT, private firewalls, or dynamic IP addresses safely.
- **Role-Based Access**: Restrict terminal access to authorized team members with audit logging.

### 6. Scheduled Task & Cron Telemetry
- **Cron Job History**: Track the execution start time, duration, and exit status (success/failure) of automated scripts.
- **Failure Visibility**: Catch failing backup scripts and background cron jobs before silent errors disrupt operations.

---

## Architecture at a Glance

DatrixOps consists of two core components:

```
[ DatrixOps Dashboard & Control Plane ]
           │               ▲
           │ Encrypted     │ Outbound Telemetry
           │ Control       │ (HTTPS / WSS)
           ▼               │
  ┌───────────────────────────────────┐
  │         DatrixOps Agent           │
  │   (Linux / macOS / Windows)       │
  └───────────────────────────────────┘
```

1. **Control Plane (Server)**:
   - Houses the web dashboard, SQLite database, alerting engine, and time-series metric collector.
   - Self-hosted on your own server or deployed via Docker Compose.
   - Exposes clean HTTP and WebSocket APIs.

2. **DatrixOps Agent**:
   - A lightweight, high-performance Go binary running on each monitored host.
   - Collects system metrics, executes scheduled network probes, and establishes an outbound reverse connection.
   - Requires minimal CPU (< 0.5%) and RAM (< 20 MB).
   - Never requires open inbound firewall ports.

---

## Supported Operating Systems

| Operating System | Architecture | Installation Method |
| :--- | :--- | :--- |
| **Ubuntu Linux** (20.04, 22.04, 24.04+) | x86_64 (amd64), ARM64 | One-line shell script (systemd) |
| **Debian Linux** (11, 12+) | x86_64 (amd64), ARM64 | One-line shell script (systemd) |
| **CentOS / RHEL / Rocky / AlmaLinux** (8, 9+) | x86_64 (amd64), ARM64 | One-line shell script (systemd) |
| **Alpine Linux** | x86_64 (amd64), ARM64 | Docker container or OpenRC |
| **macOS** (12 Monterey, 13 Ventura, 14 Sonoma+) | Apple Silicon (arm64), Intel (x86_64) | One-line shell script (launchd) |
| **Microsoft Windows** (10, 11, Server 2019/2022) | x86_64 (amd64) | PowerShell script (Windows Service) |

---

## Next Steps

- Proceed to the [Quickstart Deployment](/docs/getting-started/quickstart) guide to launch your DatrixOps server instance.
- Learn how to connect your first server in [Adding Monitored Servers](/docs/getting-started/add-server).
