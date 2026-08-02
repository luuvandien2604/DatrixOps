---
title: "Read the Dashboard"
description: "Understand server states and CPU, memory, disk, and network metrics in DatrixOps."
---

The Dashboard summarizes real Agent heartbeats and data stored in PostgreSQL. DatrixOps does not generate synthetic metrics when there is no Agent or recent heartbeat.

## Server states

- **Online:** the Backend received a heartbeat inside the current presence window.
- **Offline:** heartbeats are no longer recent enough. Historical data remains available.
- **Degraded:** this is not yet a normalized server state in the Backend. Resource alerts and feature-specific failures are shown separately, so **Online** does not mean every service is healthy.

When an Agent is offline, charts should keep advancing in real time while leaving the missing interval empty. This makes the loss and return of metrics visible.

## CPU, memory, disk, and network

| Metric | Interpretation |
|---|---|
| CPU | Whole-system CPU percentage at the heartbeat. Evaluate short spikes with the surrounding trend. |
| Memory | Used memory compared with the total reported by the Agent. |
| Disk | Used capacity on the system disk; this is different from Disk I/O. |
| Network | Inbound/outbound bytes or throughput derived from consecutive samples. |
| Disk I/O | Read/write activity rather than capacity percentage. |

> **Note:** A reported value of `0` is different from a missing point. A gap means no metric was received; zero is a real Agent report.

## Server list

**Servers** shows the name, last known IP, OS/specification, CPU, memory, disk, status, and quick actions. Select the server row/card to open its details. The last snapshot can preserve an IP while the Agent is offline.

## Server details

- **Overview:** OS, Agent version, kernel, virtualization, uptime, package updates, and system disk.
- **Inventory:** hardware and software information collected by the Agent.
- **Cron Monitoring:** available on supported platforms.
- **Processes:** whole-system CPU/memory totals and top consumers.
- **System/Windows/Launch Services:** native services for the detected OS.
- **Docker/Containers:** container state and supported actions when Docker is available.
- **Terminal:** reverse terminal subject to server eligibility and security policy.

## Refresh timing

The Agent sends heartbeats according to `DATRIXOPS_INTERVAL`; standard installers currently leave it at the Agent default. Detailed snapshots are sent roughly every 60 seconds. Remote tasks are delivered through heartbeat polling, so not every action responds immediately.

