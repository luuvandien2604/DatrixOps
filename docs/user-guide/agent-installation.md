---
title: "Agent Installation"
description: "Install and activate the DatrixOps Agent on a server."
role: "public"
order: 2
---

# Agent Installation

The DatrixOps Agent collects system telemetry and sends it securely to the dashboard.

## Install an agent

1. Sign in to DatrixOps.
2. Open **Servers** and select **Add Server**.
3. Enter a recognizable server name.
4. Select Linux, macOS, or Windows.
5. Copy the generated installation command.
6. Run it with `root` privileges on Linux/macOS or as `Administrator` on Windows.

The command contains a unique Agent Token. Treat it as a secret.

## Confirm the connection

Return to **Servers**. The server should become **Online** after its first successful heartbeat. If it remains offline, verify outbound access to the dashboard and inspect the agent service logs.

For service commands and removal steps, see [Agent Service Management](/docs/agent-service-management).
To replace the operating-system-specific service watch list, see
[Service Monitoring](/docs/service-monitoring).
