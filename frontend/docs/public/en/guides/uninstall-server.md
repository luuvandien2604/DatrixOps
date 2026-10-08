---
title: Uninstalling & Removing Servers
description: Safely uninstall the agent, clean up background services, and remove servers from Dashboard.
---

# Uninstalling & Removing Servers

When decommissioning a virtual machine, retiring a physical server, or restructuring your infrastructure, you can remove monitored servers cleanly from DatrixOps.

---

## Method 1: Remote Uninstall via Dashboard (Recommended)

If the server is currently **Online**, DatrixOps can trigger a remote self-uninstall:

1. Navigate to **Servers** (`/dashboard/servers`) and click on the target server.
2. Select the **Settings** tab.
3. Scroll down to the **Danger Zone** section.
4. Click the **Uninstall Agent & Remove Server** button.
5. In the confirmation modal, enter the server's name and confirm.

### What Happens Automatically:
- The DatrixOps server sends an uninstall directive to the agent over the secure control channel.
- The Agent stops its background service (`systemd`, `launchd`, or Windows Service).
- The Agent unregisters the service unit and purges binary files from `/usr/local/bin/datrix-agent` and configuration files from `/etc/datrix-agent`.
- The server entry and historical metrics are cleanly removed from the DatrixOps database.

---

## Method 2: Force Delete (For Decommissioned or Offline Servers)

If a virtual machine has already been destroyed, terminated in your cloud provider, or has permanently lost network connectivity, remote uninstall cannot reach the agent.

In this scenario:
1. Open the server's **Settings** tab.
2. Under the **Danger Zone**, click **Force Delete Server**.
3. Confirm the deletion prompt.
4. DatrixOps immediately removes the server record, associated network probe targets, and alerts from the database without waiting for an agent acknowledgement.

---

## Method 3: Manual Removal on the Host

If you previously deleted a server from the Dashboard or want to uninstall the agent manually from the command line:

### On Linux (systemd)

Execute the following commands as `root` (or with `sudo`):

```bash
# 1. Stop and disable the agent service
sudo systemctl stop datrix-agent
sudo systemctl disable datrix-agent

# 2. Remove the systemd service file
sudo rm -f /etc/systemd/system/datrix-agent.service
sudo systemctl daemon-reload
sudo systemctl reset-failed

# 3. Remove binary and configuration directories
sudo rm -f /usr/local/bin/datrix-agent
sudo rm -rf /etc/datrix-agent
```

### On macOS

```bash
# 1. Unload the launchd service
sudo launchctl bootout system/com.datrixops.agent

# 2. Remove configuration and service files
sudo rm -f /Library/LaunchDaemons/com.datrixops.agent.plist
sudo rm -f /usr/local/bin/datrix-agent
sudo rm -rf /etc/datrix-agent
```

### On Microsoft Windows

Open **PowerShell** as **Administrator**:

```powershell
# 1. Stop and remove the Windows Service
Stop-Service -Name DatrixAgent -ErrorAction SilentlyContinue
sc.exe delete DatrixAgent

# 2. Remove installed directory
Remove-Item -Path "C:\Program Files\DatrixAgent" -Recurse -Force
```

---

## Next Steps

- Add a replacement host via [Adding Monitored Servers](/docs/getting-started/add-server).
- Review overall cluster status on the [Dashboard Overview](/docs/features/servers).
