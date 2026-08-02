---
title: "Servers and remote access"
description: "Manage server metadata, native services, Docker, offline hosts, and Web Terminal safely."
---

## Rename and organize servers

Open a server, edit supported metadata such as name, group, tags, provider, region, or environment, and save. These values belong to the DatrixOps record; they do not change the operating-system hostname.

## Inspect system information

The **Overview** tab combines snapshot and heartbeat data for OS, kernel, virtualization, uptime, Agent version, package updates, and disk. When the Agent is offline, the latest information may remain visible but is not live.

## Manage an offline server

1. Check the last heartbeat time and Agent logs.
2. Avoid repeatedly creating update or service actions while the Agent cannot receive them.
3. Restore DNS, outbound HTTPS, or the Agent service on the host.
4. Delete the server only when its history and registration token are no longer needed.

Deleting a server removes dependent database records such as metrics and tasks. It is separate from uninstalling the Agent binary on the host.

## Native services

DatrixOps accepts only service identifiers previously reported by the Agent; it does not accept arbitrary shell commands through service controls. Linux uses `systemctl`, macOS uses `launchctl`, and Windows uses `sc.exe`. Start, Stop, Restart, and Reload vary by OS, and Windows has no generic reload operation.

The DatrixOps Agent service is protected from these controls to prevent an accidental disconnect.

## Docker

When Docker is available, the Dashboard can queue start, stop, restart, and recent-log tasks. The task runs after the Agent receives it through a heartbeat and only if the Docker CLI can access the daemon.

## Web Terminal

Web Terminal uses an outbound Agent WebSocket. DatrixOps does not require an SSH password/private key or an inbound SSH port. A user must explicitly confirm the session; tickets are single-use, only one session may be active for a server, and a session is limited to 30 minutes.

The Dashboard enables Web Terminal for headless Linux servers, even when the host retains `graphical.target` without an active desktop session. macOS, Windows, and Linux hosts with an active display manager or X11/Wayland session are disabled because the service account does not represent the signed-in desktop user.

> **Warning:** The shell runs with the identity of the Agent service—commonly `root` on Linux. Commands can change the whole system. Restrict DatrixOps access and close the session immediately after use.

For `AGENT_UNAVAILABLE`, verify Agent presence, the minimum Agent version, terminal-channel state, and reverse-proxy WebSocket upgrades. See [Troubleshooting](/docs/en/troubleshooting/common-issues).
