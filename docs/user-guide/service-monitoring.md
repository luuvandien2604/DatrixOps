---
title: "Service Monitoring"
description: "Monitor native Linux, macOS, and Windows services and customize each agent's watch list."
role: "public"
order: 7
---

# Service Monitoring

DatrixOps uses the native service manager on each operating system:

- **Linux:** systemd via `systemctl`
- **macOS:** launchd via `launchctl`, including the logged-in console user's GUI domain
- **Windows:** Service Control Manager via `sc.exe`

The Services tab shows whether each configured service is running, stopped, not
installed, or unknown. It also displays the native service identifier, startup
mode, manager, detailed state, and collection time.

The server-detail navigation and terminology follow the detected operating
system. Linux shows System Services and Cron Monitoring, macOS shows Launch
Services and Cron Jobs, and Windows shows Windows Services while omitting the
unsupported Cron tab. Older Linux-only snapshots are hidden on macOS and
Windows until the agent reports native service-manager data.

## Default service sets

When `DATRIXOPS_SERVICES` is empty, the agent uses an operating-system-specific
default set:

- Linux: common web, database, cache, container, SSH, and cron services.
- macOS: OpenSSH and common Homebrew-managed web, database, cache, and Docker labels.
- Windows: Event Log, Task Scheduler, Time, WinRM, OpenSSH, Docker, SQL Server, and PostgreSQL services.

Services that are not installed remain visible so an expected but missing
dependency is distinguishable from a stopped service.

## Customize an agent

Set `DATRIXOPS_SERVICES` to a comma-separated list of native service identifiers.
When present, this list replaces the OS defaults.

```text
# Linux
DATRIXOPS_SERVICES=nginx,postgresql,docker,ssh

# macOS launchd labels
DATRIXOPS_SERVICES=com.openssh.sshd,homebrew.mxcl.nginx,homebrew.mxcl.redis

# Windows service names
DATRIXOPS_SERVICES=EventLog,Schedule,W32Time,WinRM,sshd
```

Restart the DatrixOps Agent after changing its environment. The Services tab
will update on the next full snapshot.

The installers also accept the service list as an optional value:

```text
# Linux or macOS
<installer command> <AGENT_TOKEN> "nginx,postgresql,docker"

# Windows
.\install.ps1 -Token "<AGENT_TOKEN>" -Services "EventLog,Schedule,WinRM"
```

Use service names from the native operating system. Display names shown in
Windows Settings or a friendly application name may not be valid service
identifiers.
