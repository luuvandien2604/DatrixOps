---
title: "What is DatrixOps?"
description: "Learn the architecture, components, supported Agent platforms, and system requirements for DatrixOps."
---

DatrixOps is a control plane for monitoring and operating servers. It brings CPU, memory, disk, network, process, service, and Docker visibility into one dashboard instead of requiring an individual login to every host.

## Problems DatrixOps solves

- Identify which machines are online or have stopped sending heartbeats.
- Review real telemetry over time and preserve gaps while an Agent is offline.
- Inspect inventory, processes, native services, and containers remotely.
- Create CPU, memory, or offline alerts delivered through Telegram or Discord.
- Monitor websites, HTTPS state, and certificate lifetime.
- Distribute approved Agent releases from the control plane.

## Core components

| Component | Responsibility |
|---|---|
| Dashboard | Web interface for telemetry and explicitly approved operations. |
| Backend API | Authentication, heartbeats, storage, task queues, and schedulers. |
| PostgreSQL | Servers, metrics, tasks, alerts, websites, and audit data. |
| Agent | A Go binary that runs on each monitored host and connects outbound. |

The Agent sends regular heartbeats over HTTPS. The Backend returns pending tasks in the heartbeat response, and the Agent validates and executes supported task types. Basic monitoring therefore does not require an inbound port on the managed host.

> **Important:** Every server has a unique Agent Token. It identifies the server during heartbeat authentication and must be protected like a password.

## Supported Agent platforms

Current releases produce artifacts for:

- Linux `amd64` and `arm64`.
- macOS Intel (`amd64`) and Apple Silicon (`arm64`).
- Windows `amd64`.

Features vary by operating system. Linux uses systemd, macOS uses launchd, and Windows uses Service Control Manager. The Dashboard currently enables Web Terminal only for eligible Linux servers; macOS, Windows, and desktop/personal Linux machines are disabled by policy.

## System requirements

The Agent host needs:

1. Outbound HTTPS access to DatrixOps.
2. `root` privileges on Linux/macOS or Administrator privileges on Windows for installation.
3. A supported CPU architecture.
4. An accurate system clock for TLS and timeline data.

The Dashboard requires a modern browser with JavaScript and local storage. Docker data requires an available Docker CLI/daemon. Native service data depends on the operating system service manager.

> **Note:** Some Network, Performance, Security, and Logs areas remain in development. Public documentation does not describe placeholder screens as completed features.

