---
title: Remote Web Terminal
description: Securely open a browser-based shell via reverse WebSocket without open inbound ports.
---

# Remote Web Terminal

The DatrixOps Web Terminal provides immediate, secure command-line access to any monitored Linux server directly within your web browser. Built on encrypted reverse WebSocket tunnels, the Web Terminal allows you to manage remote machines without opening inbound SSH port 22 or configuring complex bastion hosts.

---

## Why Reverse Terminal?

Traditional SSH requires:
- An open inbound port (`22`) exposed to the public Internet, creating brute-force security risks.
- Static public IP addresses, VPN tunnels, or jumping through bastion hosts.

**The DatrixOps Reverse WebSocket Architecture:**
1. You request a terminal session from the DatrixOps Dashboard.
2. The DatrixOps control plane notifies the running Agent via its active control channel.
3. The Agent allocates a pseudo-terminal (`pty`) on the host and initiates an **outbound** encrypted WebSocket connection back to the control plane.
4. Your browser connects to this session, providing a smooth, responsive terminal experience with full interactivity.

```
[ Browser (xterm.js) ] <─── WSS ───> [ DatrixOps Server ] <─── Outbound WSS ─── [ Host PTY Shell ]
```

---

## Opening a Terminal Session

1. Sign in to your DatrixOps Dashboard.
2. Navigate to **Servers** and click on the target Linux server.
3. In the server details tab bar, select **Web Terminal**.
4. Click the **Connect Terminal** button.
5. Within 1 to 2 seconds, a high-performance terminal emulator (`xterm.js`) renders inside your browser, greeting you with the server's command prompt.

---

## Key Terminal Features

- **Full PTY Interaction**: Supports all interactive shell commands, including `top`, `htop`, `vim`, `nano`, `less`, and curses-based utilities.
- **Dynamic Window Resizing**: Automatically syncs terminal columns and rows when you resize your browser window or enter full-screen mode.
- **Copy & Paste Support**: Standard clipboard shortcuts (`Ctrl+Shift+V` / `Cmd+V`) work seamlessly.
- **ANSI Color & Font Rendering**: High-contrast, crystal-clear typography with true color and UTF-8 unicode support.
- **Clean Disconnect**: Ending a session or closing the browser tab immediately sends a cleanup signal to the host, ensuring no orphaned processes are left behind.

---

## Security & Best Practices

- **Zero Inbound Firewall Exposure**: Keep port `22` closed entirely on your public cloud firewalls or security groups.
- **Encrypted In-Flight**: All keystrokes and output streams are encrypted using TLS (`wss://`).
- **Audit Trail Logging**: Each terminal session creation and disconnect event is logged in **Team Access → Audit Trail** (`/dashboard/manage/audit`), noting the requesting user, server ID, and session timestamp.
- **Role-Based Permissions**: Only authorized administrators and operators can initiate remote terminal sessions.

> [!NOTE]
> Web Terminal sessions currently run under the execution context of the `datrix-agent` service daemon on Linux. Ensure only trusted administrators have access to your DatrixOps deployment.

---

## Next Steps

- Inspect system daemons in [Server & Resource Monitoring](/docs/features/servers).
- Monitor automated background tasks in [Cron Execution Telemetry](/docs/features/cron-monitoring).
