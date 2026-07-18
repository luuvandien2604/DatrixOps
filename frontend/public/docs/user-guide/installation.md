# Agent Installation Guide

The DatrixOps Agent is a lightweight service that collects CPU, memory, disk, and network telemetry and sends it to the dashboard.

## 1. System and firewall requirements

- **Firewall:** You do not need to open an inbound port on the monitored server. The agent uses outbound internet access to reach the dashboard over port 443 or 80.
- **Operating systems:** Linux distributions such as Ubuntu, CentOS, and Debian, plus Windows Server.

## 2. Installation

1. Sign in to the DatrixOps Dashboard.
2. Open **Server Management**.
3. Select **Add Server** and enter a recognizable server name.
4. Choose the appropriate operating system in the installation dialog.
5. Copy the generated command, paste it into the server's terminal or PowerShell session, and run it.

Linux installation requires `root` privileges. On Windows, run PowerShell as `Administrator`.

## 3. Restarting or updating

The installer configures systemd on Linux or Task Scheduler on Windows so the agent runs in the background and starts with the operating system.

To update the agent, generate or copy the installation command again and run it on the server. The installer safely downloads the current binary, replaces the previous version, and restarts the service.
