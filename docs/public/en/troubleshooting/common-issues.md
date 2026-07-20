---
title: "Troubleshooting"
description: "Diagnose offline Agents, missing data, version errors, failed updates, permissions, and networking."
---

Start with three facts: is the Agent service running, what do its logs report, and can the host reach DatrixOps?

## Agent is offline

Linux:

```bash
sudo systemctl status datrixops-agent
sudo journalctl -u datrixops-agent -n 200 --no-pager
curl -I https://datrixops.vandien.space
```

macOS:

```bash
sudo launchctl print system/com.datrixops.agent
tail -n 200 /var/log/datrixops-agent.log
```

Windows PowerShell:

```powershell
Get-ScheduledTask -TaskName "DatrixOpsAgent"
Get-Content "C:\Program Files\DatrixOps\agent.log" -Tail 200
```

A heartbeat `401` normally means the Agent Token does not match; it is not a browser JWT error.

## Server is missing or has no IP

Confirm the correct account/workspace and make sure installation used the token for that server record. IP and inventory arrive in a detailed snapshot, so allow another snapshot cycle after the first heartbeat.

## Wrong version or no update notice

The UI version must come from a heartbeat. Restart the Agent and inspect its startup log. If the latest version is wrong, an administrator must verify the running Backend `AGENT_VERSION` and published release. Rebuilding the Frontend is not always required for a version-only change, but artifact serving depends on the deployment image/volume.

## Update failed or is stuck

1. Read the task state in Overview instead of relying on a toast.
2. Wait for task timeout and stale-task cleanup.
3. Search Agent logs for `manifest`, `signature`, `checksum`, `permission`, or restart failures.
4. Verify `/releases/<version>/manifest.json`, `manifest.sig`, and the artifact are reachable.
5. For a legacy Agent, perform the one-time update described in [Versions and updates](/docs/en/agent-management/updates).

## Permission denied or service failure

The installer needs root/Administrator privileges. Check binary ownership and executable permissions on Linux/macOS, then inspect native service logs. Repeated reinstall attempts can hide the original failure.

## Network timeout and firewall

Allow outbound DNS and HTTPS to DatrixOps. Reverse terminal also requires WebSocket upgrade support through the reverse proxy. Check whether an enterprise proxy blocks WebSockets or replaces TLS certificates.

## Chart gaps

Gaps while an Agent is offline are intentional: DatrixOps does not draw an invented line between missing samples. If the Agent is online, inspect heartbeat errors and system time. Process/service snapshots update less frequently than basic metrics.

## Collect logs for a report

Include OS/architecture, startup Agent version, time and timezone, redacted task state, and a short relevant log excerpt. Never include an Agent Token, JWT, private signing key, database URL, or complete environment file.

