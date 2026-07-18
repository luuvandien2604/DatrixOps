---
title: "Server Management"
description: "Manage servers and inspect telemetry, processes, services, and Docker containers."
role: "public"
order: 4
---

# Server Management

## Fleet list

Open **Servers** to view every connected agent, its IP address, operating system, CPU and memory values, tags, and current status. A server becomes offline when heartbeats stop beyond the configured health window.

## Server details

- **Overview:** Operating system, kernel, virtualization, uptime, and pending package updates.
- **Processes:** The processes consuming the most CPU and memory.
- **Services:** OS-native service states, startup mode, manager, search, and status filters.
- **SSH handoff:** Open the SSH action to customize username and port, copy the
  command, or hand it to a locally registered SSH client. DatrixOps does not
  collect SSH credentials or private keys.
- **Docker:** Container state, image, and actions for start, stop, restart, and logs.

Docker actions are queued for the agent and normally run on its next heartbeat. Detailed snapshots update less frequently than core CPU and memory telemetry.
