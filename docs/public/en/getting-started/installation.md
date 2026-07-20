---
title: "Install the Agent"
description: "Install, verify, and remove the DatrixOps Agent on Linux, macOS, and Windows."
---

The objective is to run the Agent under the native service manager so it starts automatically after a reboot.

## Install on Linux

Copy the tokenized command from **Servers → Add Server**. Its structure is:

```bash
curl -sL https://datrixops.vandien.space/install.sh | sudo bash -s -- "<AGENT_TOKEN>"
```

The installer detects `x86_64/amd64` or `aarch64/arm64`, installs `/usr/local/bin/datrixops-agent`, creates `datrixops-agent.service`, enables it, and restarts the service.

Verify:

```bash
sudo systemctl status datrixops-agent
sudo journalctl -u datrixops-agent -n 100 --no-pager
```

## Install on macOS

Run the command provided by the Dashboard:

```bash
curl -sL https://datrixops.vandien.space/install-mac.sh | sudo bash -s -- "<AGENT_TOKEN>"
```

The installer supports Intel and Apple Silicon, creates the `com.datrixops.agent` LaunchDaemon, and writes logs to `/var/log/datrixops-agent.log`.

```bash
sudo launchctl print system/com.datrixops.agent
tail -n 100 /var/log/datrixops-agent.log
```

## Install on Windows

Open PowerShell with **Run as Administrator**, download the Dashboard-provided script, and pass the token:

```powershell
.\install.ps1 -Token "<AGENT_TOKEN>"
Get-ScheduledTask -TaskName "DatrixOpsAgent"
```

The Agent is installed in `C:\Program Files\DatrixOps` and runs as a Scheduled Task under `SYSTEM`.

> **Tip:** Prefer the command shown in the Add Server dialog. It already contains the correct server token; commands here show only the safe structure.

## Customize monitored services

The optional services argument replaces the operating-system defaults:

```bash
curl -sL https://datrixops.vandien.space/install.sh | sudo bash -s -- "<AGENT_TOKEN>" "nginx,postgresql,docker"
```

```powershell
.\install.ps1 -Token "<AGENT_TOKEN>" -Services "EventLog,Schedule,WinRM"
```

## Confirm the connection

1. Return to **Servers**.
2. Wait for **Online**.
3. Open the server and check **Running Agent Version**.
4. Confirm that CPU, memory, and disk contain data.

Process, service, and Docker snapshots update less often than the basic heartbeat and may take another snapshot cycle to appear.

## Uninstall the Agent

Linux:

```bash
sudo systemctl disable --now datrixops-agent
sudo rm -f /etc/systemd/system/datrixops-agent.service /usr/local/bin/datrixops-agent
sudo systemctl daemon-reload
```

macOS:

```bash
sudo launchctl bootout system /Library/LaunchDaemons/com.datrixops.agent.plist
sudo rm -f /Library/LaunchDaemons/com.datrixops.agent.plist /usr/local/bin/datrixops-agent
```

Windows PowerShell Administrator:

```powershell
Unregister-ScheduledTask -TaskName "DatrixOpsAgent" -Confirm:$false
Remove-Item "C:\Program Files\DatrixOps" -Recurse -Force
```

Uninstalling the Agent does not delete historical Dashboard data. Delete the server record separately if it is no longer needed.

## Common installation errors

- **Permission denied:** use `sudo` or an Administrator PowerShell session.
- **Unsupported architecture:** check `uname -m`; Windows ARM is not currently published.
- **Network timeout/TLS:** check DNS, proxy, firewall, CA certificates, and system time.
- **Service does not start:** inspect the native service logs before reinstalling.
- **Invalid token:** use the original command for that server instead of guessing or reusing another token.

