---
title: "Agent Service Management"
description: "Inspect, stop, restart, or remove the agent on Linux, macOS, and Windows."
role: "admin"
order: 11
---

# Agent Service Management

## Linux

```bash
sudo systemctl status datrixops-agent
sudo journalctl -u datrixops-agent -n 100
sudo systemctl restart datrixops-agent
sudo systemctl stop datrixops-agent
```

To remove the service:

```bash
sudo systemctl disable --now datrixops-agent
sudo rm -f /etc/systemd/system/datrixops-agent.service
sudo rm -f /usr/local/bin/datrixops-agent
sudo systemctl daemon-reload
```

## macOS

The launch daemon label is `com.datrixops.agent`.

```bash
sudo launchctl print system/com.datrixops.agent
sudo launchctl kickstart -k system/com.datrixops.agent
sudo launchctl bootout system /Library/LaunchDaemons/com.datrixops.agent.plist
```

## Windows

Run PowerShell as Administrator. The scheduled task is named `DatrixOpsAgent`.

```powershell
Get-ScheduledTask -TaskName "DatrixOpsAgent"
Start-ScheduledTask -TaskName "DatrixOpsAgent"
Stop-ScheduledTask -TaskName "DatrixOpsAgent"
Unregister-ScheduledTask -TaskName "DatrixOpsAgent" -Confirm:$false
```

Stopping or removing an agent does not delete historical telemetry. To remove the server record as well, delete it separately from **Servers**.
