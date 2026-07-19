---
title: "Server Management"
description: "Manage servers and inspect telemetry, processes, services, and Docker containers."
role: "public"
order: 4
---

# Server Management

## Fleet list

Open **Servers** to view every connected agent, its public IP address,
operating system, CPU, memory, system-disk usage, tags, and current status. The
public IP is synchronized from the latest full agent snapshot and remains
visible while the agent is offline. A server becomes offline when heartbeats
stop beyond the configured health window.

## Server details

- **Overview:** Operating system, kernel, virtualization, uptime, system-volume
  capacity and usage, and pending package updates.
- **Processes:** Current system-wide CPU and RAM totals plus the processes
  consuming the most resources.
- **Services:** OS-native service states, startup mode, manager, search, and status filters.
- **Web Terminal:** Open an interactive shell for Linux server agents through
  the agent's outbound reverse WebSocket channel. No inbound SSH port,
  credential, or private key is required. Starting a shell always requires an
  explicit confirmation; tickets are single-use, sessions expire after 30
  minutes, and operator/server/session traffic metadata is audited. macOS,
  Windows, and desktop/personal Linux agents are intentionally disabled because
  service accounts do not represent the signed-in desktop user session. Agent
  version 1.4.1 or newer is required.
- **Docker:** Container state, image, and actions for start, stop, restart, and logs.

Docker actions are queued for the agent and normally run on its next heartbeat. Detailed snapshots update less frequently than core CPU and memory telemetry.
