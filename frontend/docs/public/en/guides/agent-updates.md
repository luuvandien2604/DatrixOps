---
title: Updating the Agent
description: Upgrade agents automatically from the Dashboard or manually with CLI commands.
---

# Updating the Agent

DatrixOps makes it effortless to keep your monitored servers up to date with the latest features, security enhancements, and diagnostic improvements. You can trigger updates for individual machines or upgrade your entire server fleet in bulk with a single click.

---

## How Agent Updates Work

DatrixOps uses a secure, atomic update workflow:

1. **Update Notification**: The DatrixOps control plane notifies connected agents that a newer version is available.
2. **Cryptographic Verification**: The agent downloads the new binary and verifies its **SHA-256 checksum** and **Ed25519 digital signature** to prevent tampering.
3. **Atomic Replacement**: The running binary is replaced on disk. If verification fails, the update aborts without disrupting the running service.
4. **Graceful Restart**: The agent restarts its system service (`systemd`, `launchd`, or Windows Service) and reconnects to the dashboard within seconds.

---

## Method 1: One-Click Update from the Dashboard

### Updating a Single Server
1. Navigate to **Servers** (`/dashboard/servers`).
2. If an update is available, an **Update Available** badge appears next to the server's version.
3. Click on the server to open its **Server Details** page.
4. In the upper action bar, click the **Update Agent** button.
5. The agent status will temporarily show **Updating…** and return to **Online** with the new version number within 10 to 15 seconds.

### Bulk Updating the Entire Fleet
1. Open the **Servers** page (`/dashboard/servers`).
2. When multiple agents have pending updates, an **Update All Agents** button appears in the top-right toolbar.
3. Click **Update All Agents** and confirm the dialog.
4. The control plane dispatches update commands across all connected agents in rolling batches, preventing server load spikes.

---

## Method 2: Manual Update via Command Line

If you manage a server manually or need to update an agent that has lost connection:

### On Linux
Run the update subcommand directly:

```bash
sudo datrix-agent update
```

Alternatively, you can re-run the one-line installer command from your server's **Add Server** modal. It will detect the existing configuration, overwrite the binary, and restart the `systemd` service cleanly.

### On macOS
Open Terminal and run:

```bash
sudo datrix-agent update
```

### On Windows
Open PowerShell as Administrator and run:

```powershell
datrix-agent.exe update
```

---

## Verifying the Update

After upgrading, confirm the new version is active:

### On the Dashboard
Refresh the **Servers** page and verify that the version string matches the latest release and the update badge has disappeared.

### On the Monitored Host
Run the version check command:

```bash
datrix-agent version
```

---

## Next Steps

- If an update fails or an agent remains offline, consult [Troubleshooting](/docs/troubleshooting/common-issues).
- Learn how to safely remove machines in [Uninstalling & Removing Servers](/docs/guides/uninstall-server).
