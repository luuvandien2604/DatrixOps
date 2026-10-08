---
title: Server & Resource Monitoring
description: Real-time CPU, RAM, disk, network metrics, system services, and Docker containers.
---

# Server & Resource Monitoring

DatrixOps gives you immediate, granular visibility into the health and performance of your entire server fleet. From high-level fleet overviews to in-depth hardware telemetry, process inventories, and container states, you can monitor and manage your servers directly from your browser.

---

## The Servers Fleet View

Navigate to **Servers** (`/dashboard/servers`) in the sidebar navigation to view your entire server roster.

### Fleet Summary Bar
At the top of the page, quick statistics summarize your fleet status:
- **Total Servers**: Count of all enrolled machines.
- **Online Servers**: Machines actively reporting telemetry within the heartbeat interval (30 seconds).
- **Offline / Stale Servers**: Machines that have missed heartbeat reports.

### Search and Filters
- **Filter by Status**: Quickly toggle between `All`, `Online`, and `Offline` servers.
- **Search Bar**: Filter servers instantly by hostname, IP address, or assigned tag.
- **Sort**: Order machines by highest CPU load, memory pressure, disk capacity, or alphabetical name.

---

## Server Detail View

Click on any server card or row to open its dedicated **Server Details** page (`/dashboard/servers/[id]`).

### 1. Overview Tab
The **Overview** tab provides real-time telemetry updated continuously:

- **System Summary**:
  - Operating system distribution, release version, and Linux kernel version.
  - System Uptime (e.g., `42 days, 6 hours`).
  - System Load Averages (`1 min`, `5 min`, `15 min`).
  - CPU architecture, processor model, and core count.
- **Hardware Telemetry Gauges & Charts**:
  - **CPU Utilization (%)**: Aggregated percentage and breakdown per core.
  - **Memory Usage (RAM)**: Real-time active memory, cached memory, and swap space.
  - **Disk Storage**: Capacity breakdown per mounted filesystem (`/`, `/var`, `/home`, etc.) displaying used bytes, free bytes, and utilization percentage.
  - **Network Throughput**: Interface-level inbound (Rx) and outbound (Tx) data transfer rates in KB/s or MB/s, along with packet drop and error counters.

---

## Managing System Services

Click the **Services** tab inside any server view to inspect system daemons (managed via `systemd` on Linux).

### What You Can Do
- **Service Search**: Quickly find any daemon (e.g., `nginx`, `docker`, `mysql`, `sshd`).
- **Live Status**: See whether each service is `Active (running)`, `Inactive (dead)`, or in an error state.
- **Safe Control Actions**:
  - **Start**: Launch a stopped service.
  - **Stop**: Gracefully terminate a service.
  - **Restart**: Safely restart the service daemon.

> [!WARNING]
> Restarting or stopping critical network or system services (such as `ssh` or networking daemons) may temporarily disrupt remote connectivity. Perform service actions carefully.

---

## Docker Container Tracking

If the monitored host has Docker installed and running, the **Docker** tab automatically activates and inventories all local containers.

### Container Metrics
- **Container Name & ID**: Quick identification and container image tag.
- **State**: `running`, `paused`, `restarting`, or `exited`.
- **Resource Usage**:
  - Live CPU percentage consumed by the container.
  - Memory usage vs. assigned memory limits.
- **Uptime**: Time elapsed since the container was started.

---

## Server Settings & Metadata

Click the **Settings** tab to adjust server configuration:
- **Display Name**: Rename the server to match your internal naming convention.
- **Server Tags**: Assign categorization tags (e.g., `production`, `database`, `singapore`) to enable bulk filtering and network diagnostics grouping.
- **Agent Version Information**: Check the currently running agent version and update status.

---

## Next Steps

- Measure network connectivity and gateway uplink in [Network Quality Diagnostics](/docs/features/network-quality).
- Configure threshold triggers in [Alerts & Notifications](/docs/features/alerts).
- Launch an interactive terminal via [Remote Web Terminal](/docs/features/web-terminal).
